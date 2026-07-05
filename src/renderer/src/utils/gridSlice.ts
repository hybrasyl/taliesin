import { PixelBuffer } from './duotone'

// ── Grid-sheet slicing ────────────────────────────────────────────────────────
//
// Slice an N×M grid sheet into equal-size cells, Tiled-style: an optional outer
// margin before the first cell and optional spacing between cells. Each cell
// becomes one source tile handed to the converter (tileConvert.ts). Pure —
// operates on PixelBuffer, no canvas.

export interface GridSpec {
  /** Cell width in source pixels. */
  cellW: number
  /** Cell height in source pixels. */
  cellH: number
  /** Transparent border before the first row/column of cells (default 0). */
  marginX?: number
  marginY?: number
  /** Gap between adjacent cells (default 0). */
  spacingX?: number
  spacingY?: number
  /** Explicit column/row counts; derived from the sheet size when omitted. */
  cols?: number
  rows?: number
}

/** How many cells fit along one axis given size, margin, cell, and spacing. */
export function gridCount(total: number, margin: number, cell: number, spacing: number): number {
  if (cell <= 0) return 0
  const usable = total - margin
  if (usable < cell) return 0
  // usable = cell + (n-1)*(cell+spacing)  ⇒  n = floor((usable+spacing)/(cell+spacing))
  return Math.floor((usable + spacing) / (cell + spacing))
}

/** A sliced cell plus its position in the grid (row-major). */
export interface GridCell {
  buffer: PixelBuffer
  row: number
  col: number
  /** Row-major index (row * cols + col). */
  index: number
}

/**
 * Slice `sheet` into cells row-major (left→right, top→bottom). Cells that would
 * extend past the sheet edge are clipped: the out-of-bounds pixels are left
 * transparent so a partial trailing cell still yields a full-size buffer.
 */
export function sliceGrid(sheet: PixelBuffer, spec: GridSpec): GridCell[] {
  const { cellW, cellH } = spec
  if (cellW <= 0 || cellH <= 0) {
    throw new Error(`sliceGrid: cell size must be positive, got ${cellW}×${cellH}`)
  }
  const marginX = spec.marginX ?? 0
  const marginY = spec.marginY ?? 0
  const spacingX = spec.spacingX ?? 0
  const spacingY = spec.spacingY ?? 0
  const cols = spec.cols ?? gridCount(sheet.width, marginX, cellW, spacingX)
  const rows = spec.rows ?? gridCount(sheet.height, marginY, cellH, spacingY)

  const cells: GridCell[] = []
  for (let row = 0; row < rows; row++) {
    const srcY0 = marginY + row * (cellH + spacingY)
    for (let col = 0; col < cols; col++) {
      const srcX0 = marginX + col * (cellW + spacingX)
      cells.push({
        buffer: extractCell(sheet, srcX0, srcY0, cellW, cellH),
        row,
        col,
        index: row * cols + col
      })
    }
  }
  return cells
}

/** Copy a cellW×cellH region out of the sheet; out-of-bounds pixels stay transparent. */
function extractCell(
  sheet: PixelBuffer,
  srcX0: number,
  srcY0: number,
  cellW: number,
  cellH: number
): PixelBuffer {
  const data = new Uint8ClampedArray(cellW * cellH * 4)
  for (let y = 0; y < cellH; y++) {
    const sy = srcY0 + y
    if (sy < 0 || sy >= sheet.height) continue
    for (let x = 0; x < cellW; x++) {
      const sx = srcX0 + x
      if (sx < 0 || sx >= sheet.width) continue
      const si = (sy * sheet.width + sx) * 4
      const di = (y * cellW + x) * 4
      data[di] = sheet.data[si]
      data[di + 1] = sheet.data[si + 1]
      data[di + 2] = sheet.data[si + 2]
      data[di + 3] = sheet.data[si + 3]
    }
  }
  return { data, width: cellW, height: cellH }
}
