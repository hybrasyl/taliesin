import { describe, it, expect } from 'vitest'
import { MARKER, MARKER_COLOR, type MarkerKind } from '../MapRenderCanvas'

// HTOO-338. Map warps and world warps used to collapse into one `warp` entry,
// so every warp drew blue with a `W` whatever its target — while the legend
// advertised two near-identical blues that the canvas never drew.

const KINDS: MarkerKind[] = ['warp', 'worldwarp', 'npc', 'sign', 'reactor']

describe('marker styles', () => {
  it('gives a map warp and a world warp different colours', () => {
    expect(MARKER.warp.stroke).not.toBe(MARKER.worldwarp.stroke)
  })

  it('gives a map warp and a world warp different letters', () => {
    expect(MARKER.warp.label).toBe('M')
    expect(MARKER.worldwarp.label).toBe('W')
  })

  it('gives every kind its own letter', () => {
    const labels = KINDS.map((k) => MARKER[k].label)
    expect(new Set(labels).size).toBe(KINDS.length)
  })

  it('gives every kind its own colour', () => {
    const colors = KINDS.map((k) => MARKER[k].stroke)
    expect(new Set(colors).size).toBe(KINDS.length)
  })

  // The world warp is a category, not a fault: `error.main` on the Hybrasyl
  // theme is pure `#ff0000`, which reads as something being wrong.
  it('does not use pure red for the world warp', () => {
    expect(MARKER.worldwarp.stroke.toLowerCase()).not.toBe('#ff0000')
  })

  // The legend reads MARKER_COLOR rather than repeating hex, which is how the
  // two got to disagree in the first place.
  it('exposes the drawn colour for the legend, for every kind', () => {
    for (const kind of KINDS) {
      expect(MARKER_COLOR[kind]).toBe(MARKER[kind].stroke)
    }
  })
})
