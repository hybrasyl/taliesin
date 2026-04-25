import { MapFile } from '@eriscorp/dalib-ts'
import { createNoise2D } from 'simplex-noise'
import type { TileAtlas, BgFamily, WallFamily } from './tileThemeTypes'

// ── Seeded PRNG (mulberry32) ────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Pick a random tile from a family, weighted by frequency in the atlas. */
function pickTile(family: BgFamily, atlas: TileAtlas, rng: () => number): number {
  const tiles = family.tiles
  if (tiles.length === 0) return 0

  // Build cumulative weights from frequency
  const weights: number[] = []
  let total = 0
  for (const t of tiles) {
    const freq = atlas.bgFrequency[String(t)] ?? 1
    total += freq
    weights.push(total)
  }

  const r = rng() * total
  for (let i = 0; i < weights.length; i++) {
    if (r < weights[i]) return tiles[i]
  }
  return tiles[tiles.length - 1]
}

/** Pick a tile that is a known neighbor of the given context tiles, from within `family`. */
function pickAdjacentTile(
  contextTiles: number[],
  family: BgFamily,
  atlas: TileAtlas,
  rng: () => number
): number {
  const familySet = new Set(family.tiles)

  // For each context tile, collect neighbor weights within this family
  // A tile that is a known neighbor of ALL context tiles gets the highest score
  const scores = new Map<number, number>()

  for (const adj of contextTiles) {
    if (adj === 0) continue
    const neighbors = atlas.bgAdjacency[String(adj)]
    if (!neighbors) continue
    for (const [nId, count] of Object.entries(neighbors)) {
      const id = Number(nId)
      if (familySet.has(id)) {
        scores.set(id, (scores.get(id) ?? 0) + count)
      }
    }
  }

  if (scores.size === 0) return pickTile(family, atlas, rng)

  // Weighted random from scored candidates
  const candidates = [...scores.entries()]
  let total = 0
  for (const [, w] of candidates) total += w
  const r = rng() * total
  let acc = 0
  for (const [tile, w] of candidates) {
    acc += w
    if (r < acc) return tile
  }
  return candidates[candidates.length - 1][0]
}

/** Pick a random wall pair from a family, weighted by frequency. */
function pickWallPair(family: WallFamily, rng: () => number): [number, number] {
  if (family.pairs.length === 0) return [0, 0]
  // Simple uniform random for now (pair-level frequency not stored individually)
  const idx = Math.floor(rng() * family.pairs.length)
  return family.pairs[idx]
}

// ── Terrain params ──────────────────────────────────────────────────────────

export interface TerrainParams {
  width: number
  height: number
  seed: number
  // Noise
  scale: number
  octaves: number
  persistence: number
  lacunarity: number
  // Family selection
  primaryFamilyIdx: number
  secondaryFamilyIdx: number
  secondaryThreshold: number // noise value where secondary takes over
  // Walls
  wallFamilyIdx: number
  wallDensity: number // 0-1, fraction of tiles that get walls
  wallThreshold: number // noise threshold for wall placement
}

export const TERRAIN_DEFAULTS = {
  scale: 0.06,
  octaves: 3,
  persistence: 0.5,
  lacunarity: 2.0,
  secondaryThreshold: 0.55,
  wallDensity: 0.05,
  wallThreshold: 0.75
}

// ── Dungeon params ──────────────────────────────────────────────────────────

export interface DungeonParams {
  width: number
  height: number
  seed: number
  roomCount: number
  minRoomSize: number
  maxRoomSize: number
  corridorWidth: number
  // Family selection
  floorFamilyIdx: number
  wallFamilyIdx: number
  corridorFamilyIdx: number
}

export const DUNGEON_DEFAULTS = {
  roomCount: 8,
  minRoomSize: 4,
  maxRoomSize: 12,
  corridorWidth: 1
}

// ── Noise Terrain Generator ─────────────────────────────────────────────────

export function generateTerrain(params: TerrainParams, atlas: TileAtlas): MapFile {
  const {
    width,
    height,
    seed,
    scale,
    octaves,
    persistence,
    lacunarity,
    primaryFamilyIdx,
    secondaryFamilyIdx,
    secondaryThreshold,
    wallFamilyIdx,
    wallDensity,
    wallThreshold
  } = params

  const primaryFamily = atlas.bgFamilies[primaryFamilyIdx]
  const secondaryFamily = atlas.bgFamilies[secondaryFamilyIdx]
  const wallFamily = wallFamilyIdx >= 0 ? atlas.wallFamilies[wallFamilyIdx] : null

  if (!primaryFamily || !secondaryFamily) {
    return new MapFile(width, height)
  }

  const rng = mulberry32(seed)
  const noise2D = createNoise2D(rng)
  const wallNoise2D = createNoise2D(rng)
  const map = new MapFile(width, height)

  // First pass: assign background tiles
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Multi-octave noise
      let amplitude = 1
      let frequency = scale
      let noiseVal = 0
      let maxAmplitude = 0

      for (let o = 0; o < octaves; o++) {
        noiseVal += amplitude * noise2D(x * frequency, y * frequency)
        maxAmplitude += amplitude
        amplitude *= persistence
        frequency *= lacunarity
      }
      noiseVal = (noiseVal / maxAmplitude + 1) / 2 // normalize to [0, 1]

      // Pick family based on threshold
      const family = noiseVal < secondaryThreshold ? primaryFamily : secondaryFamily

      // Pick tile using adjacency to both left and above neighbors
      const context: number[] = []
      if (x > 0) context.push(map.getTile(x - 1, y).background)
      if (y > 0) context.push(map.getTile(x, y - 1).background)
      const bg =
        context.length > 0
          ? pickAdjacentTile(context, family, atlas, rng)
          : pickTile(family, atlas, rng)

      // Wall placement via separate noise
      let lfg = 0,
        rfg = 0
      if (wallFamily && wallDensity > 0) {
        const wallNoise = (wallNoise2D(x * scale * 1.5, y * scale * 1.5) + 1) / 2
        if (wallNoise > wallThreshold) {
          ;[lfg, rfg] = pickWallPair(wallFamily, rng)
        }
      }

      map.setTile(x, y, { background: bg, leftForeground: lfg, rightForeground: rfg })
    }
  }

  return map
}

