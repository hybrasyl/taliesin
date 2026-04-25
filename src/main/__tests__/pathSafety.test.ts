import { describe, it, expect } from 'vitest'
import { join, normalize } from 'path'
import { assertInside } from '../pathSafety'

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
