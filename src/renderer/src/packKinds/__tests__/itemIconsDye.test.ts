import { describe, it, expect } from 'vitest'
import { CANONICAL_DYE_HEX, isCanonicalDye, scanDyeUsage } from '../itemIconsDye'
import type { PixelBuffer } from '../../utils/duotone'

function buildBuffer(pixels: [number, number, number, number][]): PixelBuffer {
  const data = new Uint8ClampedArray(pixels.length * 4)
  pixels.forEach(([r, g, b, a], i) => {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = a
  })
  return { data, width: pixels.length, height: 1 }
}

describe('CANONICAL_DYE_HEX', () => {
  it('contains the 6 canonical hex codes from the authoring guide', () => {
    expect(CANONICAL_DYE_HEX).toEqual([
      '#B393C7',
      '#9B7BB7',
      '#8F5BA3',
      '#7F3B93',
      '#47235F',
      '#37005B'
    ])
  })
})

describe('isCanonicalDye', () => {
  it('matches each canonical RGB exactly', () => {
    expect(isCanonicalDye(0xb3, 0x93, 0xc7)).toBe(true)
    expect(isCanonicalDye(0x9b, 0x7b, 0xb7)).toBe(true)
    expect(isCanonicalDye(0x8f, 0x5b, 0xa3)).toBe(true)
    expect(isCanonicalDye(0x7f, 0x3b, 0x93)).toBe(true)
    expect(isCanonicalDye(0x47, 0x23, 0x5f)).toBe(true)
    expect(isCanonicalDye(0x37, 0x00, 0x5b)).toBe(true)
  })

  it('rejects near-misses', () => {
    expect(isCanonicalDye(0xb4, 0x93, 0xc7)).toBe(false)
    expect(isCanonicalDye(0xff, 0x00, 0x00)).toBe(false)
    expect(isCanonicalDye(0, 0, 0)).toBe(false)
  })
})

describe('scanDyeUsage', () => {
  it('counts canonical pixels and skips fully transparent ones', () => {
    const buf = buildBuffer([
      [0xb3, 0x93, 0xc7, 255], // canonical
      [0x9b, 0x7b, 0xb7, 255], // canonical
      [0xff, 0xff, 0xff, 255], // opaque non-purple
      [0, 0, 0, 0] // transparent — should be skipped
    ])
    const report = scanDyeUsage(buf)
    expect(report.canonicalPixels).toBe(2)
    expect(report.totalOpaquePixels).toBe(3)
    expect(report.nonDyeablePurplePixels).toBe(0)
  })

  it('flags off-palette purples as nonDyeablePurplePixels', () => {
    // (200, 100, 200) is "purple-ish" but not in the canonical palette
    const buf = buildBuffer([
      [200, 100, 200, 255],
      [0xb3, 0x93, 0xc7, 255], // canonical
      [10, 10, 10, 255] // dark non-purple
    ])
    const report = scanDyeUsage(buf)
    expect(report.canonicalPixels).toBe(1)
    expect(report.nonDyeablePurplePixels).toBe(1)
    expect(report.totalOpaquePixels).toBe(3)
  })

  it('returns zero counts for an empty buffer', () => {
    const report = scanDyeUsage(buildBuffer([]))
    expect(report.totalOpaquePixels).toBe(0)
    expect(report.canonicalPixels).toBe(0)
    expect(report.nonDyeablePurplePixels).toBe(0)
  })
})
