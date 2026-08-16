import { describe, it, expect } from 'vitest'
import {
  aspectDeviation,
  ASPECT_TOLERANCE,
  FIELD_ASPECT,
  FIELD_WIDTH,
  FIELD_HEIGHT
} from '../worldMapRenderer'

describe('aspectDeviation', () => {
  it('is zero for the field frame itself', () => {
    expect(aspectDeviation(FIELD_WIDTH, FIELD_HEIGHT)).toBe(0)
    expect(FIELD_ASPECT).toBeCloseTo(4 / 3)
  })

  it('is zero for any exact multiple of the frame', () => {
    expect(aspectDeviation(1280, 960)).toBeCloseTo(0)
    expect(aspectDeviation(1920, 1440)).toBeCloseTo(0)
  })

  it('clears the known-good pack image', () => {
    // testworld.datf ships field001.png at 997x750 — 0.3% out, undetectable.
    const d = aspectDeviation(997, 750)
    expect(d).toBeGreaterThan(0)
    expect(d).toBeLessThan(ASPECT_TOLERANCE)
  })

  it('reports art that is genuinely off-aspect', () => {
    // 16:9 into a 4:3 frame squeezes hard.
    expect(aspectDeviation(1280, 720)).toBeGreaterThan(ASPECT_TOLERANCE)
    // Taller than 4:3 stretches the other way, and is reported the same.
    expect(aspectDeviation(640, 600)).toBeGreaterThan(ASPECT_TOLERANCE)
  })

  it('is a fraction of the frame ratio, so it reads the same either way round', () => {
    // 5% wide and 5% narrow give the same size of complaint.
    const wide = aspectDeviation(FIELD_ASPECT * 1.05 * 100, 100)
    const narrow = aspectDeviation(FIELD_ASPECT * 0.95 * 100, 100)
    expect(wide).toBeCloseTo(0.05)
    expect(narrow).toBeCloseTo(0.05)
  })

  it('treats a degenerate size as no deviation rather than dividing by zero', () => {
    expect(aspectDeviation(0, 480)).toBe(0)
    expect(aspectDeviation(640, 0)).toBe(0)
  })
})
