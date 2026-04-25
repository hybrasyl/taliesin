/**
 * Geometry and algorithm utilities for the map editor tools.
 */

import type { MapFile } from '@eriscorp/dalib-ts'

// ── Types ────────────────────────────────────────────────────────────────────

export type TileLayerKey = 'background' | 'leftForeground' | 'rightForeground'

export interface TileCoord {
  tx: number
  ty: number
}

export interface TileChange {
  x: number
  y: number
  layer: TileLayerKey
  oldValue: number
  newValue: number
}

export type ShapeMode = 'rect-outline' | 'rect-filled' | 'circle-outline' | 'circle-filled'

// ── Flood Fill ───────────────────────────────────────────────────────────────

/**
 * BFS flood fill from (startX, startY) on the given layer.
 * Replaces all contiguous tiles with the same ID as the start tile.
 * Returns the list of changes (does NOT mutate the map).
 */
export function floodFill(
  mapFile: MapFile,
  startX: number,
  startY: number,
  layer: TileLayerKey,
  newId: number
): TileChange[] {
  const { width: W, height: H } = mapFile
  const targetId = mapFile.getTile(startX, startY)[layer]
  if (targetId === newId) return []

  const changes: TileChange[] = []
  const visited = new Set<number>()
  const queue: TileCoord[] = [{ tx: startX, ty: startY }]
  const key = (x: number, y: number) => y * W + x

  visited.add(key(startX, startY))

  while (queue.length > 0) {
    const { tx, ty } = queue.shift()!
    const tile = mapFile.getTile(tx, ty)
    if (tile[layer] !== targetId) continue

    changes.push({ x: tx, y: ty, layer, oldValue: targetId, newValue: newId })

    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0]
    ] as const) {
      const nx = tx + dx
      const ny = ty + dy
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
      const k = key(nx, ny)
      if (visited.has(k)) continue
      visited.add(k)
      if (mapFile.getTile(nx, ny)[layer] === targetId) {
        queue.push({ tx: nx, ty: ny })
      }
    }
  }

  return changes
}

// ── Bresenham Line ───────────────────────────────────────────────────────────

/** Returns all tile coordinates along a line from (x0,y0) to (x1,y1). */
export function bresenhamLine(x0: number, y0: number, x1: number, y1: number): TileCoord[] {
  const coords: TileCoord[] = []
  let dx = Math.abs(x1 - x0)
  let dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy

  let cx = x0
  let cy = y0

  while (true) {
    coords.push({ tx: cx, ty: cy })
    if (cx === x1 && cy === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      cx += sx
    }
    if (e2 <= dx) {
      err += dx
      cy += sy
    }
  }

  return coords
}

// ── Shape Generation ─────────────────────────────────────────────────────────

/** Returns tile coordinates for a rectangle outline. */
export function rectOutline(x0: number, y0: number, x1: number, y1: number): TileCoord[] {
  const minX = Math.min(x0, x1)
  const maxX = Math.max(x0, x1)
  const minY = Math.min(y0, y1)
  const maxY = Math.max(y0, y1)
  const coords: TileCoord[] = []
  const seen = new Set<string>()
  const add = (tx: number, ty: number) => {
    const k = `${tx},${ty}`
    if (!seen.has(k)) {
      seen.add(k)
      coords.push({ tx, ty })
    }
  }

  for (let x = minX; x <= maxX; x++) {
    add(x, minY)
    add(x, maxY)
  }
  for (let y = minY + 1; y < maxY; y++) {
    add(minX, y)
    add(maxX, y)
  }
  return coords
}

/** Returns tile coordinates for a filled rectangle. */
export function rectFilled(x0: number, y0: number, x1: number, y1: number): TileCoord[] {
  const minX = Math.min(x0, x1)
  const maxX = Math.max(x0, x1)
  const minY = Math.min(y0, y1)
  const maxY = Math.max(y0, y1)
  const coords: TileCoord[] = []
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      coords.push({ tx: x, ty: y })
    }
  }
  return coords
}

/** Returns tile coordinates for an ellipse outline (Bresenham midpoint). */
export function circleOutline(x0: number, y0: number, x1: number, y1: number): TileCoord[] {
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const rx = Math.abs(x1 - x0) / 2
  const ry = Math.abs(y1 - y0) / 2
  if (rx < 0.5 && ry < 0.5) return [{ tx: Math.round(cx), ty: Math.round(cy) }]

  const coords: TileCoord[] = []
  const seen = new Set<string>()
  const add = (tx: number, ty: number) => {
    const k = `${tx},${ty}`
    if (!seen.has(k)) {
      seen.add(k)
      coords.push({ tx, ty })
    }
  }

  // Sample the ellipse with enough resolution
  const steps = Math.max(40, Math.ceil(Math.max(rx, ry) * 4))
  for (let i = 0; i < steps; i++) {
    const angle = (2 * Math.PI * i) / steps
    const px = Math.round(cx + rx * Math.cos(angle))
    const py = Math.round(cy + ry * Math.sin(angle))
    add(px, py)
  }

  return coords
}

/** Returns tile coordinates for a filled ellipse. */
export function circleFilled(x0: number, y0: number, x1: number, y1: number): TileCoord[] {
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const rx = Math.abs(x1 - x0) / 2
  const ry = Math.abs(y1 - y0) / 2
  const minX = Math.min(x0, x1)
  const maxX = Math.max(x0, x1)
  const minY = Math.min(y0, y1)
  const maxY = Math.max(y0, y1)

  const coords: TileCoord[] = []
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      // Check if point is inside the ellipse
      const dx = (x - cx) / (rx || 0.5)
      const dy = (y - cy) / (ry || 0.5)
      if (dx * dx + dy * dy <= 1.05) {
        // slight tolerance for edge pixels
        coords.push({ tx: x, ty: y })
      }
    }
  }
  return coords
}

/** Dispatch shape generation by mode. */
export function getShapeCoords(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  mode: ShapeMode
): TileCoord[] {
  switch (mode) {
    case 'rect-outline':
      return rectOutline(x0, y0, x1, y1)
    case 'rect-filled':
      return rectFilled(x0, y0, x1, y1)
    case 'circle-outline':
      return circleOutline(x0, y0, x1, y1)
    case 'circle-filled':
      return circleFilled(x0, y0, x1, y1)
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Apply a list of changes to a MapFile (mutates in place). */
export function applyChanges(mapFile: MapFile, changes: TileChange[]): void {
  for (const c of changes) {
    const tile = mapFile.getTile(c.x, c.y)
    mapFile.setTile(c.x, c.y, { ...tile, [c.layer]: c.newValue })
  }
}

/** Revert a list of changes on a MapFile (mutates in place). */
export function revertChanges(mapFile: MapFile, changes: TileChange[]): void {
  for (let i = changes.length - 1; i >= 0; i--) {
    const c = changes[i]
    const tile = mapFile.getTile(c.x, c.y)
    mapFile.setTile(c.x, c.y, { ...tile, [c.layer]: c.oldValue })
  }
}

/** Clamp tile coordinates to map bounds. */
export function clampTile(tx: number, ty: number, W: number, H: number): TileCoord {
  return {
    tx: Math.max(0, Math.min(W - 1, tx)),
    ty: Math.max(0, Math.min(H - 1, ty))
  }
}
