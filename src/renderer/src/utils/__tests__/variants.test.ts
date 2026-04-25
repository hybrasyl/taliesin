import { describe, it, expect } from 'vitest'
import { PixelBuffer } from '../duotone'
import {
  DEFAULT_VARIANTS, autoDetectBest, luminanceHistogram, scoreVariant, variantToParams,
} from '../variants'
import { PaletteEntry } from '../paletteTypes'

const ENTRY: PaletteEntry = {
  id: 'fire',
  name: 'Fire',
  shadowColor: '#7A1A00',
  highlightColor: '#FF8A3D',
}

function gradient(width: number, height: number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = Math.round((x / Math.max(1, width - 1)) * 255)
      const i = (y * width + x) * 4
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return { data, width, height }
}

function transparent(width: number, height: number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4)
  return { data, width, height }
}

describe('DEFAULT_VARIANTS', () => {
  it('contains 8 entries with unique ids', () => {
    expect(DEFAULT_VARIANTS).toHaveLength(8)
    const ids = new Set(DEFAULT_VARIANTS.map(v => v.id))
    expect(ids.size).toBe(8)
  })
  it('each variant has factors in [0,1]', () => {
    for (const v of DEFAULT_VARIANTS) {
      expect(v.darkFactor).toBeGreaterThanOrEqual(0)
      expect(v.darkFactor).toBeLessThanOrEqual(1)
      expect(v.lightFactor).toBeGreaterThanOrEqual(0)
      expect(v.lightFactor).toBeLessThanOrEqual(1)
      expect(v.midpointLow).toBeGreaterThanOrEqual(0)
      expect(v.midpointHigh).toBeLessThanOrEqual(1)
      expect(v.midpointLow).toBeLessThan(v.midpointHigh)
    }
  })
})

describe('luminanceHistogram', () => {
  it('a uniform gradient produces a roughly flat histogram', () => {
    const hist = luminanceHistogram(gradient(256, 1))
    const sum = hist.reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1, 6)
    // Each bin should be roughly 1/256 (with some quantization noise).
    for (const v of hist) expect(v).toBeLessThan(0.02)
  })
  it('skips fully transparent pixels', () => {
    const hist = luminanceHistogram(transparent(4, 4))
    const sum = hist.reduce((a, b) => a + b, 0)
    expect(sum).toBe(0)
  })
})

describe('scoreVariant', () => {
  it('identical histograms give rangePreservation = 1', () => {
    const hist = luminanceHistogram(gradient(64, 1))
    const score = scoreVariant(hist, hist, 0.25, 0.75)
    expect(score.rangePreservation).toBeCloseTo(1, 6)
  })
  it('totally non-overlapping histograms give rangePreservation near 0', () => {
    const a = new Array(256).fill(0); a[0] = 1
    const b = new Array(256).fill(0); b[255] = 1
    const score = scoreVariant(a, b, 0.25, 0.75)
    expect(score.rangePreservation).toBeCloseTo(0, 6)
  })
  it('clamps contrast to [0, 1]', () => {
    const hist = luminanceHistogram(gradient(64, 1))
    const score = scoreVariant(hist, hist, 0.25, 0.75)
    expect(score.contrast).toBeGreaterThanOrEqual(0)
    expect(score.contrast).toBeLessThanOrEqual(1)
  })
  it('total weights match documented 0.5/0.3/0.2', () => {
    const score = scoreVariant(
      new Array(256).fill(1 / 256),
      new Array(256).fill(1 / 256),
      0.25, 0.75,
    )
    const expected =
      0.5 * score.rangePreservation +
      0.3 * score.contrast +
      0.2 * score.midtonePresence
    expect(score.total).toBeCloseTo(expected, 6)
  })
})

describe('autoDetectBest', () => {
  it('returns one of the supplied variants', () => {
    const src = gradient(64, 1)
    const result = autoDetectBest(src, ENTRY)
    const ids = DEFAULT_VARIANTS.map(v => v.id)
    expect(ids).toContain(result.bestVariantId)
  })
  it('produces a score for every variant', () => {
    const src = gradient(64, 1)
    const result = autoDetectBest(src, ENTRY)
    expect(result.scores).toHaveLength(DEFAULT_VARIANTS.length)
    for (const s of result.scores) {
      expect(typeof s.score.total).toBe('number')
    }
  })
  it('picks the highest-total variant', () => {
    const src = gradient(64, 1)
    const result = autoDetectBest(src, ENTRY)
    const best = result.scores.find(s => s.variantId === result.bestVariantId)
    expect(best).toBeDefined()
    for (const s of result.scores) {
      expect(s.score.total).toBeLessThanOrEqual(best!.score.total + 1e-9)
    }
  })
})

describe('variantToParams', () => {
  it('drops the metadata fields', () => {
    const p = variantToParams(DEFAULT_VARIANTS[0])
    expect(Object.keys(p).sort()).toEqual(['darkFactor', 'lightFactor', 'midpointHigh', 'midpointLow'])
  })
})
