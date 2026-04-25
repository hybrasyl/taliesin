import { describe, it, expect } from 'vitest'
import { join, normalize } from 'path'
import { assertInside, assertInsideAnyRoot, isInsideAnyRoot } from '../pathSafety'

const norm = (p: string) => normalize(p)
const childOf = (parent: string, child: string) => normalize(join(normalize(parent), child))

describe('assertInside', () => {
  it('accepts a flat filename', () => {
    expect(assertInside('/parent', 'foo.json')).toBe(childOf('/parent', 'foo.json'))
  })

  it('accepts a nested relative path', () => {
    expect(assertInside('/parent', 'sub/foo.json')).toBe(childOf('/parent', 'sub/foo.json'))
  })

  it('accepts the parent itself', () => {
    expect(assertInside('/parent', '.')).toBe(norm('/parent'))
  })

  it('rejects a parent escape via ..', () => {
    expect(() => assertInside('/parent', '../foo.json')).toThrow(/Path traversal/)
  })

  it('rejects a deep parent escape', () => {
    expect(() => assertInside('/parent', '../../etc/passwd')).toThrow(/Path traversal/)
  })

  it('rejects an absolute path that lies outside the parent', () => {
    expect(() => assertInside('/parent', '/etc/passwd')).toThrow(/Path traversal/)
  })

  it('accepts an absolute path that is identical to the parent', () => {
    expect(assertInside('/parent', norm('/parent'))).toBe(norm('/parent'))
  })

  it('accepts an absolute path that lies inside the parent', () => {
    const inside = childOf('/parent', 'sub/foo.json')
    expect(assertInside('/parent', inside)).toBe(inside)
  })

  it('rejects a near-miss prefix (sibling with shared prefix)', () => {
    // /parent vs /parent-evil — the trailing-separator check catches this.
    expect(() => assertInside('/parent', norm('/parent-evil/x'))).toThrow(/Path traversal/)
  })

  it('handles a parent with a trailing separator', () => {
    expect(assertInside('/parent/', 'foo.json')).toBe(childOf('/parent', 'foo.json'))
  })

  it('rejects a normalized-out traversal that ultimately escapes', () => {
    // /parent + sub/../../escape  →  /escape
    expect(() => assertInside('/parent', 'sub/../../escape')).toThrow(/Path traversal/)
  })

  it('accepts a normalized-out path that stays inside', () => {
    // /parent + sub/../foo.json  →  /parent/foo.json
    expect(assertInside('/parent', 'sub/../foo.json')).toBe(childOf('/parent', 'foo.json'))
  })
})

describe('assertInsideAnyRoot', () => {
  it('accepts a path inside the only configured root', () => {
    const roots = new Set([norm('/lib')])
    expect(assertInsideAnyRoot(roots, childOf('/lib', 'maps/x.map'))).toBe(
      childOf('/lib', 'maps/x.map')
    )
  })

  it('accepts a path inside any of several configured roots', () => {
    const roots = new Set([norm('/lib'), norm('/packs'), norm('/music')])
    expect(assertInsideAnyRoot(roots, childOf('/packs', 'icons.datf'))).toBe(
      childOf('/packs', 'icons.datf')
    )
    expect(assertInsideAnyRoot(roots, childOf('/music', 'theme.mp3'))).toBe(
      childOf('/music', 'theme.mp3')
    )
  })

  it('rejects a path that escapes every configured root', () => {
    const roots = new Set([norm('/lib'), norm('/packs')])
    expect(() => assertInsideAnyRoot(roots, norm('/etc/passwd'))).toThrow(/not inside any allowed/)
  })

  it('rejects a near-miss prefix against every root', () => {
    const roots = new Set([norm('/lib')])
    expect(() => assertInsideAnyRoot(roots, norm('/lib-evil/x'))).toThrow(/not inside any allowed/)
  })

  it('rejects when no roots are configured', () => {
    expect(() => assertInsideAnyRoot(new Set<string>(), norm('/anywhere'))).toThrow(
      /no allowed roots/
    )
  })

  it('returns the normalized absolute path on success', () => {
    const roots = new Set([norm('/lib')])
    expect(assertInsideAnyRoot(roots, '/lib/sub/../foo')).toBe(childOf('/lib', 'foo'))
  })
})

describe('isInsideAnyRoot', () => {
  it('returns true for a path inside one of the roots', () => {
    const roots = new Set([norm('/lib'), norm('/packs')])
    expect(isInsideAnyRoot(roots, childOf('/packs', 'a.json'))).toBe(true)
  })

  it('returns false for a path outside every root', () => {
    const roots = new Set([norm('/lib')])
    expect(isInsideAnyRoot(roots, norm('/etc/passwd'))).toBe(false)
  })

  it('returns false when no roots are configured', () => {
    expect(isInsideAnyRoot(new Set<string>(), norm('/anywhere'))).toBe(false)
  })
})
