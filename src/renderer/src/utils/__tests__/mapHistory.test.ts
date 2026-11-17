import { describe, it, expect } from 'vitest'
import {
  COALESCE_MS,
  HISTORY_LIMIT,
  coalesceKeyFor,
  commitEdit,
  holds,
  initHistory,
  redo,
  sealHistory,
  undo
} from '../mapHistory'

interface Doc {
  name: string
  n: number
}

const doc = (name: string, n = 0): Doc => ({ name, n })

describe('commitEdit', () => {
  it('adds a step and clears the redo list', () => {
    const a = doc('a')
    const b = doc('b')
    const c = doc('c')
    let h = commitEdit(initHistory(a), b, null, 0)
    h = undo(h)
    expect(h.future).toEqual([b])
    h = commitEdit(h, c, null, 10)
    expect(h.past).toEqual([a])
    expect(h.present).toBe(c)
    expect(h.future).toEqual([])
  })

  it('adds no step when the edit returns the same object', () => {
    const h = initHistory(doc('a'))
    expect(commitEdit(h, h.present, null, 0)).toBe(h)
  })

  it('merges edits to one field inside the window into one step', () => {
    const start = doc('')
    let h = initHistory(start)
    h = commitEdit(h, doc('M'), 'name', 0)
    h = commitEdit(h, doc('Mi'), 'name', 300)
    h = commitEdit(h, doc('Mil'), 'name', 300 + COALESCE_MS)
    expect(h.past).toEqual([start])
    expect(undo(h).present).toBe(start)
  })

  it('starts a new step after the window, for another field, or for a node edit', () => {
    let h = initHistory(doc(''))
    h = commitEdit(h, doc('M'), 'name', 0)
    h = commitEdit(h, doc('Mi'), 'name', COALESCE_MS + 1)
    expect(h.past).toHaveLength(2)
    h = commitEdit(h, doc('Mi', 1), 'n', COALESCE_MS + 2)
    expect(h.past).toHaveLength(3)
    // A function updater (a placement) passes null and never merges.
    h = commitEdit(h, doc('Mi', 2), null, COALESCE_MS + 3)
    h = commitEdit(h, doc('Mi', 3), null, COALESCE_MS + 4)
    expect(h.past).toHaveLength(5)
  })

  it('does not merge into the first edit after an undo or a save', () => {
    let h = initHistory(doc(''))
    h = commitEdit(h, doc('M'), 'name', 0)
    h = commitEdit(h, doc('Mi'), 'name', 1)
    h = sealHistory(h)
    h = commitEdit(h, doc('Mil'), 'name', 2)
    expect(h.past).toHaveLength(2)
    h = undo(h)
    h = commitEdit(h, doc('Mix'), 'name', 3)
    expect(h.past).toHaveLength(2)
  })

  it(`keeps at most ${HISTORY_LIMIT} steps, and drops the oldest`, () => {
    const first = doc('first')
    let h = initHistory(first)
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) h = commitEdit(h, doc('x', i), null, i)
    expect(h.past).toHaveLength(HISTORY_LIMIT)
    expect(h.past).not.toContain(first)
  })
})

describe('undo and redo', () => {
  it('walk back and forward through the same objects', () => {
    const a = doc('a')
    const b = doc('b')
    const c = doc('c')
    let h = initHistory(a)
    h = commitEdit(h, b, null, 0)
    h = commitEdit(h, c, null, 1)
    h = undo(h)
    expect(h.present).toBe(b)
    h = undo(h)
    expect(h.present).toBe(a)
    h = redo(h)
    expect(h.present).toBe(b)
    h = redo(h)
    expect(h.present).toBe(c)
  })

  it('do nothing at either end', () => {
    const h = initHistory(doc('a'))
    expect(undo(h)).toBe(h)
    expect(redo(h)).toBe(h)
  })
})

describe('coalesceKeyFor', () => {
  it('names the field of a one-field patch, and nothing else', () => {
    expect(coalesceKeyFor({ name: 'x' })).toBe('name')
    expect(coalesceKeyFor({ x: 1, y: 2 })).toBeNull()
    expect(coalesceKeyFor({})).toBeNull()
    expect(coalesceKeyFor((p: Doc) => p)).toBeNull()
  })
})

describe('holds', () => {
  it('finds a snapshot in the present, the past or the future', () => {
    const a = doc('a')
    const b = doc('b')
    let h = commitEdit(initHistory(a), b, null, 0)
    expect(holds(h, a)).toBe(true)
    expect(holds(h, b)).toBe(true)
    h = undo(h)
    expect(holds(h, b)).toBe(true)
    expect(holds(h, doc('a'))).toBe(false)
  })
})
