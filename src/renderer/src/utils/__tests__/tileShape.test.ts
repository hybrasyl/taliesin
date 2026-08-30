import { describe, it, expect } from 'vitest'
import {
  wallColumnsFor,
  sliceColumns,
  mirrorX,
  padBelow,
  transparentRowsBelow,
  trimBelow,
  isLegacyWallHeight,
  nextLegacyWallHeight,
  splitWallHeight,
  WALL_FACE_WIDTH
} from '../tileShape'
import type { PixelBuffer } from '../duotone'

/** A buffer whose red channel encodes x and green encodes y, so moves are visible. */
function ramp(width: number, height: number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      data[i] = x
      data[i + 1] = y
      data[i + 2] = 0
      data[i + 3] = 255
    }
  }
  return { data, width, height }
}

function px(b: PixelBuffer, x: number, y: number): number[] {
  const i = (y * b.width + x) * 4
  return [b.data[i], b.data[i + 1], b.data[i + 2], b.data[i + 3]]
}

describe('wallColumnsFor', () => {
  it('counts one tile per face width', () => {
    expect(wallColumnsFor(WALL_FACE_WIDTH)).toBe(1)
    expect(wallColumnsFor(WALL_FACE_WIDTH * 3)).toBe(3)
    expect(wallColumnsFor(WALL_FACE_WIDTH * 4)).toBe(4)
  })

  it('rounds, so art a few pixels out is still the tile count it looks like', () => {
    // 3 tiles is 84. Either side of it stays 3 rather than gaining a sliver column.
    expect(wallColumnsFor(82)).toBe(3)
    expect(wallColumnsFor(87)).toBe(3)
  })

  it('never returns less than one', () => {
    expect(wallColumnsFor(4)).toBe(1)
    expect(wallColumnsFor(0)).toBe(1)
    expect(wallColumnsFor(-10)).toBe(1)
  })
})

describe('sliceColumns', () => {
  it('returns the source untouched for a single column', () => {
    const src = ramp(28, 10)
    expect(sliceColumns(src, 1)).toEqual([src])
  })

  it('cuts a three-tile source into three tiles instead of shrinking it into one', () => {
    const src = ramp(WALL_FACE_WIDTH * 3, 10)
    const cols = sliceColumns(src, 3)
    expect(cols).toHaveLength(3)
    expect(cols.map((c) => c.width)).toEqual([28, 28, 28])
    // Each column carries its own part of the source, not a squeezed copy of all.
    expect(px(cols[0]!, 0, 0)[0]).toBe(0)
    expect(px(cols[1]!, 0, 0)[0]).toBe(28)
    expect(px(cols[2]!, 0, 0)[0]).toBe(56)
  })

  it('tiles the source exactly when the width does not divide evenly', () => {
    const src = ramp(85, 4)
    const cols = sliceColumns(src, 3)
    expect(cols.reduce((n, c) => n + c.width, 0)).toBe(85)
    expect(cols.map((c) => c.width)).toEqual([28, 29, 28])
  })

  it('keeps every row', () => {
    const cols = sliceColumns(ramp(56, 7), 2)
    expect(cols.every((c) => c.height === 7)).toBe(true)
    expect(px(cols[1]!, 0, 6)).toEqual([28, 6, 0, 255])
  })
})

describe('mirrorX', () => {
  it('reverses each row, turning a face into its opposite', () => {
    const src = ramp(4, 2)
    const out = mirrorX(src)
    expect(px(out, 0, 0)[0]).toBe(3)
    expect(px(out, 3, 0)[0]).toBe(0)
  })

  it('leaves rows in place', () => {
    const out = mirrorX(ramp(4, 3))
    expect(px(out, 0, 2)[1]).toBe(2)
  })

  it('is its own inverse', () => {
    const src = ramp(9, 5)
    expect(mirrorX(mirrorX(src)).data).toEqual(src.data)
  })

  it('keeps the dimensions', () => {
    const out = mirrorX(ramp(28, 42))
    expect([out.width, out.height]).toEqual([28, 42])
  })
})

describe('padBelow', () => {
  it('adds transparent rows underneath, which raises the art', () => {
    const out = padBelow(ramp(2, 2), 3)
    expect(out.height).toBe(5)
    // The art stays at the top ...
    expect(px(out, 0, 0)).toEqual([0, 0, 0, 255])
    expect(px(out, 0, 1)).toEqual([0, 1, 0, 255])
    // ... and the new rows below are transparent.
    expect(px(out, 0, 4)).toEqual([0, 0, 0, 0])
  })

  it('removes rows from beneath, which lowers the art', () => {
    const out = padBelow(ramp(2, 5), -2)
    expect(out.height).toBe(3)
    expect(px(out, 0, 2)).toEqual([0, 2, 0, 255])
  })

  it('returns the source unchanged for no change', () => {
    const src = ramp(3, 3)
    expect(padBelow(src, 0)).toBe(src)
  })

  it('never removes the last row', () => {
    expect(padBelow(ramp(2, 3), -99).height).toBe(1)
  })

  it('keeps the width', () => {
    expect(padBelow(ramp(28, 10), 14).width).toBe(28)
  })
})

