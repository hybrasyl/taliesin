import { describe, it, expect } from 'vitest'
import {
  parseHex, luminance, mapLuminance, applyDuotone, toGrayscale, buildLuminanceRamp,
  PixelBuffer,
} from '../duotone'
import { PaletteEntry, DuotoneParams } from '../paletteTypes'

const ENTRY: PaletteEntry = {
  id: 'fire',
  name: 'Fire',
  shadowColor: '#7A1A00',
  highlightColor: '#FF8A3D',
}

const DEFAULT_PARAMS: DuotoneParams = {
  darkFactor: 0.3,
  lightFactor: 0.3,
  midpointLow: 0.25,
  midpointHigh: 0.75,
}

function solidSource(width: number, height: number, r: number, g: number, b: number, a = 255): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = a
  }
  return { data, width, height }
}

describe('parseHex', () => {
  it('parses #RRGGBB form', () => {
    expect(parseHex('#FF8A3D')).toEqual({ r: 0xFF, g: 0x8A, b: 0x3D })
  })
  it('parses without leading #', () => {
    expect(parseHex('00FF80')).toEqual({ r: 0, g: 0xFF, b: 0x80 })
  })
  it('handles black and white', () => {
    expect(parseHex('#000000')).toEqual({ r: 0, g: 0, b: 0 })
    expect(parseHex('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 })
  })
})

describe('luminance', () => {
  it('black has luminance 0', () => {
    expect(luminance(0, 0, 0)).toBe(0)
  })
  it('white has luminance 1', () => {
    expect(luminance(255, 255, 255)).toBeCloseTo(1, 6)
  })
  it('uses BT.601 weights', () => {
    expect(luminance(255, 0, 0)).toBeCloseTo(0.299, 6)
    expect(luminance(0, 255, 0)).toBeCloseTo(0.587, 6)
    expect(luminance(0, 0, 255)).toBeCloseTo(0.114, 6)
  })
})

describe('mapLuminance', () => {
  it('at midpointLow returns the palette shadow color', () => {
    const c = mapLuminance(0.25, ENTRY, DEFAULT_PARAMS)
    expect(c.r).toBeCloseTo(0x7A, 0)
    expect(c.g).toBeCloseTo(0x1A, 0)
    expect(c.b).toBeCloseTo(0x00, 0)
  })
  it('at midpointHigh returns the palette highlight color', () => {
    const c = mapLuminance(0.75, ENTRY, DEFAULT_PARAMS)
    expect(c.r).toBeCloseTo(0xFF, 0)
    expect(c.g).toBeCloseTo(0x8A, 0)
    expect(c.b).toBeCloseTo(0x3D, 0)
  })
  it('at luminance 0 returns shadow × (1 - darkFactor)', () => {
    const c = mapLuminance(0, ENTRY, DEFAULT_PARAMS)
    expect(c.r).toBeCloseTo(0x7A * 0.7, 0)
    expect(c.g).toBeCloseTo(0x1A * 0.7, 0)
    expect(c.b).toBeCloseTo(0, 5)
  })
  it('at luminance 1 returns highlight pushed toward white by lightFactor', () => {
    const c = mapLuminance(1, ENTRY, DEFAULT_PARAMS)
    expect(c.r).toBeCloseTo(0xFF + (255 - 0xFF) * 0.3, 0)
    expect(c.g).toBeCloseTo(0x8A + (255 - 0x8A) * 0.3, 0)
    expect(c.b).toBeCloseTo(0x3D + (255 - 0x3D) * 0.3, 0)
  })
  it('midpoint band interpolates linearly between shadow and highlight', () => {
    const c = mapLuminance(0.5, ENTRY, DEFAULT_PARAMS)
    expect(c.r).toBeCloseTo((0x7A + 0xFF) / 2, 0)
    expect(c.g).toBeCloseTo((0x1A + 0x8A) / 2, 0)
    expect(c.b).toBeCloseTo((0x00 + 0x3D) / 2, 0)
  })
})

describe('mapLuminance with clamps', () => {
  it('clampBlack forces luminance 0 to pure black', () => {
    const c = mapLuminance(0, ENTRY, { ...DEFAULT_PARAMS, clampBlack: true })
    expect(c).toEqual({ r: 0, g: 0, b: 0 })
  })
  it('clampBlack does not affect luminance > 0', () => {
    const withClamp = mapLuminance(0.0001, ENTRY, { ...DEFAULT_PARAMS, clampBlack: true })
    const without = mapLuminance(0.0001, ENTRY, DEFAULT_PARAMS)
    expect(withClamp).toEqual(without)
  })
  it('clampWhite forces luminance 1 to pure white', () => {
    const c = mapLuminance(1, ENTRY, { ...DEFAULT_PARAMS, clampWhite: true })
    expect(c).toEqual({ r: 255, g: 255, b: 255 })
  })
  it('clampWhite does not affect luminance < 1', () => {
    const withClamp = mapLuminance(0.9999, ENTRY, { ...DEFAULT_PARAMS, clampWhite: true })
    const without = mapLuminance(0.9999, ENTRY, DEFAULT_PARAMS)
    expect(withClamp).toEqual(without)
  })
  it('both clamps together produce 6-stop behavior', () => {
    const params = { ...DEFAULT_PARAMS, clampBlack: true, clampWhite: true }
    expect(mapLuminance(0, ENTRY, params)).toEqual({ r: 0, g: 0, b: 0 })
    expect(mapLuminance(1, ENTRY, params)).toEqual({ r: 255, g: 255, b: 255 })
    const mid = mapLuminance(0.5, ENTRY, params)
    expect(mid.r).toBeCloseTo((0x7A + 0xFF) / 2, 0)
  })
})

describe('applyDuotone', () => {
  it('preserves alpha', () => {
    const src = solidSource(2, 2, 128, 128, 128, 77)
    const out = applyDuotone(src, ENTRY, DEFAULT_PARAMS)
    for (let i = 3; i < out.data.length; i += 4) {
      expect(out.data[i]).toBe(77)
    }
  })
  it('produces deterministic output', () => {
    const src = solidSource(4, 4, 100, 150, 200)
    const a = applyDuotone(src, ENTRY, DEFAULT_PARAMS)
    const b = applyDuotone(src, ENTRY, DEFAULT_PARAMS)
    expect(Array.from(a.data)).toEqual(Array.from(b.data))
  })
  it('returns same dimensions as source', () => {
    const src = solidSource(7, 3, 50, 50, 50)
    const out = applyDuotone(src, ENTRY, DEFAULT_PARAMS)
    expect(out.width).toBe(7)
    expect(out.height).toBe(3)
    expect(out.data.length).toBe(7 * 3 * 4)
  })
})

describe('toGrayscale', () => {
  it('converts to gray using BT.601', () => {
    const src = solidSource(1, 1, 255, 0, 0)
    const out = toGrayscale(src)
    const expected = Math.round(0.299 * 255)
    expect(out.data[0]).toBe(expected)
    expect(out.data[1]).toBe(expected)
    expect(out.data[2]).toBe(expected)
  })
  it('preserves alpha', () => {
    const src = solidSource(1, 1, 128, 64, 32, 200)
    const out = toGrayscale(src)
    expect(out.data[3]).toBe(200)
  })
})

describe('buildLuminanceRamp', () => {
  it('brightest at center, darkest at corners', () => {
    const ramp = buildLuminanceRamp(16)
    const cx = 8, cy = 8
    const centerIdx = (cy * 16 + cx) * 4
    const cornerIdx = 0
    expect(ramp.data[centerIdx]).toBeGreaterThan(ramp.data[cornerIdx])
  })
  it('fully opaque', () => {
    const ramp = buildLuminanceRamp(4)
    for (let i = 3; i < ramp.data.length; i += 4) {
      expect(ramp.data[i]).toBe(255)
    }
  })
})
