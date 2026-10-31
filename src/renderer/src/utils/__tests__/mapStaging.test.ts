import { describe, it, expect } from 'vitest'
import { nameCollisionKey } from '@eriscorp/hybindex-ts'
import { describeClash, mapNameKey, planRelease, releaseClashes } from '../mapStaging'

const staged = (rel: string, name: string, id: number, targets: string[] = []): StagedMap => ({
  rel,
  name,
  id,
  targets
})

describe('mapNameKey', () => {
  it('is the same key as hybindex nameCollisionKey', () => {
    // The renderer cannot import hybindex, so the key is a copy. A change in
    // the package fails here, not in a release that lets a clash through.
    for (const name of ['Abel', 'ABEL Docks', 'Mileth Inn', 'Café', 'Café', 'İstanbul', '']) {
      expect(mapNameKey(name), name).toBe(nameCollisionKey(name))
    }
  })
})

describe('planRelease', () => {
  it('releases only the chosen map when its warps go to live maps', () => {
    const list = [staged('a.xml', 'A', 1, ['Live']), staged('b.xml', 'B', 2)]
    expect(planRelease('a.xml', list, ['Live'])).toEqual([
      { rel: 'a.xml', name: 'A', id: 1, dependency: false }
    ])
  })

  it('brings along the staged maps that the warps name, in turn', () => {
    // a → b → c, and c warps back to a: each map is in the release once.
    const list = [
      staged('a.xml', 'A', 1, ['B', 'Live']),
      staged('sub/b.xml', 'B', 2, ['c']),
      staged('c.xml', 'C', 3, ['A']),
      staged('d.xml', 'D', 4)
    ]
    expect(planRelease('a.xml', list, ['Live'])).toEqual([
      { rel: 'a.xml', name: 'A', id: 1, dependency: false },
      { rel: 'sub/b.xml', name: 'B', id: 2, dependency: true, neededBy: 'A' },
      { rel: 'c.xml', name: 'C', id: 3, dependency: true, neededBy: 'B' }
    ])
  })

  it('does not bring a staged map whose name is also live', () => {
    const list = [staged('a.xml', 'A', 1, ['Twin']), staged('t.xml', 'Twin', 2)]
    expect(planRelease('a.xml', list, ['twin']).map((r) => r.rel)).toEqual(['a.xml'])
  })

  it('ignores a warp to a map that is neither live nor staged', () => {
    const list = [staged('a.xml', 'A', 1, ['Nowhere'])]
    expect(planRelease('a.xml', list, [])).toHaveLength(1)
  })

  it('takes the first staged map by path when two have the name', () => {
    const list = [staged('a.xml', 'A', 1, ['B']), staged('z.xml', 'B', 3), staged('m.xml', 'B', 2)]
    expect(planRelease('a.xml', list, []).map((r) => r.rel)).toEqual(['a.xml', 'm.xml'])
  })

  it('returns nothing for a file that is not staged', () => {
    expect(planRelease('gone.xml', [staged('a.xml', 'A', 1)], [])).toEqual([])
  })

  it('keeps a staged map with no name or Id, and has neededBy fall back to the file', () => {
    const list: StagedMap[] = [{ rel: 'x.xml', targets: ['B'] }, staged('b.xml', 'B', 2)]
    expect(planRelease('x.xml', list, [])).toEqual([
      { rel: 'x.xml', name: '', id: undefined, dependency: false },
      { rel: 'b.xml', name: 'B', id: 2, dependency: true, neededBy: 'x.xml' }
    ])
  })
})

describe('releaseClashes', () => {
  const entry = (rel: string, name: string, id?: number) => ({
    rel,
    name,
    id,
    dependency: false
  })

  it('passes a release with no live or repeated name or Id', () => {
    expect(releaseClashes([entry('a.xml', 'A', 1)], [{ name: 'B', id: 2 }])).toEqual([])
  })

  it('refuses a name that is live, by the collision key', () => {
    const r = releaseClashes([entry('a.xml', 'abel', 9)], [{ name: 'Abel', id: 1 }])
    expect(r.map((c) => c.reason)).toEqual(['live-name'])
  })

  it('refuses an Id that is live', () => {
    const r = releaseClashes([entry('a.xml', 'New', 1)], [{ name: 'Abel', id: 1 }])
    expect(r.map((c) => c.reason)).toEqual(['live-id'])
  })

  it('refuses a name or an Id that is in the release twice', () => {
    expect(
      releaseClashes([entry('a.xml', 'Same', 1), entry('b.xml', 'SAME', 2)], []).map(
        (c) => c.reason
      )
    ).toEqual(['batch-name', 'batch-name'])
    expect(
      releaseClashes([entry('a.xml', 'A', 7), entry('b.xml', 'B', 7)], []).map((c) => c.reason)
    ).toEqual(['batch-id', 'batch-id'])
  })

  it('does not check a field the map does not have', () => {
    expect(releaseClashes([entry('a.xml', ''), entry('b.xml', '')], [{ name: '', id: 0 }])).toEqual(
      []
    )
  })

  it('describes each reason', () => {
    const base = { rel: 'a.xml', name: 'A', id: 3, dependency: false }
    expect(describeClash({ ...base, reason: 'live-name' })).toContain('already named “A”')
    expect(describeClash({ ...base, reason: 'live-id' })).toContain('already has Id 3')
    expect(describeClash({ ...base, reason: 'batch-name' })).toContain('“A” is in this release')
    expect(describeClash({ ...base, reason: 'batch-id' })).toContain('Id 3 is in this release')
  })
})
