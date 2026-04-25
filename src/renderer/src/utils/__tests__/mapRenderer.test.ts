import { describe, it, expect } from 'vitest'
import { lruTouch, lruGet, _assetCacheSize, clearAllCaches } from '../mapRenderer'

describe('lruTouch', () => {
  it('inserts a new key', () => {
    const m = new Map<string, number>()
    lruTouch(m, 'a', 1, 3)
    expect([...m.entries()]).toEqual([['a', 1]])
  })

  it('refreshes an existing key to MRU position', () => {
    const m = new Map<string, number>([
      ['a', 1],
      ['b', 2],
      ['c', 3]
    ])
    lruTouch(m, 'a', 1, 3)
    expect([...m.keys()]).toEqual(['b', 'c', 'a'])
  })

  it('evicts the oldest entry when over the limit', () => {
    const m = new Map<string, number>()
    lruTouch(m, 'a', 1, 2)
    lruTouch(m, 'b', 2, 2)
    lruTouch(m, 'c', 3, 2) // should evict 'a'
    expect([...m.keys()]).toEqual(['b', 'c'])
    expect(m.size).toBe(2)
  })

  it('honors limit=1 (only keeps the most recent)', () => {
    const m = new Map<string, number>()
    lruTouch(m, 'a', 1, 1)
    lruTouch(m, 'b', 2, 1)
    expect([...m.keys()]).toEqual(['b'])
  })

  it('overwriting a key with a new value updates the value AND bumps to MRU', () => {
    const m = new Map<string, number>([
      ['a', 1],
      ['b', 2]
    ])
    lruTouch(m, 'a', 99, 3)
    expect(m.get('a')).toBe(99)
    expect([...m.keys()]).toEqual(['b', 'a'])
  })

  it('repeated insertion past limit caps the cache size', () => {
    const m = new Map<string, number>()
    for (let i = 0; i < 50; i++) lruTouch(m, `k${i}`, i, 2)
    expect(m.size).toBe(2)
    expect([...m.keys()]).toEqual(['k48', 'k49'])
  })
})

describe('lruGet', () => {
  it('returns the value for an existing key', () => {
    const m = new Map<string, number>([
      ['a', 1],
      ['b', 2]
    ])
    expect(lruGet(m, 'a')).toBe(1)
  })

  it('returns undefined for a missing key', () => {
    const m = new Map<string, number>()
    expect(lruGet(m, 'missing')).toBeUndefined()
  })

  it('bumps the read key to MRU', () => {
    const m = new Map<string, number>([
      ['a', 1],
      ['b', 2],
      ['c', 3]
    ])
    lruGet(m, 'a')
    expect([...m.keys()]).toEqual(['b', 'c', 'a'])
  })

  it('does not insert when the key is missing (no side effects)', () => {
    const m = new Map<string, number>([['a', 1]])
    lruGet(m, 'b')
    expect(m.size).toBe(1)
    expect(m.has('b')).toBe(false)
  })
})

describe('clearAllCaches / _assetCacheSize', () => {
  it('clearAllCaches resets the asset cache to size 0', () => {
    clearAllCaches()
    expect(_assetCacheSize()).toBe(0)
  })
})
