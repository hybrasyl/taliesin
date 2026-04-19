// ── Tile Theme types for procedural map generation ──────────────────────────

export interface TileTheme {
  name: string
  createdAt: string
  updatedAt: string
  // Background layer roles
  primaryGround: number      // main floor/ground tile
  secondaryGround: number    // variety ground
  accentGround: number       // sparse accent (water edge, special floor)
  pathTile: number           // corridors, cleared areas
  // Foreground layer roles
  wallTile: number           // left foreground wall/obstacle
  wallTileRight: number      // right foreground wall
  decorationTile: number     // sparse foreground decoration
  edgeTile: number           // boundary/transition foreground
}

export interface TileFrequencyResult {
  background: [number, number][]       // [tileId, count][] sorted desc
  leftForeground: [number, number][]
  rightForeground: [number, number][]
  fileCount: number
  tileCount: number
}

export interface TerrainParams {
  width: number
  height: number
  seed: number
  scale: number             // noise frequency — lower = larger features (default 0.05)
  octaves: number           // noise detail layers (default 3)
  persistence: number       // amplitude decay per octave (default 0.5)
  lacunarity: number        // frequency multiplier per octave (default 2.0)
  secondaryThreshold: number // noise above this → secondaryGround (default 0.2)
  accentThreshold: number    // noise above this → accentGround (default 0.6)
  fgDensity: number         // fraction of tiles getting foreground (default 0.03)
  fgThreshold: number       // foreground noise threshold (default 0.7)
}

export interface DungeonParams {
  width: number
  height: number
  seed: number
  roomCount: number         // target number of rooms (default 8)
  minRoomSize: number       // minimum room dimension in tiles (default 4)
  maxRoomSize: number       // maximum room dimension in tiles (default 12)
  corridorWidth: number     // corridor width in tiles (default 1)
}

export const TERRAIN_DEFAULTS: Omit<TerrainParams, 'width' | 'height' | 'seed'> = {
  scale: 0.05,
  octaves: 3,
  persistence: 0.5,
  lacunarity: 2.0,
  secondaryThreshold: 0.2,
  accentThreshold: 0.6,
  fgDensity: 0.03,
  fgThreshold: 0.7,
}

export const DUNGEON_DEFAULTS: Omit<DungeonParams, 'width' | 'height' | 'seed'> = {
  roomCount: 8,
  minRoomSize: 4,
  maxRoomSize: 12,
  corridorWidth: 1,
}
