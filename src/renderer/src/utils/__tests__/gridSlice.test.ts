import { describe, it, expect } from 'vitest'
import { sliceGrid, gridCount } from '../gridSlice'
import { PixelBuffer } from '../duotone'

/**
 * Build a sheet whose every pixel encodes the cell it belongs to, so a sliced
 * cell can be identified by any of its pixels. Each cell is painted a solid
 * colour = (r=col*10, g=row*10, b=42).
 */
function gridSheet(
  cols: number,
  rows: number,
  cellW: number,
  cellH: number,
  marginX = 0,
  marginY = 0,
  spacingX = 0,
  spacingY = 0
): PixelBuffer {
  const width = marginX + cols * cellW + (cols - 1) * spacingX
  const height = marginY + rows * cellH + (rows - 1) * spacingY
  const data = new Uint8ClampedArray(width * height * 4)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = marginX + col * (cellW + spacingX)
      const y0 = marginY + row * (cellH + spacingY)
      for (let y = 0; y < cellH; y++) {
        for (let x = 0; x < cellW; x++) {
          const i = ((y0 + y) * width + (x0 + x)) * 4
          data[i] = col * 10
          data[i + 1] = row * 10
          data[i + 2] = 42
          data[i + 3] = 255
        }
      }
    }
  }
  return { data, width, height }
}

function firstPixel(buf: PixelBuffer): [number, number, number, number] {
  return [buf.data[0], buf.data[1], buf.data[2], buf.data[3]]
}

describe('gridCount', () => {
  it('counts tightly packed cells', () => {
    expect(gridCount(56 * 4, 0, 56, 0)).toBe(4)
  })
  it('accounts for margin and spacing', () => {
    // margin 2, cell 10, spacing 3: 2 + 10 + 3 + 10 + 3 + 10 = 38 fits 3 cells
    expect(gridCount(38, 2, 10, 3)).toBe(3)
    expect(gridCount(37, 2, 10, 3)).toBe(2) // one pixel short of the 3rd
  })
  it('returns 0 when no cell fits', () => {
    expect(gridCount(5, 0, 10, 0)).toBe(0)
  })
})

describe('sliceGrid', () => {
  it('slices a 3×2 sheet row-major with derived counts', () => {
    const sheet = gridSheet(3, 2, 8, 8)
    const cells = sliceGrid(sheet, { cellW: 8, cellH: 8 })
    expect(cells).toHaveLength(6)
    // row-major: index 0 = (r0,c0), index 3 = (r1,c0)
    expect(cells[0].row).toBe(0)
    expect(cells[0].col).toBe(0)
    expect(firstPixel(cells[0].buffer)).toEqual([0, 0, 42, 255])
    expect(cells[2].col).toBe(2)
    expect(firstPixel(cells[2].buffer)).toEqual([20, 0, 42, 255])
    expect(cells[3].row).toBe(1)
    expect(firstPixel(cells[3].buffer)).toEqual([0, 10, 42, 255])
    for (const c of cells) {
      expect(c.buffer.width).toBe(8)
      expect(c.buffer.height).toBe(8)
    }
  })

  it('respects margin and spacing', () => {
    const sheet = gridSheet(2, 2, 6, 6, 3, 3, 2, 2)
    const cells = sliceGrid(sheet, {
      cellW: 6,
      cellH: 6,
      marginX: 3,
      marginY: 3,
      spacingX: 2,
      spacingY: 2
    })
    expect(cells).toHaveLength(4)
    expect(firstPixel(cells[0].buffer)).toEqual([0, 0, 42, 255])
    expect(firstPixel(cells[1].buffer)).toEqual([10, 0, 42, 255])
    expect(firstPixel(cells[3].buffer)).toEqual([10, 10, 42, 255])
  })

  it('honours explicit cols/rows', () => {
    const sheet = gridSheet(4, 4, 5, 5)
    const cells = sliceGrid(sheet, { cellW: 5, cellH: 5, cols: 2, rows: 2 })
    expect(cells).toHaveLength(4)
  })

  it('leaves out-of-bounds pixels transparent for a clipped trailing cell', () => {
    // 10-wide sheet, cell 8, cols forced to 2 → 2nd cell runs off the edge
    const sheet = gridSheet(1, 1, 10, 8)
    const cells = sliceGrid(sheet, { cellW: 8, cellH: 8, cols: 2, rows: 1 })
    expect(cells).toHaveLength(2)
    const clipped = cells[1].buffer
    // right column x=8,9 exist in sheet (0..9) but x from 2..7 of the cell are past → transparent
    // the far-right pixel of the clipped cell maps to sheet x=15 (out of bounds) → alpha 0
    const farRight = (0 * 8 + 7) * 4 + 3
    expect(clipped.data[farRight]).toBe(0)
  })

  it('throws on non-positive cell size', () => {
    const sheet = gridSheet(1, 1, 4, 4)
    expect(() => sliceGrid(sheet, { cellW: 0, cellH: 4 })).toThrow()
  })
})
