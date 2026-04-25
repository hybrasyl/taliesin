/** A single tile in a prefab — mirrors MapTile from dalib-ts. */
export interface PrefabTile {
  background: number
  leftForeground: number
  rightForeground: number
}

/** A saved prefab — reusable multi-tile structure. */
export interface Prefab {
  name: string
  width: number
  height: number
  /** Row-major (y outer, x inner). Zero values = transparent (don't overwrite on stamp). */
  tiles: PrefabTile[]
  createdAt: string
  updatedAt: string
}

/** Summary for listing without loading full tile data. */
export interface PrefabSummary {
  filename: string
  name: string
  width: number
  height: number
  createdAt: string
  updatedAt: string
}

/** Sanitize a prefab name for use as a filename. */
export function sanitizePrefabName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'untitled'
}

/**
 * Trim a prefab's tiles to the occupied bounding box (remove empty rows/cols).
 * Returns a new Prefab with adjusted dimensions, or the original if already trimmed.
 */
export function trimPrefab(prefab: Prefab): Prefab {
  const { width: W, height: H, tiles } = prefab

  let minX = W,
    minY = H,
    maxX = -1,
    maxY = -1

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = tiles[y * W + x]
      if (t.background !== 0 || t.leftForeground !== 0 || t.rightForeground !== 0) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  // All empty
  if (maxX < 0)
    return {
      ...prefab,
      width: 1,
      height: 1,
      tiles: [{ background: 0, leftForeground: 0, rightForeground: 0 }]
    }

  const newW = maxX - minX + 1
  const newH = maxY - minY + 1
  if (newW === W && newH === H) return prefab

  const newTiles: PrefabTile[] = []
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      newTiles.push({ ...tiles[y * W + x] })
    }
  }

  return { ...prefab, width: newW, height: newH, tiles: newTiles }
}
