import { describe, it, expect } from 'vitest'
import { MapFile } from '@eriscorp/dalib-ts'
import {
  isHorizontal,
  joinLayout,
  joinMaps,
  offsetPresets,
  offsetRange,
  type JoinSide
} from '../mapJoin'

const SIDES: JoinSide[] = ['left', 'right', 'top', 'bottom']

/**
 * A map whose every tile background encodes its own coordinates, so a joined
 * map can be checked tile by tile: which source it came from and from where.
 */
function marked(width: number, height: number, tag: number): MapFile {
  const map = new MapFile(width, height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      map.setTile(x, y, {
        background: tag * 1000 + y * 10 + x,
        leftForeground: tag,
        rightForeground: 0
      })
    }
  }
  return map
}

const BASE_TAG = 1
const OTHER_TAG = 2

describe('offsetRange', () => {
  it('keeps at least one tile of the seam touching', () => {
    // 10-tall base, 4-tall other, joined side by side: the other may hang 3
    // tiles above (its last row level with the base's first) or start on the
    // base's last row.
    expect(offsetRange('right', { width: 5, height: 10 }, { width: 5, height: 4 })).toEqual({
      min: -3,
      max: 9
    })
  })

  it('measures the seam along the shared edge, not the joined one', () => {
    const base = { width: 8, height: 10 }
    const other = { width: 4, height: 6 }
    // Left/right share the height; top/bottom share the width.
    expect(offsetRange('right', base, other)).toEqual({ min: -5, max: 9 })
    expect(offsetRange('bottom', base, other)).toEqual({ min: -3, max: 7 })
  })
})

describe('offsetPresets', () => {
  it('centers a shorter map inside a longer edge', () => {
    expect(offsetPresets('right', { width: 5, height: 10 }, { width: 5, height: 4 })).toEqual({
      start: 0,
      center: 3,
      end: 6
    })
  })

  it('centers a longer map by overhanging both ends equally', () => {
    // 10-tall attached to a 4-tall base: 3 tiles of overhang on each side.
    expect(offsetPresets('right', { width: 5, height: 4 }, { width: 5, height: 10 })).toEqual({
      start: 0,
      center: -3,
      end: -6
    })
  })

  it('never proposes an offset outside the legal range', () => {
    const base = { width: 3, height: 3 }
    const other = { width: 3, height: 40 }
    const { min, max } = offsetRange('right', base, other)
    for (const v of Object.values(offsetPresets('right', base, other))) {
      expect(v).toBeGreaterThanOrEqual(min)
      expect(v).toBeLessThanOrEqual(max)
    }
  })
})

describe('joinLayout', () => {
  it('grows along the joined axis and unions along the seam', () => {
    const layout = joinLayout('right', { width: 8, height: 10 }, { width: 4, height: 6 }, 0)
    expect(layout).toEqual({ width: 12, height: 10, baseX: 0, baseY: 0, otherX: 8, otherY: 0 })
  })

  it('puts the incoming map first when joining to the left', () => {
    const layout = joinLayout('left', { width: 8, height: 10 }, { width: 4, height: 10 }, 0)
    expect(layout).toMatchObject({ width: 12, baseX: 4, otherX: 0 })
  })

  it('puts the incoming map first when joining to the top', () => {
    const layout = joinLayout('top', { width: 8, height: 10 }, { width: 8, height: 6 }, 0)
    expect(layout).toMatchObject({ height: 16, baseY: 6, otherY: 0 })
  })

  it('shifts the base when a negative offset would put tiles off-grid', () => {
    // The other map starts 3 rows above the base, so the base moves down 3 and
    // the composite is tall enough for both.
    const layout = joinLayout('right', { width: 5, height: 10 }, { width: 5, height: 4 }, -3)
    expect(layout).toEqual({ width: 10, height: 13, baseX: 0, baseY: 3, otherX: 5, otherY: 0 })
  })

  it('never yields a negative origin for either source', () => {
    const base = { width: 6, height: 6 }
    const other = { width: 4, height: 9 }
    for (const side of SIDES) {
      const { min, max } = offsetRange(side, base, other)
      for (const offset of [min, 0, max]) {
        const l = joinLayout(side, base, other, offset)
        expect(Math.min(l.baseX, l.baseY, l.otherX, l.otherY)).toBeGreaterThanOrEqual(0)
        expect(l.baseX + base.width).toBeLessThanOrEqual(l.width)
        expect(l.baseY + base.height).toBeLessThanOrEqual(l.height)
        expect(l.otherX + other.width).toBeLessThanOrEqual(l.width)
        expect(l.otherY + other.height).toBeLessThanOrEqual(l.height)
      }
    }
  })
})

