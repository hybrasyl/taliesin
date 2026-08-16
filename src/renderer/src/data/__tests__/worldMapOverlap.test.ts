import { describe, it, expect } from 'vitest'
import { overlappingPointPairs, CLIENT_NODE_BOX, type WorldMapPoint } from '../worldMapData'

function pt(x: number, y: number, name = ''): WorldMapPoint {
  return { x, y, name, targetMap: 'm', targetX: 0, targetY: 0 }
}

describe('overlappingPointPairs', () => {
  it('reports nothing for points that are far apart', () => {
    expect(overlappingPointPairs([pt(10, 10), pt(300, 300)])).toEqual([])
  })

  it('reports a pair whose client boxes touch', () => {
    // 11 apart on both axes — inside the 12px box.
    expect(overlappingPointPairs([pt(100, 100), pt(111, 111)])).toEqual([[0, 1]])
  })

  it('treats exactly one box width as clear', () => {
    // The boxes abut but do not cover each other, so the click is unambiguous.
    expect(overlappingPointPairs([pt(100, 100), pt(100 + CLIENT_NODE_BOX, 100)])).toEqual([])
  })

  it('needs both axes to overlap', () => {
    expect(overlappingPointPairs([pt(100, 100), pt(105, 200)])).toEqual([])
    expect(overlappingPointPairs([pt(100, 100), pt(200, 105)])).toEqual([])
  })

  it('reports the pair in list order, because that is the order the client uses', () => {
    // The later point draws on top; the earlier one takes the click.
    expect(overlappingPointPairs([pt(50, 50, 'under'), pt(52, 52, 'over')])).toEqual([[0, 1]])
  })

  it('reports every pair in a stack of three', () => {
    expect(overlappingPointPairs([pt(10, 10), pt(12, 12), pt(14, 14)])).toEqual([
      [0, 1],
      [0, 2],
      [1, 2]
    ])
  })

  it('handles an empty list and a single point', () => {
    expect(overlappingPointPairs([])).toEqual([])
    expect(overlappingPointPairs([pt(1, 1)])).toEqual([])
  })
})