describe('transparentRowsBelow', () => {
  it('counts the fully transparent rows at the base', () => {
    expect(transparentRowsBelow(padBelow(ramp(4, 3), 5))).toBe(5)
  })

  it('counts zero when the bottom row carries paint', () => {
    expect(transparentRowsBelow(ramp(4, 3))).toBe(0)
  })

  it('stops at a row with a single painted pixel', () => {
    const buf = padBelow(ramp(4, 2), 4)
    // one pixel of paint in the second padding row keeps that row and the rows
    // above it
    buf.data[(3 * 4 + 2) * 4 + 3] = 255
    expect(transparentRowsBelow(buf)).toBe(2)
  })

  it('counts every row of a fully transparent image', () => {
    const empty: PixelBuffer = { data: new Uint8ClampedArray(4 * 3 * 4), width: 4, height: 3 }
    expect(transparentRowsBelow(empty)).toBe(3)
  })
})

describe('trimBelow', () => {
  it('removes exactly the transparent padding, leaving the art on its base', () => {
    const src = ramp(4, 3)
    const out = trimBelow(padBelow(src, 5))
    expect(out.height).toBe(3)
    expect(out.data).toEqual(src.data)
  })

  it('returns the source unchanged when there is nothing to trim', () => {
    const src = ramp(4, 3)
    expect(trimBelow(src)).toBe(src)
  })

  it('keeps one row of a fully transparent image', () => {
    const empty: PixelBuffer = { data: new Uint8ClampedArray(4 * 3 * 4), width: 4, height: 3 }
    expect(trimBelow(empty).height).toBe(1)
  })

  it('keeps the width', () => {
    expect(trimBelow(padBelow(ramp(28, 10), 14)).width).toBe(28)
  })
})

describe('splitWallHeight', () => {
  it('gives the whole tile to the art when nothing is raised', () => {
    expect(splitWallHeight(56, 0)).toEqual({ art: 56, blank: 0 })
  })

  it('takes the blank rows out of the art, so the tile height is unchanged', () => {
    const { art, blank } = splitWallHeight(56, 14)
    expect({ art, blank }).toEqual({ art: 42, blank: 14 })
    expect(art + blank).toBe(56)
  })

  it('keeps the total for every raise, which is what a legacy replacement needs', () => {
    for (const rows of [0, 1, 13, 14, 28, 41]) {
      const s = splitWallHeight(42, rows)
      expect(s.art + s.blank).toBe(42)
    }
  })

  it('always leaves at least one row of art', () => {
    expect(splitWallHeight(42, 42)).toEqual({ art: 1, blank: 41 })
    expect(splitWallHeight(42, 999)).toEqual({ art: 1, blank: 41 })
    expect(splitWallHeight(1, 5)).toEqual({ art: 1, blank: 0 })
  })

  it('ignores a negative raise rather than cutting into the art', () => {
    expect(splitWallHeight(56, -14)).toEqual({ art: 56, blank: 0 })
  })

  it('rounds both, and never lets the total fall below one row', () => {
    expect(splitWallHeight(56.4, 13.6)).toEqual({ art: 42, blank: 14 })
    expect(splitWallHeight(0, 0)).toEqual({ art: 1, blank: 0 })
    expect(splitWallHeight(-9, 3)).toEqual({ art: 1, blank: 0 })
  })
})

describe('legacy wall heights', () => {
  it('accepts a multiple of the vertical step', () => {
    expect(isLegacyWallHeight(14)).toBe(true)
    expect(isLegacyWallHeight(56)).toBe(true)
  })

  it('rejects anything else, including zero', () => {
    expect(isLegacyWallHeight(15)).toBe(false)
    expect(isLegacyWallHeight(0)).toBe(false)
    expect(isLegacyWallHeight(-14)).toBe(false)
  })

  it('rounds up to the next legal height', () => {
    expect(nextLegacyWallHeight(1)).toBe(14)
    expect(nextLegacyWallHeight(14)).toBe(14)
    expect(nextLegacyWallHeight(15)).toBe(28)
    expect(nextLegacyWallHeight(0)).toBe(14)
  })
})
