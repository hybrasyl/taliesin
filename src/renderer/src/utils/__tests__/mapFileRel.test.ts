import { describe, it, expect } from 'vitest'
import { activeRel, displayName } from '../mapFileRel'

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

  it('composes an archive destination that never doubles the prefix', () => {
    // What the callers actually do with it. Keying an archive path off the raw
    // rel doubles the prefix for an already-archived map — `.ignore/.ignore/` —
    // and copyFile would mkdir -p that into existence.
    const archiveDest = (rel: string) => `maps/.ignore/${activeRel(rel)}`
    expect(archiveDest('townmaps/Piet.xml')).toBe('maps/.ignore/townmaps/Piet.xml')
    expect(archiveDest('.ignore/old.xml')).toBe('maps/.ignore/old.xml')
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
