// ── Tile Atlas types (baked data from buildTileAtlas.ts) ─────────────────────

export interface BgFamily {
  id: string
  tiles: number[]
  totalFrequency: number
  topTiles: number[]       // top 5 most frequent tiles for preview
}

export interface WallFamily {
  id: string
  pairs: [number, number][]   // [lfg, rfg] tuples
  totalFrequency: number
  commonGrounds: number[]     // bg tile IDs these walls commonly appear on
}

export interface TileAtlas {
  scannedAt: string
  fileCount: number
  tileCount: number
  skippedFiles: number
  bgFamilies: BgFamily[]
  wallFamilies: WallFamily[]
  bgAdjacency: Record<string, Record<string, number>>  // bgId -> neighborBgId -> count
  bgFrequency: Record<string, number>                   // bgId -> count
}

// ── Tile Themes (user-named role-to-tile-id assignments) ─────────────────────

export interface TileTheme {
  name: string
  createdAt: string
  updatedAt: string
  primaryGround: number
  secondaryGround: number
  accentGround: number
  pathTile: number
  wallTile: number
  wallTileRight: number
  decorationTile: number
  edgeTile: number
}

// Output shape of the tileScan:analyze IPC: per-layer [tileId, count] tuples,
// sorted descending by frequency.
export interface TileFrequencyResult {
  background: [number, number][]
  leftForeground: [number, number][]
  rightForeground: [number, number][]
  fileCount: number
  tileCount: number
}
