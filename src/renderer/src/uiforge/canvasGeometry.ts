import type { UiControl, UiControlKind, UiRect } from './types'

/**
 * Pure interaction math for the Layout Forge canvas — hit-testing, resize,
 * snapping, and control creation. No React, no canvas; unit-tested like
 * utils/mapEditorTools.ts. All coordinates are logical layout pixels unless a
 * name says otherwise.
 */

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type DragMode = 'move' | ResizeHandle

/** Draw/hit order of the eight resize handles (corners then edge midpoints). */
export const RESIZE_HANDLES: readonly ResizeHandle[] = ['nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w']

export interface HitResult {
  name: string
  mode: DragMode
}

/** Minimum control extent (logical px) enforced on resize. */
export const MIN_CONTROL_SIZE = 4
/** Default editor snapping parameters (logical px). */
export const DEFAULT_GRID = 4
export const DEFAULT_SNAP_DIST = 3
/** Handle hit radius in screen px (converted to logical via zoom by callers). */
export const HANDLE_HIT_RADIUS_SCREEN = 4

// ── Coordinate conversion ──────────────────────────────────────────────────────

/** Screen (canvas) px → logical layout px. */
export function screenToLogical(px: number, py: number, zoom: number): { x: number; y: number } {
  return { x: px / zoom, y: py / zoom }
}

// ── Handles ─────────────────────────────────────────────────────────────────────

/** Center of a resize handle in logical coordinates. */
export function handleCenter(rect: UiRect, handle: ResizeHandle): { x: number; y: number } {
  const left = rect.x
  const right = rect.x + rect.w
  const midX = rect.x + rect.w / 2
  const top = rect.y
  const bottom = rect.y + rect.h
  const midY = rect.y + rect.h / 2
  switch (handle) {
    case 'nw':
      return { x: left, y: top }
    case 'n':
      return { x: midX, y: top }
    case 'ne':
      return { x: right, y: top }
    case 'e':
      return { x: right, y: midY }
    case 'se':
      return { x: right, y: bottom }
    case 's':
      return { x: midX, y: bottom }
    case 'sw':
      return { x: left, y: bottom }
    case 'w':
      return { x: left, y: midY }
  }
}

/** CSS cursor for a drag mode. */
export function cursorForMode(mode: DragMode): string {
  switch (mode) {
    case 'move':
      return 'move'
    case 'n':
    case 's':
      return 'ns-resize'
    case 'e':
    case 'w':
      return 'ew-resize'
    case 'nw':
    case 'se':
      return 'nwse-resize'
    case 'ne':
    case 'sw':
      return 'nesw-resize'
  }
}

// ── Hit testing ─────────────────────────────────────────────────────────────────

function inRect(rect: UiRect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
}

/**
 * Resolve a logical-space point to a control + drag mode. The selected
 * control's resize handles win first (within handleRadius); otherwise the
 * topmost control body under the point (reverse document order) yields a
 * 'move'. Returns null on empty space.
 */
export function hitTest(
  controls: UiControl[],
  selectedName: string | null,
  point: { x: number; y: number },
  handleRadius: number
): HitResult | null {
  if (selectedName) {
    const sel = controls.find((c) => c.name === selectedName)
    if (sel) {
      for (const h of RESIZE_HANDLES) {
        const c = handleCenter(sel.rect, h)
        if (Math.abs(point.x - c.x) <= handleRadius && Math.abs(point.y - c.y) <= handleRadius) {
          return { name: sel.name, mode: h }
        }
      }
    }
  }
  for (let i = controls.length - 1; i >= 0; i--) {
    if (inRect(controls[i].rect, point.x, point.y)) {
      return { name: controls[i].name, mode: 'move' }
    }
  }
  return null
}

// ── Move / resize ───────────────────────────────────────────────────────────────

/** Translate a rect by a logical delta. */
export function moveRect(rect: UiRect, dx: number, dy: number): UiRect {
  return { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h }
}

/**
 * Resize a rect by dragging one handle by a logical delta, keeping the
 * opposite edge fixed and enforcing minSize.
 */
export function resizeRect(
  rect: UiRect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  minSize = MIN_CONTROL_SIZE
): UiRect {
  let left = rect.x
  let top = rect.y
  let right = rect.x + rect.w
  let bottom = rect.y + rect.h
  if (handle.includes('w')) left = Math.min(left + dx, right - minSize)
  if (handle.includes('e')) right = Math.max(right + dx, left + minSize)
  if (handle.includes('n')) top = Math.min(top + dy, bottom - minSize)
  if (handle.includes('s')) bottom = Math.max(bottom + dy, top + minSize)
  return { x: left, y: top, w: right - left, h: bottom - top }
}

/** Round a rect to whole logical pixels (committed geometry is integer). */
export function roundRect(rect: UiRect): UiRect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.round(rect.w),
    h: Math.round(rect.h)
  }
}

// ── Snapping ─────────────────────────────────────────────────────────────────────

