import { describe, it, expect } from 'vitest'
import { pickerGeometry, PICKER_ZOOMS, type PickerZoom } from '../TilePicker'

// HTOO-334. The picker clamped every thumbnail into a 28-pixel box, so a ground
// tile — really 56×27 — drew at 28×14, half size, with no way to make the grid
// bigger. These pin the geometry the zoom control drives.

/** The gutter the picker lives in (MapMakerPage), minus its own padding. */
const PANEL_WIDTH = 280
const AVAILABLE = PANEL_WIDTH - 12

describe('pickerGeometry', () => {
  it('draws a ground tile at its true 56×27 at 1×', () => {
    const g = pickerGeometry(true, 1)
    expect(g.thumbW).toBe(56)
    expect(g.thumbH).toBe(27)
  })

  it('scales the box with the zoom', () => {
    expect(pickerGeometry(true, 2).thumbW).toBe(112)
    expect(pickerGeometry(true, 4).thumbW).toBe(224)
    expect(pickerGeometry(false, 4).thumbW).toBe(112)
  })

  it('keeps the row taller than its thumbnail, for the id label', () => {
    for (const zoom of PICKER_ZOOMS) {
      for (const isBg of [true, false]) {
        const g = pickerGeometry(isBg, zoom)
        expect(g.rowH).toBeGreaterThan(g.thumbH)
      }
    }
  })

  // The column table is the reason a 4× ground cell does not overflow its row.
  // If the gutter width changes, this is what should fail.
  it('never asks for more columns than the panel can hold', () => {
    for (const zoom of PICKER_ZOOMS) {
      for (const isBg of [true, false]) {
        const g = pickerGeometry(isBg, zoom)
        expect(g.cols * g.thumbW).toBeLessThanOrEqual(AVAILABLE)
        expect(g.cols).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('gives up columns as the tiles grow, never gains them', () => {
    for (const isBg of [true, false]) {
      const counts = PICKER_ZOOMS.map((z: PickerZoom) => pickerGeometry(isBg, z).cols)
      expect(counts).toEqual([...counts].sort((a, b) => b - a))
    }
  })

  // Foreground stc art is 28 wide against ground's 56, so it keeps a column
  // longer at the same zoom.
  it('fits at least as many foreground columns as ground columns', () => {
    for (const zoom of PICKER_ZOOMS) {
      expect(pickerGeometry(false, zoom).cols).toBeGreaterThanOrEqual(
        pickerGeometry(true, zoom).cols
      )
    }
  })
})
