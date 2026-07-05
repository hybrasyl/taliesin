import { describe, it, expect } from 'vitest'
import { checkTileAnimated, checkTileAnimatedForLayer, AnimationTableLike } from '../tileAnimation'

/** Build a fake animation table where every id in each sequence maps to it. */
function fakeTable(sequences: number[][]): AnimationTableLike {
  const map = new Map<number, { tileSequence: number[] }>()
  for (const seq of sequences) for (const id of seq) map.set(id, { tileSequence: seq })
  return { tryGetEntry: (id) => map.get(id) }
}

describe('checkTileAnimated', () => {
  const table = fakeTable([
    [100, 101, 102],
    [200, 201]
  ])

  it('flags an id that appears in an animation sequence', () => {
    const r = checkTileAnimated(table, 101)
    expect(r.animated).toBe(true)
    expect(r.sequence).toEqual([100, 101, 102])
  })

  it('does not flag an id outside every sequence', () => {
    expect(checkTileAnimated(table, 500)).toEqual({ animated: false, sequence: [] })
  })

  it('treats a missing table as not-animated (unknown)', () => {
    expect(checkTileAnimated(null, 100).animated).toBe(false)
    expect(checkTileAnimated(undefined, 100).animated).toBe(false)
  })
})

describe('checkTileAnimatedForLayer', () => {
  const assets = {
    groundAnimationTable: fakeTable([[50, 51]]),
    stcAnimationTable: fakeTable([[10500, 10501, 10502]])
  }

  it('checks floor ids against the ground table', () => {
    expect(checkTileAnimatedForLayer(assets, 'floor', 51).animated).toBe(true)
    expect(checkTileAnimatedForLayer(assets, 'floor', 10500).animated).toBe(false) // wrong table
  })

  it('checks wall ids against the stc table', () => {
    expect(checkTileAnimatedForLayer(assets, 'wall', 10502).animated).toBe(true)
    expect(checkTileAnimatedForLayer(assets, 'wall', 51).animated).toBe(false)
  })

  it('returns not-animated when no assets are loaded', () => {
    expect(checkTileAnimatedForLayer(null, 'floor', 51).animated).toBe(false)
  })
})