// ── Room-and-Corridor Dungeon Generator ─────────────────────────────────────

interface Room {
  x: number
  y: number
  w: number
  h: number
  cx: number
  cy: number
}

export function generateDungeon(params: DungeonParams, atlas: TileAtlas): MapFile {
  const {
    width,
    height,
    seed,
    roomCount,
    minRoomSize,
    maxRoomSize,
    corridorWidth,
    floorFamilyIdx,
    wallFamilyIdx,
    corridorFamilyIdx
  } = params

  const floorFamily = atlas.bgFamilies[floorFamilyIdx]
  const wallFamily = wallFamilyIdx >= 0 ? atlas.wallFamilies[wallFamilyIdx] : null
  const corridorFamily = atlas.bgFamilies[corridorFamilyIdx]

  if (!floorFamily || !corridorFamily) {
    return new MapFile(width, height)
  }

  const rng = mulberry32(seed)
  const map = new MapFile(width, height)

  // Fill entire map with floor + walls (solid), using adjacency for coherent ground
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const context: number[] = []
      if (x > 0) context.push(map.getTile(x - 1, y).background)
      if (y > 0) context.push(map.getTile(x, y - 1).background)
      const bg =
        context.length > 0
          ? pickAdjacentTile(context, floorFamily, atlas, rng)
          : pickTile(floorFamily, atlas, rng)
      const [lfg, rfg] = wallFamily ? pickWallPair(wallFamily, rng) : [0, 0]
      map.setTile(x, y, { background: bg, leftForeground: lfg, rightForeground: rfg })
    }
  }

  // Place rooms
  const rooms: Room[] = []
  const maxAttempts = roomCount * 3

  for (let attempt = 0; attempt < maxAttempts && rooms.length < roomCount; attempt++) {
    const w = Math.floor(rng() * (maxRoomSize - minRoomSize + 1)) + minRoomSize
    const h = Math.floor(rng() * (maxRoomSize - minRoomSize + 1)) + minRoomSize
    const x = Math.floor(rng() * (width - w - 2)) + 1
    const y = Math.floor(rng() * (height - h - 2)) + 1

    const overlaps = rooms.some(
      (r) => x - 1 < r.x + r.w && x + w + 1 > r.x && y - 1 < r.y + r.h && y + h + 1 > r.y
    )
    if (overlaps) continue

    rooms.push({ x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) })

    // Clear room interior with corridor/floor tiles, using adjacency for coherence
    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        const context: number[] = []
        if (rx > x) context.push(map.getTile(rx - 1, ry).background)
        if (ry > y) context.push(map.getTile(rx, ry - 1).background)
        const bg =
          context.length > 0
            ? pickAdjacentTile(context, corridorFamily, atlas, rng)
            : pickTile(corridorFamily, atlas, rng)
        map.setTile(rx, ry, { background: bg, leftForeground: 0, rightForeground: 0 })
      }
    }
  }

  // Connect rooms via L-shaped corridors
  if (rooms.length > 1) {
    const sorted = [...rooms].sort((a, b) => a.cx + a.cy - (b.cx + b.cy))

    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i]
      const b = sorted[i + 1]
      const hFirst = rng() > 0.5

      if (hFirst) {
        carveCorridor(map, a.cx, a.cy, b.cx, a.cy, corridorWidth, corridorFamily, atlas, rng)
        carveCorridor(map, b.cx, a.cy, b.cx, b.cy, corridorWidth, corridorFamily, atlas, rng)
      } else {
        carveCorridor(map, a.cx, a.cy, a.cx, b.cy, corridorWidth, corridorFamily, atlas, rng)
        carveCorridor(map, a.cx, b.cy, b.cx, b.cy, corridorWidth, corridorFamily, atlas, rng)
      }
    }
  }

  return map
}

function carveCorridor(
  map: MapFile,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  family: BgFamily,
  atlas: TileAtlas,
  rng: () => number
): void {
  const halfW = Math.floor(width / 2)
  const dx = Math.sign(x2 - x1) || 0
  const dy = Math.sign(y2 - y1) || 0

  let cx = x1,
    cy = y1
  while (true) {
    // Carve a cross-section perpendicular to movement
    for (let d = -halfW; d <= halfW; d++) {
      const tx = dy !== 0 ? cx + d : cx // perpendicular to vertical movement
      const ty = dx !== 0 ? cy + d : cy // perpendicular to horizontal movement
      if (tx >= 0 && tx < map.width && ty >= 0 && ty < map.height) {
        const bg = pickTile(family, atlas, rng)
        map.setTile(tx, ty, { background: bg, leftForeground: 0, rightForeground: 0 })
      }
    }

    if (cx === x2 && cy === y2) break
    cx += dx
    cy += dy
  }
}
