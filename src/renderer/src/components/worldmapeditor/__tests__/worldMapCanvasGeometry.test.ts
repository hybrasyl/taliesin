import { describe, it, expect } from 'vitest'
import { computeView, nextZoom, findHits, cycleHit, ZOOM_LEVELS } from '../WorldMapCanvas'
import { FIELD_WIDTH, FIELD_HEIGHT } from '../../../utils/worldMapRenderer'
import type { WorldMapPoint } from '../../../data/worldMapData'

function pt(x: number, y: number): WorldMapPoint {
  return { x, y, name: '', targetMap: 'm', targetX: 0, targetY: 0 }
}

describe('computeView', () => {
  it('fits the field and centres it at zoom 1', () => {
    // 800x600 is 4:3, the field's own ratio, so it fits exactly with no gap.
    const v = computeView(800, 600, 1, 0, 0)
    expect(v.scaleFactor).toBeCloseTo(800 / FIELD_WIDTH)
    expect(v.offsetX).toBeCloseTo(0)
    expect(v.offsetY).toBeCloseTo(0)
  })

  it('pillarboxes a pane that is wider than 4:3', () => {
    const v = computeView(1000, 600, 1, 0, 0)
    expect(v.scaleFactor).toBeCloseTo(600 / FIELD_HEIGHT)
    expect(v.offsetX).toBeGreaterThan(0)
    expect(v.offsetY).toBeCloseTo(0)
  })

  it('multiplies the fit scale by the zoom', () => {
    const fit = computeView(800, 600, 1, 0, 0)
    const zoomed = computeView(800, 600, 2, 0, 0)
    expect(zoomed.scaleFactor).toBeCloseTo(fit.scaleFactor * 2)
  })

  it('ignores a pan while the field is smaller than the pane', () => {
    // Nothing is hidden, so panning would only push the map into a corner.
    const v = computeView(1000, 600, 1, 300, 300)
    const still = computeView(1000, 600, 1, 0, 0)
    expect(v.offsetX).toBeCloseTo(still.offsetX)
    expect(v.offsetY).toBeCloseTo(still.offsetY)
  })

  it('clamps a pan so the field cannot be dragged off the pane', () => {
    const zoomed = computeView(800, 600, 2, 0, 0)
    const fieldW = FIELD_WIDTH * zoomed.scaleFactor
    const limit = (fieldW - 800) / 2
    const far = computeView(800, 600, 2, 99999, 0)
    expect(far.offsetX).toBeCloseTo((800 - fieldW) / 2 + limit)
    const farNeg = computeView(800, 600, 2, -99999, 0)
    expect(farNeg.offsetX).toBeCloseTo((800 - fieldW) / 2 - limit)
  })
})

describe('nextZoom', () => {
  it('steps up and down the list', () => {
    expect(nextZoom(1, 1)).toBe(ZOOM_LEVELS[1])
    expect(nextZoom(ZOOM_LEVELS[1]!, -1)).toBe(1)
  })

  it('stops at each end rather than wrapping', () => {
    expect(nextZoom(ZOOM_LEVELS[0]!, -1)).toBe(ZOOM_LEVELS[0])
    const top = ZOOM_LEVELS[ZOOM_LEVELS.length - 1]!
    expect(nextZoom(top, 1)).toBe(top)
  })

  it('moves to a neighbour from a zoom that is not on the list', () => {
    // 2.5 sits between 2 and 3.
    expect(nextZoom(2.5, 1)).toBe(3)
    expect(nextZoom(2.5, -1)).toBe(2)
  })
})

describe('findHits', () => {
  const points = [pt(100, 100), pt(104, 104), pt(400, 400)]

  it('returns nothing when the click is clear of every point', () => {
    expect(findHits(200, 200, points)).toEqual([])
  })

  it('anchors the box at the point, as the client does, not on its centre', () => {
    const one = [pt(100, 100)]
    // The box runs from the point, so the point itself is a hit ...
    expect(findHits(100, 100, one)).toEqual([0])
    expect(findHits(111, 111, one)).toEqual([0])
    // ... and one past the far edge is not.
    expect(findHits(112, 100, one)).toEqual([])
    // Up and left of the point is outside the box. Under the old centred
    // marker this was a hit, and it is what drew every node 6px adrift.
    expect(findHits(99, 99, one)).toEqual([])
    expect(findHits(95, 95, one)).toEqual([])
  })

  it('returns every point under the cursor, nearest to the box centre first', () => {
    // 108,108 is inside both boxes: 2 from the second's centre (110,110) and
    // 2 from the first's (106,106) — the tie falls to list order.
    expect(findHits(108, 108, points)).toEqual([0, 1])
    // 110,110 is the second box's centre and still inside the first.
    expect(findHits(110, 110, points)).toEqual([1, 0])
  })

  it('excludes a point whose box the cursor has left', () => {
    // Inside the second box only.
    expect(findHits(115, 115, points)).toEqual([1])
  })
})

describe('cycleHit', () => {
  it('selects the nearest point when nothing is selected', () => {
    expect(cycleHit([2, 5], null)).toBe(2)
  })

  it('moves to the next point in the stack on a repeat click', () => {
    expect(cycleHit([2, 5], 2)).toBe(5)
  })

  it('wraps around the stack, so every buried point is reachable', () => {
    expect(cycleHit([2, 5], 5)).toBe(2)
  })

  it('starts a different stack at its nearest point', () => {
    expect(cycleHit([7, 9], 2)).toBe(7)
  })

  it('returns null when the click hits nothing', () => {
    expect(cycleHit([], 3)).toBeNull()
  })
})
