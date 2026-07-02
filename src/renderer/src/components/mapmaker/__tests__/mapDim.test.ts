import { describe, it, expect } from 'vitest'
import { clampMapDim } from '../mapDim'

describe('clampMapDim', () => {
  it('clamps to the 1..512 range', () => {
    expect(clampMapDim('0')).toBe(1)
    expect(clampMapDim('600')).toBe(512)
    expect(clampMapDim('64')).toBe(64)
    expect(clampMapDim('512')).toBe(512)
  })
  it('defaults empty / non-numeric input to 1', () => {
    expect(clampMapDim('')).toBe(1)
    expect(clampMapDim('abc')).toBe(1)
  })
  it('parses a leading integer', () => {
    expect(clampMapDim('32.9')).toBe(32)
    expect(clampMapDim('48px')).toBe(48)
  })
})
