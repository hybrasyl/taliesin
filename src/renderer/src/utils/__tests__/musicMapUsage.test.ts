import { describe, expect, it } from 'vitest'
import { mapsByMusicId } from '../musicMapUsage'

describe('mapsByMusicId (HTOO-358)', () => {
  it('groups active map names by music id, sorted with numeric collation', () => {
    const result = mapsByMusicId([
      { name: 'Mileth Inn', music: 3 },
      { name: 'Mileth', music: 3 },
      { name: 'Abel', music: 7 },
      { name: 'Field10', music: 3 },
      { name: 'Field2', music: 3 }
    ])
    expect(result?.get(3)).toEqual(['Field2', 'Field10', 'Mileth', 'Mileth Inn'])
    expect(result?.get(7)).toEqual(['Abel'])
  })

  it('keeps 0 as a music id', () => {
    const result = mapsByMusicId([
      { name: 'Quiet', music: 0 },
      { name: 'Loud', music: 1 }
    ])
    expect(result?.get(0)).toEqual(['Quiet'])
  })

  it('leaves out a map without a music field, and does not file it under 0', () => {
    const result = mapsByMusicId([{ name: 'Unset' }, { name: 'Set', music: 2 }])
    expect(result?.get(0)).toBeUndefined()
    expect([...(result?.values() ?? [])].flat()).toEqual(['Set'])
  })

  it('is null when no map carries the field, so the caller shows no column', () => {
    expect(mapsByMusicId([{ name: 'A' }, { name: 'B' }])).toBeNull()
    expect(mapsByMusicId([])).toBeNull()
    expect(mapsByMusicId(null)).toBeNull()
    expect(mapsByMusicId(undefined)).toBeNull()
  })
})
