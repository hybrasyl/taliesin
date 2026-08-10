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

/** The three tile layers, in draw order. */
export const TILE_LAYERS: readonly TileLayerKey[] = [
  'background',
  'leftForeground',
  'rightForeground'
]

/** Which layers the editor is currently drawing — the toolbar's eye toggles. */
export type LayerVisibility = Record<TileLayerKey, boolean>

// ── Selection capture and clear ──────────────────────────────────────────────

/**
 * The tiles inside a selection, with every hidden layer read as 0.
 *
 * Copy used to take all three layers unconditionally, so foregrounds you had
 * switched off came with the region and reappeared on paste (HTOO-333).
 *
 * A hidden layer is captured as 0 rather than reshaping the clipboard: paste
 * skips zero-valued layers, so a ground-only capture composites over existing
 * foregrounds instead of erasing them, and prefab stamping — which reuses the
 * same structure — is unaffected.
 *
 * Tiles outside the map read as empty, so the captured block is always
 * `w × h` and pastes at the shape the user selected.
 */
export function captureSelection(
  mapFile: MapFile,
  rect: { x: number; y: number; w: number; h: number },
  visible: LayerVisibility
): { background: number; leftForeground: number; rightForeground: number }[] {
  const tiles: { background: number; leftForeground: number; rightForeground: number }[] = []
  for (let dy = 0; dy < rect.h; dy++) {
    for (let dx = 0; dx < rect.w; dx++) {
      const x = rect.x + dx
      const y = rect.y + dy
      if (x < 0 || y < 0 || x >= mapFile.width || y >= mapFile.height) {
        tiles.push({ background: 0, leftForeground: 0, rightForeground: 0 })
        continue
      }
      const tile = mapFile.getTile(x, y)
      tiles.push({
        background: visible.background ? tile.background : 0,
        leftForeground: visible.leftForeground ? tile.leftForeground : 0,
        rightForeground: visible.rightForeground ? tile.rightForeground : 0
      })
    }
  }
  return tiles
}

/**
 * The changes that clear every *visible* layer inside a selection — you cannot
 * delete what you cannot see.
 *
 * Cut and Delete share this with Copy's rule above. Hiding the foregrounds and
 * losing them to a Delete anyway is the same surprise as copying them
 * invisibly, and one rule across all three is easier to hold than a rule that
 * covers Copy alone.
 */
export function clearSelectionChanges(
  mapFile: MapFile,
  rect: { x: number; y: number; w: number; h: number },
  visible: LayerVisibility
): TileChange[] {
  const changes: TileChange[] = []
  for (let dy = 0; dy < rect.h; dy++) {
    for (let dx = 0; dx < rect.w; dx++) {
      const x = rect.x + dx
      const y = rect.y + dy
      if (x < 0 || y < 0 || x >= mapFile.width || y >= mapFile.height) continue
      const tile = mapFile.getTile(x, y)
      for (const layer of TILE_LAYERS) {
        if (!visible[layer]) continue
        if (tile[layer] === 0) continue
        changes.push({ x, y, layer, oldValue: tile[layer], newValue: 0 })
      }
    }
  }
  return changes
}

// ── Random fill ──────────────────────────────────────────────────────────────

/**
 * Scatter `tileIds` across a rectangle on one layer, and return the changes
 * without mutating the map.
 *
 * The per-tile brush is the same rule applied one cell at a time; this exists so
 * a marked-out area can be filled in a single undoable batch instead of by hand
 * (HTOO-333).
 *
 * `overwrite` is off by default, matching the brush: an occupied cell is left
 * alone, so the tool never silently changes what it already does. The pick is
 * uniform — frequency weighting is a separate question, and `pickWeighted` in
 * `utils/mapGenerator.ts` is where that would come from.
 *
 * `pick` is injected only so tests are not at the mercy of `Math.random`.
 */
export function randomFillRect(
  mapFile: MapFile,
  rect: { x: number; y: number; w: number; h: number },
  layer: TileLayerKey,
  tileIds: readonly number[],
  options: { overwrite?: boolean; pick?: (ids: readonly number[]) => number } = {}
): TileChange[] {
  if (tileIds.length === 0) return []
  const pick = options.pick ?? ((ids) => ids[Math.floor(Math.random() * ids.length)])
  const changes: TileChange[] = []
  for (let dy = 0; dy < rect.h; dy++) {
    for (let dx = 0; dx < rect.w; dx++) {
      const x = rect.x + dx
      const y = rect.y + dy
      if (x < 0 || y < 0 || x >= mapFile.width || y >= mapFile.height) continue
      const oldValue = mapFile.getTile(x, y)[layer]
      if (oldValue !== 0 && !options.overwrite) continue
      const newValue = pick(tileIds)
      if (newValue === oldValue) continue
      changes.push({ x, y, layer, oldValue, newValue })
    }
  }
  return changes
}

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
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
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

/** Accumulator that de-dupes tile coords by "tx,ty" as they're pushed. */
function makeCoordSet(): { coords: TileCoord[]; add: (tx: number, ty: number) => void } {
  const coords: TileCoord[] = []
  const seen = new Set<string>()
  return {
    coords,
    add: (tx, ty) => {
      const k = `${tx},${ty}`
      if (!seen.has(k)) {
        seen.add(k)
        coords.push({ tx, ty })
      }
    }
  }
}

/** Returns tile coordinates for a rectangle outline. */
export function rectOutline(x0: number, y0: number, x1: number, y1: number): TileCoord[] {
  const minX = Math.min(x0, x1)
  const maxX = Math.max(x0, x1)
  const minY = Math.min(y0, y1)
  const maxY = Math.max(y0, y1)
  const { coords, add } = makeCoordSet()

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

  const { coords, add } = makeCoordSet()

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
