import { describe, it, expect } from 'vitest'
import { GLYPH_WIDTH, GLYPH_HEIGHT, decodeGlyphBits } from '../glyph'

describe('decodeGlyphBits', () => {
  it('decodes each row MSB-first into a boolean grid', () => {
    const glyph = new Uint8Array([0b10000000, 0b00000001])
    const bits = decodeGlyphBits(glyph)
    expect(bits.length).toBe(GLYPH_HEIGHT)
    expect(bits[0].length).toBe(GLYPH_WIDTH)
    // row 0: only the MSB (leftmost pixel) is set
    expect(bits[0][0]).toBe(true)
    expect(bits[0][7]).toBe(false)
    // row 1: only the LSB (rightmost pixel) is set
    expect(bits[1][0]).toBe(false)
    expect(bits[1][7]).toBe(true)
  })
  it('treats rows past the glyph length as all-false', () => {
    const bits = decodeGlyphBits(new Uint8Array([]))
    expect(bits.length).toBe(GLYPH_HEIGHT)
    expect(bits.every((row) => row.every((b) => b === false))).toBe(true)
  })
})
