import { describe, it, expect } from 'vitest'
import { previewScale, PREVIEW_MAX_UPSCALE } from '../previewFit'

describe('previewScale', () => {
  it('magnifies tile-sized art by a whole number of pixels', () => {
    // A 28×42 wall face fits a 320 box 7 times over, but the cap holds it at 5.
    expect(previewScale(28, 42, 320)).toBe(PREVIEW_MAX_UPSCALE)
    // 56×27 floor, same cap.
    expect(previewScale(56, 27, 320)).toBe(PREVIEW_MAX_UPSCALE)
  })

  it('never magnifies past the cap, however small the art is', () => {
    expect(previewScale(1, 1, 4000)).toBe(PREVIEW_MAX_UPSCALE)
  })

  it('rounds a partial magnification down, so pixels stay square', () => {
    // 320/120 is 2.67 — 2× keeps every source pixel the same size on screen.
    expect(previewScale(120, 120, 320)).toBe(2)
  })

  it('shrinks art that is bigger than the box, so it cannot fill the screen', () => {
    const s = previewScale(512, 512, 320)
    expect(s).toBeCloseTo(320 / 512)
    expect(512 * s).toBeLessThanOrEqual(320)
  })

  it('fits the longer side, so a wide source is not cut off', () => {
    const s = previewScale(1024, 64, 320)
    expect(1024 * s).toBeLessThanOrEqual(320)
    expect(64 * s).toBeLessThanOrEqual(320)
  })

  it('holds at 1 for art exactly the size of the box', () => {
    expect(previewScale(320, 320, 320)).toBe(1)
  })

  it('returns 1 rather than a bad number for an empty image or box', () => {
    expect(previewScale(0, 10, 320)).toBe(1)
    expect(previewScale(10, 0, 320)).toBe(1)
    expect(previewScale(10, 10, 0)).toBe(1)
    expect(previewScale(-4, 10, 320)).toBe(1)
  })
})
