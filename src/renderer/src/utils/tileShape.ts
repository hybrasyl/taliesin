/**
 * Shaping a source image before it becomes wall tiles.
 *
 * `convertWall` maps the whole source across the 28-pixel face — `u = fx/outW`
 * runs 0 to 1 over the entire image. That is right for art drawn as one tile and
 * wrong for everything else: a house wall four tiles wide is crammed into a
 * single face. These operations are what a source needs first.
 *
 * - **Slice** cuts a wide source into one column per tile, so a run of tiles is
 *   made from one drawing instead of by cutting it up outside Taliesin.
 * - **Mirror** turns a face into its opposite, so one asset becomes the left and
 *   right pair that terminates a flat object, rather than needing two drawings.
 * - **Blank rows below** move the art up the tile. A wall sits on its bottom
 *   edge, so rows left empty underneath raise what the player sees. These rows
 *   belong to the CONVERTED tile, not the source — see `splitWallHeight`.
 * - **Trim** removes the transparent padding an export leaves under the art, so
 *   the tile stands on the ground instead of floating by the padding's share.
 *
 * All three are pure `PixelBuffer` operations, and none of them stores anything:
 * the result is the art. `static_tiles` carries no per-tile metadata and does not
 * gain any here — the pack is still one PNG per id.
 */
import { PixelBuffer } from './duotone'
import { ISO_HTILE_W, ISO_VTILE_STEP } from './mapRenderer'

/** A wall face is exactly this wide. Ground truth from 19,430 legacy HPF walls. */
export const WALL_FACE_WIDTH = ISO_HTILE_W

/**
 * How many tiles wide a source is.
 *
 * Rounded rather than ceiled: art drawn a few pixels over or under a whole
 * number of faces is still that many tiles, and rounding up would add an almost
 * empty column. Never less than one.
 */
export function wallColumnsFor(width: number): number {
  if (!(width > 0)) return 1
  return Math.max(1, Math.round(width / WALL_FACE_WIDTH))
}

/**
 * Cut into `count` equal columns, left to right.
 *
 * The cut points are computed from the full width each time rather than by
 * accumulating a column width, so the columns always tile the source exactly and
 * a width that does not divide evenly loses no pixel to rounding.
 */
export function sliceColumns(src: PixelBuffer, count: number): PixelBuffer[] {
  const n = Math.max(1, Math.floor(count))
  if (n === 1) return [src]
  const out: PixelBuffer[] = []
  for (let i = 0; i < n; i++) {
    const x0 = Math.round((src.width * i) / n)
    const x1 = Math.round((src.width * (i + 1)) / n)
    const w = Math.max(1, x1 - x0)
    const data = new Uint8ClampedArray(w * src.height * 4)
    for (let y = 0; y < src.height; y++) {
      const srcRow = (y * src.width + x0) * 4
      data.set(src.data.subarray(srcRow, srcRow + w * 4), y * w * 4)
    }
    out.push({ data, width: w, height: src.height })
  }
  return out
}

/**
 * Mirror horizontally.
 *
 * This is how one drawing becomes a left/right pair: a face mirrored across the
 * vertical axis is the opposite face, so a sign board drawn once terminates both
 * halves of its cell, and a house's south wall becomes its east wall.
 */
export function mirrorX(src: PixelBuffer): PixelBuffer {
  const { width: w, height: h } = src
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const from = (y * w + (w - 1 - x)) * 4
      const to = (y * w + x) * 4
      data[to] = src.data[from]
      data[to + 1] = src.data[from + 1]
      data[to + 2] = src.data[from + 2]
      data[to + 3] = src.data[from + 3]
    }
  }
  return { data, width: w, height: h }
}

/**
 * Add blank rows beneath the art, or remove rows from beneath it.
 *
 * A wall is drawn from its bottom edge, so this is how the art is placed
 * vertically: blank rows underneath push it up, and removing rows drops it. A
 * negative count never eats into the image beyond leaving one row.
 *
 * Apply this to a CONVERTED tile. Padding a source does nothing, because the
 * projection maps the whole source down the face and scales the padding back
 * out again — see `splitWallHeight`.
 */
export function padBelow(src: PixelBuffer, rows: number): PixelBuffer {
  const n = Math.round(rows)
  if (n === 0) return src
  const h = Math.max(1, src.height + n)
  const data = new Uint8ClampedArray(src.width * h * 4)
  // Copy the rows that survive, anchored at the top. Growing leaves the new
  // rows at the bottom zeroed, which is transparent.
  const keep = Math.min(src.height, h)
  data.set(src.data.subarray(0, keep * src.width * 4), 0)
  return { data, width: src.width, height: h }
}

/**
 * How many fully transparent rows sit at the base of the image.
 *
 * Art often arrives with padding under it — an export box taller than the
 * drawing. The projection maps the whole source down the face, so that padding
 * survives conversion as empty rows at the base of the tile, and the art floats
 * off the ground by their share of the height. This measures the padding so
 * `trimBelow` can remove it. A fully transparent image measures as all of its
 * rows.
 */
export function transparentRowsBelow(src: PixelBuffer): number {
  for (let y = src.height - 1; y >= 0; y--) {
    const row = y * src.width * 4
    for (let x = 0; x < src.width; x++) {
      if (src.data[row + x * 4 + 3] > 0) return src.height - 1 - y
    }
  }
  return src.height
}

/**
 * Remove the fully transparent rows at the base, so the art sits on its bottom
 * edge.
 *
 * This is the opposite decision from **Blank rows below**: trim when the space
 * under the art is an accident of the export, keep (or add) rows when the raise
 * is meant. Apply it to the SOURCE, before slicing — a run's columns must share
 * one baseline, so only rows transparent across the whole source may go. At
 * least one row always stays.
 */
export function trimBelow(src: PixelBuffer): PixelBuffer {
  const rows = Math.min(transparentRowsBelow(src), src.height - 1)
  return rows > 0 ? padBelow(src, -rows) : src
}

/**
 * Divide a wall tile's total height into the art's share and the blank rows
 * beneath it.
 *
 * The rows have to be taken out of the converted tile. `convertWall` maps the
 * whole source down the face — `v = (fy − yTop)/contentH` runs 0 to 1 over the
 * entire image — so rows added to the source are scaled straight back out and
 * the art does not move. Convert the art into `art` rows, then `padBelow` the
 * result by `blank`, and the total is unchanged.
 *
 * `total` is what the tile commits as, and a legacy replacement must match its
 * HPF height exactly, so the blank rows never grow it: they take from the art.
 * To keep the art at its own size instead, raise `total` by the same number of
 * rows. At least one row always stays art.
 */
export function splitWallHeight(total: number, blankRows: number): { art: number; blank: number } {
  const t = Math.max(1, Math.round(total))
  const blank = Math.min(Math.max(0, Math.round(blankRows)), t - 1)
  return { art: t - blank, blank }
}

/**
 * A legacy wall height is a multiple of 14.
 *
 * A replacement that is not lands wrong: too tall floats above the floor, too
 * short leaves a gap. This is a report rather than a constraint, because a pack
 * may deliberately ship art the legacy set has no equivalent for.
 */
export function isLegacyWallHeight(height: number): boolean {
  return height > 0 && height % ISO_VTILE_STEP === 0
}

/** The nearest legal wall height at or above `height`. */
export function nextLegacyWallHeight(height: number): number {
  if (height <= 0) return ISO_VTILE_STEP
  return Math.ceil(height / ISO_VTILE_STEP) * ISO_VTILE_STEP
}
