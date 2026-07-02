import type { SxProps, Theme } from '@mui/material'

/** DA .fnt glyph cell dimensions: 8px wide, 12px tall, 1 byte per row. */
export const GLYPH_WIDTH = 8
export const GLYPH_HEIGHT = 12

/**
 * Decode a 1bpp glyph (1 byte per row, MSB = leftmost pixel) into a boolean
 * grid [row][col]. Rows past the glyph length read as all-false.
 */
export function decodeGlyphBits(glyph: Uint8Array): boolean[][] {
  const out: boolean[][] = []
  for (let y = 0; y < GLYPH_HEIGHT; y++) {
    const byte = glyph[y]
    const row: boolean[] = []
    for (let x = 0; x < GLYPH_WIDTH; x++) row.push(((byte >> (7 - x)) & 1) === 1)
    out.push(row)
  }
  return out
}

/** Shared auto-fill grid layout for the glyph grid + block views. */
export const GLYPH_GRID_SX: SxProps<Theme> = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))',
  gap: 0.5,
  p: 1
}
