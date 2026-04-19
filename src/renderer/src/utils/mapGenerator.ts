import { MapFile } from '@eriscorp/dalib-ts'
import { createNoise2D } from 'simplex-noise'
import type { TileTheme, TerrainParams, DungeonParams } from './tileThemeTypes'

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

// ── Noise Terrain Generator ─────────────────────────────────────────────────

export function generateTerrain(params: TerrainParams, theme: TileTheme): MapFile {
  const { width, height, seed, scale, octaves, persistence, lacunarity,
    secondaryThreshold, accentThreshold, fgThreshold } = params

  const prng = mulberry32(seed)
  const noise2D = createNoise2D(prng)
  const fgNoise2D = createNoise2D(prng)

  const map = new MapFile(width, height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Multi-octave noise for background terrain
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

      // Normalize to [0, 1]
      noiseVal = (noiseVal / maxAmplitude + 1) / 2

      // Assign background tile based on thresholds
      let bg: number
      if (noiseVal < secondaryThreshold) {
        bg = theme.primaryGround
      } else if (noiseVal < accentThreshold) {
        bg = theme.secondaryGround
      } else {
        bg = theme.accentGround
      }

      // Foreground scattering via separate noise
      let lfg = 0
      const fgVal = (fgNoise2D(x * scale * 2, y * scale * 2) + 1) / 2
      if (fgVal > fgThreshold && theme.decorationTile > 0) {
        lfg = theme.decorationTile
      }

      map.setTile(x, y, { background: bg, leftForeground: lfg, rightForeground: 0 })
    }
  }

  return map
}

// ── Room-and-Corridor Dungeon Generator ─────────────────────────────────────

interface Room {
  x: number; y: number
  w: number; h: number
  cx: number; cy: number  // center
}

export function generateDungeon(params: DungeonParams, theme: TileTheme): MapFile {
  const { width, height, seed, roomCount, minRoomSize, maxRoomSize, corridorWidth } = params
  const rng = mulberry32(seed)

  const map = new MapFile(width, height)

  // Fill entire map with walls
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      map.setTile(x, y, {
        background: theme.primaryGround,
        leftForeground: theme.wallTile,
        rightForeground: theme.wallTileRight,
      })
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

    // Check overlap with existing rooms (1-tile margin)
    const overlaps = rooms.some(r =>
      x - 1 < r.x + r.w && x + w + 1 > r.x &&
      y - 1 < r.y + r.h && y + h + 1 > r.y
    )
    if (overlaps) continue

    rooms.push({ x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) })

    // Clear room interior
    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        map.setTile(rx, ry, {
          background: theme.pathTile,
          leftForeground: 0,
          rightForeground: 0,
        })
      }
    }
  }

  // Connect rooms via L-shaped corridors
  if (rooms.length > 1) {
    // Sort by position for more natural connections
    const sorted = [...rooms].sort((a, b) => a.cx + a.cy - (b.cx + b.cy))

    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i]
      const b = sorted[i + 1]

      // Decide corridor direction: horizontal-first or vertical-first
      const hFirst = rng() > 0.5

      if (hFirst) {
        carveHCorridor(map, a.cx, b.cx, a.cy, corridorWidth, theme)
        carveVCorridor(map, a.cy, b.cy, b.cx, corridorWidth, theme)
      } else {
        carveVCorridor(map, a.cy, b.cy, a.cx, corridorWidth, theme)
        carveHCorridor(map, a.cx, b.cx, b.cy, corridorWidth, theme)
      }
    }
  }

  // Scatter decorations in rooms
  if (theme.decorationTile > 0) {
    for (const room of rooms) {
      for (let ry = room.y + 1; ry < room.y + room.h - 1; ry++) {
        for (let rx = room.x + 1; rx < room.x + room.w - 1; rx++) {
          if (rng() < 0.03) {
            const tile = map.getTile(rx, ry)
            map.setTile(rx, ry, {
              ...tile,
              leftForeground: theme.decorationTile,
            })
          }
        }
      }
    }
  }

  return map
}

function carveHCorridor(
  map: MapFile, x1: number, x2: number, y: number,
  width: number, theme: TileTheme
): void {
  const minX = Math.min(x1, x2)
  const maxX = Math.max(x1, x2)
  const halfW = Math.floor(width / 2)

  for (let x = minX; x <= maxX; x++) {
    for (let dy = -halfW; dy <= halfW; dy++) {
      const ty = y + dy
      if (ty >= 0 && ty < map.height && x >= 0 && x < map.width) {
        map.setTile(x, ty, {
          background: theme.pathTile,
          leftForeground: 0,
          rightForeground: 0,
        })
      }
    }
  }
}

function carveVCorridor(
  map: MapFile, y1: number, y2: number, x: number,
  width: number, theme: TileTheme
): void {
  const minY = Math.min(y1, y2)
  const maxY = Math.max(y1, y2)
  const halfW = Math.floor(width / 2)

  for (let y = minY; y <= maxY; y++) {
    for (let dx = -halfW; dx <= halfW; dx++) {
      const tx = x + dx
      if (tx >= 0 && tx < map.width && y >= 0 && y < map.height) {
        map.setTile(tx, y, {
          background: theme.pathTile,
          leftForeground: 0,
          rightForeground: 0,
        })
      }
    }
  }
}