describe('joinMaps', () => {
  it('places every tile of both sources exactly once', () => {
    const base = marked(3, 2, BASE_TAG)
    const other = marked(2, 2, OTHER_TAG)
    const layout = joinLayout('right', base, other, 0)
    const joined = joinMaps(base, other, layout)

    expect([joined.width, joined.height]).toEqual([5, 2])
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 3; x++) {
        expect(joined.getTile(x, y).background).toBe(base.getTile(x, y).background)
      }
      for (let x = 0; x < 2; x++) {
        expect(joined.getTile(3 + x, y).background).toBe(other.getTile(x, y).background)
      }
    }
  })

  it('round-trips both sources for every side', () => {
    const base = marked(4, 3, BASE_TAG)
    const other = marked(3, 5, OTHER_TAG)
    for (const side of SIDES) {
      const layout = joinLayout(side, base, other, 1)
      const joined = joinMaps(base, other, layout)
      const at = (m: MapFile, ox: number, oy: number, x: number, y: number): number =>
        joined.getTile(ox + x, oy + y).background - m.getTile(x, y).background
      expect(at(base, layout.baseX, layout.baseY, 0, 0)).toBe(0)
      expect(at(base, layout.baseX, layout.baseY, 3, 2)).toBe(0)
      expect(at(other, layout.otherX, layout.otherY, 0, 0)).toBe(0)
      expect(at(other, layout.otherX, layout.otherY, 2, 4)).toBe(0)
    }
  })

  it('leaves uncovered tiles empty rather than defaulting to tile 1', () => {
    // Tile ids are 1-based, so the gap a short map leaves beside a tall one
    // must read as 0 = nothing, not as a real tile.
    const base = marked(2, 4, BASE_TAG)
    const other = marked(2, 2, OTHER_TAG)
    const layout = joinLayout('right', base, other, 0)
    const joined = joinMaps(base, other, layout)

    expect(joined.getTile(2, 0).background).not.toBe(0) // other's own rows
    for (let y = 2; y < 4; y++) {
      const tile = joined.getTile(2, y)
      expect(tile.background).toBe(0)
      expect(tile.leftForeground).toBe(0)
      expect(tile.rightForeground).toBe(0)
    }
  })

  it('does not alias tiles with its sources', () => {
    const base = marked(2, 2, BASE_TAG)
    const other = marked(2, 2, OTHER_TAG)
    const joined = joinMaps(base, other, joinLayout('right', base, other, 0))

    joined.getTile(0, 0).background = 999
    expect(base.getTile(0, 0).background).not.toBe(999)
  })

  it('preserves total tile count across a join with no overhang', () => {
    const base = marked(6, 4, BASE_TAG)
    const other = marked(6, 7, OTHER_TAG)
    const joined = joinMaps(base, other, joinLayout('bottom', base, other, 0))
    expect(joined.width * joined.height).toBe(6 * 4 + 6 * 7)
  })
})

describe('isHorizontal', () => {
  it('is true exactly for the side-by-side joins', () => {
    expect(SIDES.filter(isHorizontal)).toEqual(['left', 'right'])
  })
})
