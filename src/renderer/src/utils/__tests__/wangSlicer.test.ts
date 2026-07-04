import { describe, it, expect } from 'vitest'
import {
  WANG_SCHEMES,
  getWangScheme,
  sliceWangSheet,
  canonicalizeBlobMask,
  describeMask,
  WangScheme
} from '../wangSlicer'
import { PixelBuffer } from '../duotone'

/**
 * Build a sheet for a scheme where each used cell is painted a solid colour that
 * encodes its row-major index (r = index, g = 0, b = 0), so a sliced cell can be
 * matched back to the cell it came from. Cell size `cs`, no margin/spacing.
 */
function schemeSheet(scheme: WangScheme, cs: number): PixelBuffer {
  const width = scheme.cols * cs
  const height = scheme.rows * cs
  const data = new Uint8ClampedArray(width * height * 4)
  for (let row = 0; row < scheme.rows; row++) {
    for (let col = 0; col < scheme.cols; col++) {
      const index = row * scheme.cols + col
      for (let y = 0; y < cs; y++) {
        for (let x = 0; x < cs; x++) {
          const i = ((row * cs + y) * width + (col * cs + x)) * 4
          data[i] = index
          data[i + 3] = 255
        }
      }
    }
  }
  return { data, width, height }
}

describe('wang scheme registry', () => {
  it('edge16 / corner16 are 16 tiles in a 4×4 grid, cell M = mask M', () => {
    for (const id of ['edge16', 'corner16'] as const) {
      const s = getWangScheme(id)
      expect(s.tileCount).toBe(16)
      expect(s.cols * s.rows).toBe(16)
      expect(s.masks).toEqual(Array.from({ length: 16 }, (_, i) => i))
    }
  })

  it('blob47 has exactly 47 distinct canonical masks', () => {
    const s = WANG_SCHEMES.blob47
    expect(s.tileCount).toBe(47)
    const used = s.masks.filter((m): m is number => m !== null)
    expect(used).toHaveLength(47)
    expect(new Set(used).size).toBe(47)
  })

  it('blob47 packs 47 tiles into a 48-cell grid with one unused cell', () => {
    const s = WANG_SCHEMES.blob47
    expect(s.cols * s.rows).toBe(48)
    expect(s.masks.filter((m) => m === null)).toHaveLength(1)
  })
})

describe('canonicalizeBlobMask — corner culling', () => {
  it('drops a corner whose two edges are not both present', () => {
    // NE (2) with neither N nor E → NE cleared
    expect(canonicalizeBlobMask(2)).toBe(0)
    // NE (2) with only N (1) → NE cleared, N kept
    expect(canonicalizeBlobMask(1 | 2)).toBe(1)
  })
  it('keeps a corner when both its edges are present', () => {
    // N|E|NE all set → unchanged
    expect(canonicalizeBlobMask(1 | 2 | 4)).toBe(1 | 2 | 4)
  })
  it('collapses all 256 masks to exactly 47 canonical values', () => {
    const set = new Set<number>()
    for (let m = 0; m < 256; m++) set.add(canonicalizeBlobMask(m))
    expect(set.size).toBe(47)
  })
  it('is idempotent', () => {
    for (let m = 0; m < 256; m++) {
      expect(canonicalizeBlobMask(canonicalizeBlobMask(m))).toBe(canonicalizeBlobMask(m))
    }
  })
})

describe('sliceWangSheet', () => {
  it('slices edge16 into 16 masked tiles in row-major order', () => {
    const scheme = getWangScheme('edge16')
    const tiles = sliceWangSheet(schemeSheet(scheme, 8), scheme, { cellW: 8, cellH: 8 })
    expect(tiles).toHaveLength(16)
    for (let i = 0; i < 16; i++) {
      expect(tiles[i].index).toBe(i)
      expect(tiles[i].mask).toBe(i) // cell M holds mask M
      expect(tiles[i].buffer.data[0]).toBe(i) // encoded cell index
      expect(tiles[i].buffer.width).toBe(8)
      expect(tiles[i].buffer.height).toBe(8)
    }
  })

  it('skips the unused blob47 grid cell (47 tiles, not 48)', () => {
    const scheme = WANG_SCHEMES.blob47
    const tiles = sliceWangSheet(schemeSheet(scheme, 4), scheme, { cellW: 4, cellH: 4 })
    expect(tiles).toHaveLength(47)
    // masks match the scheme's canonical table for each kept cell
    for (const t of tiles) expect(t.mask).toBe(scheme.masks[t.index])
  })

  it('honours margin and spacing via the underlying grid slicer', () => {
    const scheme = getWangScheme('corner16')
    // rebuild a sheet with 2px margin + 1px spacing
    const cs = 6
    const m = 2
    const sp = 1
    const width = m + scheme.cols * cs + (scheme.cols - 1) * sp
    const height = m + scheme.rows * cs + (scheme.rows - 1) * sp
    const data = new Uint8ClampedArray(width * height * 4)
    for (let row = 0; row < scheme.rows; row++)
      for (let col = 0; col < scheme.cols; col++) {
        const index = row * scheme.cols + col
        const x0 = m + col * (cs + sp)
        const y0 = m + row * (cs + sp)
        for (let y = 0; y < cs; y++)
          for (let x = 0; x < cs; x++) {
            const i = ((y0 + y) * width + (x0 + x)) * 4
            data[i] = index
            data[i + 3] = 255
          }
      }
    const tiles = sliceWangSheet({ data, width, height }, scheme, {
      cellW: cs,
      cellH: cs,
      marginX: m,
      marginY: m,
      spacingX: sp,
      spacingY: sp
    })
    expect(tiles).toHaveLength(16)
    expect(tiles[5].buffer.data[0]).toBe(5)
  })
})

describe('describeMask', () => {
  it('lists set neighbour names', () => {
    const s = getWangScheme('edge16')
    expect(describeMask(s, 0)).toBe('(none)')
    expect(describeMask(s, 1 | 4)).toBe('N|S')
    expect(describeMask(s, 15)).toBe('N|E|S|W')
  })
})
