import { describe, it, expect } from 'vitest'
import {
  DEFAULT_ADJUSTMENTS,
  applyAdjustments,
  buildAdjustmentLut,
  isIdentityAdjustments
} from '../imageAdjust'
import { PixelBuffer } from '../duotone'

function solidSource(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a = 255
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = a
  }
  return { data, width, height }
}

describe('isIdentityAdjustments', () => {
  it('is true for the defaults and false for any change', () => {
    expect(isIdentityAdjustments(DEFAULT_ADJUSTMENTS)).toBe(true)
    expect(isIdentityAdjustments({ brightness: 1, contrast: 0, blackPoint: 0 })).toBe(false)
    expect(isIdentityAdjustments({ brightness: 0, contrast: -5, blackPoint: 0 })).toBe(false)
    expect(isIdentityAdjustments({ brightness: 0, contrast: 0, blackPoint: 10 })).toBe(false)
  })
})

describe('applyAdjustments', () => {
  it('returns the same reference for the identity — memoization hangs off it', () => {
    const src = solidSource(2, 2, 10, 20, 30)
    expect(applyAdjustments(src, DEFAULT_ADJUSTMENTS)).toBe(src)
  })

  it('identity LUT maps every value to itself', () => {
    const lut = buildAdjustmentLut(DEFAULT_ADJUSTMENTS)
    for (const v of [0, 1, 64, 128, 200, 254, 255]) expect(lut[v]).toBe(v)
  })

  it('brightness shifts channels and clamps', () => {
    const out = applyAdjustments(solidSource(1, 1, 100, 200, 250), {
      brightness: 20,
      contrast: 0,
      blackPoint: 0
    })
    expect(out.data[0]).toBe(151) // 100 + 20·2.55
    expect(out.data[2]).toBe(255) // clamped
  })

  it('contrast pushes values away from mid-grey', () => {
    const out = applyAdjustments(solidSource(2, 1, 64, 128, 192), {
      brightness: 0,
      contrast: 50,
      blackPoint: 0
    })
    expect(out.data[0]).toBeLessThan(64) // darker darks
    expect(out.data[1]).toBe(128) // pivot unmoved
    expect(out.data[2]).toBeGreaterThan(192) // brighter brights
  })

  it('black point crushes at/below the point and keeps white at 255', () => {
    const adj = { brightness: 0, contrast: 0, blackPoint: 40 }
    const lut = buildAdjustmentLut(adj)
    expect(lut[0]).toBe(0)
    expect(lut[40]).toBe(0)
    expect(lut[41]).toBeGreaterThan(0)
    expect(lut[255]).toBe(255)
  })

  it('never touches alpha', () => {
    const out = applyAdjustments(solidSource(1, 1, 10, 20, 30, 77), {
      brightness: -80,
      contrast: 90,
      blackPoint: 100
    })
    expect(out.data[3]).toBe(77)
  })
})
