import { describe, it, expect } from 'vitest'
import { activeRel, displayName, toPosix } from '../mapFileRel'

describe('activeRel', () => {
  it.each([
    ['.ignore/old.xml', 'old.xml'],
    ['.ignore/Deprecated/older.xml', 'Deprecated/older.xml'],
    ['Abel.xml', 'Abel.xml'],
    ['fire/blast.xml', 'fire/blast.xml']
  ])('%s → %s', (rel, expected) => {
    expect(activeRel(rel)).toBe(expected)
  })

  it('only strips a leading .ignore/ segment, not one nested or partial', () => {
    // `.ignore` is a path segment, never a substring: a map merely named
    // "ignore-me" is active, and a nested archive dir is not the prefix.
    expect(activeRel('ignore-me.xml')).toBe('ignore-me.xml')
    expect(activeRel('sub/.ignore/x.xml')).toBe('sub/.ignore/x.xml')
  })
})

describe('displayName', () => {
  it.each([
    ['Abel.xml', 'Abel'],
    ['.ignore/old.xml', 'old'],
    ['.ignore/Deprecated/older.xml', 'Deprecated/older'],
    ['fire/blast.xml', 'fire/blast'],
    ['Abel.XML', 'Abel']
  ])('%s → %s', (rel, expected) => {
    expect(displayName(rel)).toBe(expected)
  })

  it('keeps the subfolder so same-named maps stay distinguishable', () => {
    expect(displayName('fire/blast.xml')).not.toBe(displayName('ice/blast.xml'))
  })
})

describe('toPosix', () => {
  it.each([
    ['E:\\hyb\\world\\xml', 'E:/hyb/world/xml'],
    ['E:\\hyb\\world\\xml\\', 'E:/hyb/world/xml'],
    ['/already/posix', '/already/posix'],
    ['/trailing/', '/trailing']
  ])('%s → %s', (input, expected) => {
    expect(toPosix(input)).toBe(expected)
  })

  it('makes a native library path compose to the same string as a listSection dir', () => {
    // The bug this guards: `${activeLibrary}/maps` was mixed-separator, so it
    // never equalled the forward-slashed dir rows carry, and selection broke.
    expect(`${toPosix('E:\\hyb\\world\\xml')}/maps`).toBe('E:/hyb/world/xml/maps')
  })
})
