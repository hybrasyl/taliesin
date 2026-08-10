import { describe, it, expect } from 'vitest'
import { computeMapFilename, sanitizeForFilename, xmlPrefix } from '../mapData'

// HTOO-344. A map's `<Name>` is the display name the client shows — "The Crow
// & Cask" — and there was nowhere to record what the map *is*, which is what a
// filename wants: "Tagor Tavern".

describe('sanitizeForFilename', () => {
  it('replaces the characters a filesystem rejects', () => {
    expect(sanitizeForFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j')
  })

  // Legal in a filename, and the map that motivated the field has one in its
  // display name — which is the clearest reason the two fields are separate.
  it('leaves an ampersand alone', () => {
    expect(sanitizeForFilename('The Crow & Cask')).toBe('The Crow & Cask')
  })

  it('collapses whitespace and trims', () => {
    expect(sanitizeForFilename('  Tagor   Tavern  ')).toBe('Tagor Tavern')
  })
})

describe('computeMapFilename', () => {
  it('appends the generic name when there is one', () => {
    expect(computeMapFilename(30909, 'Tagor Tavern')).toBe('hyb30909 - Tagor Tavern.xml')
  })

  // 1011 of the 1045 maps in the world repo use no naming convention at all.
  // Unchanged output for them is what keeps the regenerate button from
  // offering to rename the entire corpus.
  it('is exactly what it always was without one', () => {
    expect(computeMapFilename(30909)).toBe('hyb30909.xml')
    expect(computeMapFilename(30909, '')).toBe('hyb30909.xml')
    expect(computeMapFilename(30909, '   ')).toBe('hyb30909.xml')
  })

  it('sanitises the generic name into the filename', () => {
    expect(computeMapFilename(1, 'Piet: The Inn')).toBe('lod00001 - Piet- The Inn.xml')
  })

  it('keeps the lod/hyb rule and the padding', () => {
    expect(computeMapFilename(1, 'Hut')).toBe('lod00001 - Hut.xml')
    expect(computeMapFilename(29999)).toBe('lod29999.xml')
    expect(computeMapFilename(30000)).toBe('hyb30000.xml')
    expect(xmlPrefix(30000)).toBe('hyb')
  })
})
