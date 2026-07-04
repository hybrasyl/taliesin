import { describe, it, expect } from 'vitest'
import { buildWangSidecar, wangSidecarFilename, WANG_SIDECAR_VERSION } from '../wangSidecar'
import { getWangScheme } from '../wangSlicer'

describe('buildWangSidecar', () => {
  const scheme = getWangScheme('edge16')

  it('produces a versioned sidecar with the scheme id and bit legend', () => {
    const s = buildWangSidecar(scheme, [{ mask: 0, tileId: 10 }])
    expect(s.version).toBe(WANG_SIDECAR_VERSION)
    expect(s.scheme).toBe('edge16')
    expect(s.bits).toEqual(scheme.bits)
  })

  it('sorts entries ascending by mask and labels them', () => {
    const s = buildWangSidecar(scheme, [
      { mask: 5, tileId: 3 },
      { mask: 1, tileId: 1 },
      { mask: 15, tileId: 9 }
    ])
    expect(s.tiles.map((t) => t.mask)).toEqual([1, 5, 15])
    expect(s.tiles[0].label).toBe('N')
    expect(s.tiles[2].label).toBe('N|E|S|W')
  })

  it('keeps the last assignment when a mask is repeated', () => {
    const s = buildWangSidecar(scheme, [
      { mask: 2, tileId: 100 },
      { mask: 2, tileId: 200 }
    ])
    expect(s.tiles).toHaveLength(1)
    expect(s.tiles[0].tileId).toBe(200)
  })

  it('includes a trimmed terrain name when given, omits it when blank', () => {
    expect(buildWangSidecar(scheme, [], '  grass ').terrain).toBe('grass')
    expect(buildWangSidecar(scheme, [], '   ').terrain).toBeUndefined()
    expect(buildWangSidecar(scheme, []).terrain).toBeUndefined()
  })
})

describe('wangSidecarFilename', () => {
  it('uses the terrain name when present, sanitised and lowercased', () => {
    expect(wangSidecarFilename('corner16', 'Ancient Forest')).toBe('wang_ancient_forest.json')
  })
  it('falls back to the scheme id', () => {
    expect(wangSidecarFilename('blob47')).toBe('wang_blob47.json')
    expect(wangSidecarFilename('edge16', '   ')).toBe('wang_edge16.json')
  })
})
