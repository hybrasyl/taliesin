import { describe, it, expect } from 'vitest'
import { plainFileNameProblem } from '../fileName'

describe('plainFileNameProblem', () => {
  describe('accepts names that stay one segment', () => {
    // Real pack ids from the format doc and the pilot pack, real archive entry
    // names, and names an imported pack may carry (HTOO-598 warns, it does not refuse).
    it.each([
      'hybabilityicons',
      'items_20001-21000',
      'icy-steel-theme',
      'mefc001.epf',
      'legend.pal',
      'Mixed Case',
      'pack.v2',
      '.hidden',
      'console',
      'com10'
    ])('%s', (name) => {
      expect(plainFileNameProblem(name)).toBeNull()
    })
  })

  describe('refuses names that address another place or alias another file', () => {
    it.each([
      [''],
      ['.'],
      ['..'],
      ['...'],
      ['../note.txt'],
      ['..\\note.txt'],
      ['sub/file.epf'],
      ['sub\\file.epf'],
      ['/abs'],
      ['C:\\abs'],
      ['C:'],
      ['file.txt:stream'],
      ['a\u0000b'],
      ['tab\there'],
      ['what?'],
      ['star*'],
      ['pipe|'],
      ['<x>'],
      ['"q"'],
      ['trailing.'],
      ['trailing '],
      ['CON'],
      ['nul'],
      ['nul.txt'],
      ['Com1'],
      ['LPT9.dat'],
      ['x'.repeat(256)]
    ])('%j', (name) => {
      expect(plainFileNameProblem(name)).not.toBeNull()
    })
  })

  it('takes a shorter limit when the caller adds a suffix', () => {
    expect(plainFileNameProblem('x'.repeat(201), 200)).toMatch(/longer than 200/)
    expect(plainFileNameProblem('x'.repeat(200), 200)).toBeNull()
  })
})