export interface SnapContext {
  gridSize: number
  snapDist: number
  /** Candidate vertical snap lines (x coordinates). */
  vLines: number[]
  /** Candidate horizontal snap lines (y coordinates). */
  hLines: number[]
}

/**
 * Snap lines from the anchor bounds and every sibling control's edges,
 * excluding the control being dragged.
 */
export function buildSnapContext(
  controls: UiControl[],
  excludeName: string | null,
  anchor: UiRect,
  gridSize = DEFAULT_GRID,
  snapDist = DEFAULT_SNAP_DIST
): SnapContext {
  const vLines = [0, anchor.w]
  const hLines = [0, anchor.h]
  for (const c of controls) {
    if (c.name === excludeName) continue
    vLines.push(c.rect.x, c.rect.x + c.rect.w)
    hLines.push(c.rect.y, c.rect.y + c.rect.h)
  }
  return { gridSize, snapDist, vLines, hLines }
}

/** Snap one coordinate to the nearest edge line (priority) or the grid. */
export function snapCoord(
  value: number,
  lines: number[],
  gridSize: number,
  snapDist: number
): number {
  let best = value
  let bestDist = snapDist
  let snapped = false
  for (const line of lines) {
    const d = Math.abs(line - value)
    if (d <= bestDist) {
      best = line
      bestDist = d
      snapped = true
    }
  }
  if (snapped) return best
  if (gridSize > 0) return Math.round(value / gridSize) * gridSize
  return value
}

/** Smallest offset (line − edge) snapping any of `edges` within snapDist, else grid-snap the first edge. */
function bestEdgeOffset(
  edges: number[],
  lines: number[],
  gridSize: number,
  snapDist: number
): number {
  let bestOff: number | null = null
  let bestAbs = snapDist
  for (const e of edges) {
    for (const line of lines) {
      const off = line - e
      if (Math.abs(off) <= bestAbs) {
        bestOff = off
        bestAbs = Math.abs(off)
      }
    }
  }
  if (bestOff !== null) return bestOff
  if (gridSize > 0) {
    const g = Math.round(edges[0] / gridSize) * gridSize
    return g - edges[0]
  }
  return 0
}

/** Snap a moving rect, preserving size (snaps whichever edge is closest to a line). */
export function snapMove(rect: UiRect, ctx: SnapContext): UiRect {
  const dx = bestEdgeOffset([rect.x, rect.x + rect.w], ctx.vLines, ctx.gridSize, ctx.snapDist)
  const dy = bestEdgeOffset([rect.y, rect.y + rect.h], ctx.hLines, ctx.gridSize, ctx.snapDist)
  return { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h }
}

/** Snap a resized rect, snapping only the edges the handle moved. */
export function snapResize(
  rect: UiRect,
  handle: ResizeHandle,
  ctx: SnapContext,
  minSize = MIN_CONTROL_SIZE
): UiRect {
  let left = rect.x
  let top = rect.y
  let right = rect.x + rect.w
  let bottom = rect.y + rect.h
  if (handle.includes('w')) left = snapCoord(left, ctx.vLines, ctx.gridSize, ctx.snapDist)
  if (handle.includes('e')) right = snapCoord(right, ctx.vLines, ctx.gridSize, ctx.snapDist)
  if (handle.includes('n')) top = snapCoord(top, ctx.hLines, ctx.gridSize, ctx.snapDist)
  if (handle.includes('s')) bottom = snapCoord(bottom, ctx.hLines, ctx.gridSize, ctx.snapDist)
  if (right - left < minSize) {
    if (handle.includes('w')) left = right - minSize
    else right = left + minSize
  }
  if (bottom - top < minSize) {
    if (handle.includes('n')) top = bottom - minSize
    else bottom = top + minSize
  }
  return { x: left, y: top, w: right - left, h: bottom - top }
}

// ── Control creation ─────────────────────────────────────────────────────────────

const DEFAULT_SIZES: Record<UiControlKind, { w: number; h: number }> = {
  label: { w: 48, h: 14 },
  button: { w: 32, h: 16 },
  image: { w: 16, h: 16 },
  textbox: { w: 80, h: 14 },
  progressbar: { w: 80, h: 8 }
}

/** First free name of the form `base`, `base_1`, `base_2`, … not in `existing`. */
export function uniqueControlName(base: string, existing: Iterable<string>): string {
  const set = new Set(existing)
  if (!set.has(base)) return base
  let i = 1
  while (set.has(`${base}_${i}`)) i++
  return `${base}_${i}`
}

/**
 * A new control of `kind` centered on the given logical point (clamped so its
 * default box stays within the anchor), with a unique auto name.
 */
export function newControl(
  kind: UiControlKind,
  x: number,
  y: number,
  existingNames: Iterable<string>,
  anchor: UiRect
): UiControl {
  const { w, h } = DEFAULT_SIZES[kind]
  const rx = Math.round(Math.max(0, Math.min(anchor.w - w, x - w / 2)))
  const ry = Math.round(Math.max(0, Math.min(anchor.h - h, y - h / 2)))
  return { kind, name: uniqueControlName(kind, existingNames), rect: { x: rx, y: ry, w, h } }
}
