/**
 * Stitching two maps into one — the inverse of `SplitMapDialog`.
 *
 * All of the geometry lives here rather than in the dialog so it can be tested
 * without a canvas: the dialog only picks a side and an offset, builds the
 * composite, and previews it.
 */

import { MapFile } from '@eriscorp/dalib-ts'

/** Which side of the base map the incoming map is attached to. */
export type JoinSide = 'left' | 'right' | 'top' | 'bottom'

export interface Dims {
  width: number
  height: number
}

/** Where each source lands in the composite, and how big the composite is. */
export interface JoinLayout {
  width: number
  height: number
  baseX: number
  baseY: number
  otherX: number
  otherY: number
}

/** True when the seam is vertical — the maps sit side by side. */
export function isHorizontal(side: JoinSide): boolean {
  return side === 'left' || side === 'right'
}

/**
 * The length of the shared edge for each map: heights when joining left/right,
 * widths when joining top/bottom. This is the axis the offset slides along.
 */
function seamLengths(side: JoinSide, base: Dims, other: Dims): { base: number; other: number } {
  return isHorizontal(side)
    ? { base: base.height, other: other.height }
    : { base: base.width, other: other.width }
}

/**
 * How far the incoming map may slide along the seam.
 *
 * Bounded so at least one tile still touches: sliding a map completely past
 * the edge produces a composite of two islands joined by empty space, which is
 * never what "attach to this side" means — and the empty band would be tiles
 * the client has to render.
 */
export function offsetRange(side: JoinSide, base: Dims, other: Dims): { min: number; max: number } {
  const seam = seamLengths(side, base, other)
  return { min: -(seam.other - 1), max: seam.base - 1 }
}

/** Flush-start, centered and flush-end offsets, clamped into range. */
export function offsetPresets(
  side: JoinSide,
  base: Dims,
  other: Dims
): { start: number; center: number; end: number } {
  const seam = seamLengths(side, base, other)
  const { min, max } = offsetRange(side, base, other)
  const clamp = (v: number): number => Math.max(min, Math.min(max, v))
  return {
    start: clamp(0),
    center: clamp(Math.floor((seam.base - seam.other) / 2)),
    end: clamp(seam.base - seam.other)
  }
}

/**
 * Place both maps in a composite whose bounds are their union.
 *
 * A negative offset means the incoming map starts *before* the base does along
 * the seam, so the base itself has to shift to keep every coordinate
 * non-negative — that is what `baseX`/`baseY` are for. Anything neither map
 * covers stays empty (tile id 0), which is the correct fill: DA tile ids are
 * 1-based, so 0 is "nothing here", not "tile number zero".
 */
export function joinLayout(side: JoinSide, base: Dims, other: Dims, offset: number): JoinLayout {
  // Along the seam: negative offset pushes the base, positive pushes the other.
  const baseShift = Math.max(0, -offset)
  const otherShift = Math.max(0, offset)

  if (isHorizontal(side)) {
    const height = Math.max(baseShift + base.height, otherShift + other.height)
    const width = base.width + other.width
    return side === 'right'
      ? { width, height, baseX: 0, baseY: baseShift, otherX: base.width, otherY: otherShift }
      : { width, height, baseX: other.width, baseY: baseShift, otherX: 0, otherY: otherShift }
  }

  const width = Math.max(baseShift + base.width, otherShift + other.width)
  const height = base.height + other.height
  return side === 'bottom'
    ? { width, height, baseX: baseShift, baseY: 0, otherX: otherShift, otherY: base.height }
    : { width, height, baseX: baseShift, baseY: other.height, otherX: otherShift, otherY: 0 }
}

/** Copy every tile of `src` into `dest` at (`dx`, `dy`). */
function blit(dest: MapFile, src: MapFile, dx: number, dy: number): void {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const tx = dx + x
      const ty = dy + y
      if (tx < 0 || ty < 0 || tx >= dest.width || ty >= dest.height) continue
      // Shallow-clone the tile so the composite never aliases a source map's
      // tile objects — editing the join result must not edit its inputs.
      dest.setTile(tx, ty, { ...src.getTile(x, y) })
    }
  }
}

/** Build the composite map described by {@link joinLayout}. Sources untouched. */
export function joinMaps(base: MapFile, other: MapFile, layout: JoinLayout): MapFile {
  const joined = new MapFile(layout.width, layout.height)
  blit(joined, base, layout.baseX, layout.baseY)
  blit(joined, other, layout.otherX, layout.otherY)
  return joined
}
