import { describe, it, expect } from 'vitest'
import { nextCursorIndex, isActivateKey, clampCursor, PAGE_STEP } from '../listKeyboard'

describe('nextCursorIndex', () => {
  it('enters at the top on Down and at the bottom on Up', () => {
    expect(nextCursorIndex('ArrowDown', -1, 5)).toBe(0)
    expect(nextCursorIndex('ArrowUp', -1, 5)).toBe(4)
  })

  it('steps one row and stops at each end', () => {
    expect(nextCursorIndex('ArrowDown', 2, 5)).toBe(3)
    expect(nextCursorIndex('ArrowUp', 2, 5)).toBe(1)
    // Deliberately clamps rather than wrapping: a wrap on a 900-map catalog
    // reads as a scroll glitch, not as navigation.
    expect(nextCursorIndex('ArrowDown', 4, 5)).toBe(4)
    expect(nextCursorIndex('ArrowUp', 0, 5)).toBe(0)
  })

  it('jumps to the ends', () => {
    expect(nextCursorIndex('Home', 3, 5)).toBe(0)
    expect(nextCursorIndex('End', 1, 5)).toBe(4)
  })

  it('pages by PAGE_STEP, clamped', () => {
    expect(nextCursorIndex('PageDown', 0, 100)).toBe(PAGE_STEP)
    expect(nextCursorIndex('PageUp', 50, 100)).toBe(50 - PAGE_STEP)
    expect(nextCursorIndex('PageDown', 95, 100)).toBe(99)
    expect(nextCursorIndex('PageUp', 3, 100)).toBe(0)
  })

  it('returns null for a key it does not own, so the caller leaves typing alone', () => {
    expect(nextCursorIndex('a', 0, 5)).toBeNull()
    expect(nextCursorIndex('Tab', 0, 5)).toBeNull()
    expect(nextCursorIndex('Enter', 0, 5)).toBeNull()
  })

  it('returns null for an empty list, whatever the key', () => {
    expect(nextCursorIndex('ArrowDown', -1, 0)).toBeNull()
    expect(nextCursorIndex('Home', -1, 0)).toBeNull()
  })
})

describe('isActivateKey', () => {
  it('accepts Enter and both spellings of space', () => {
    expect(isActivateKey('Enter')).toBe(true)
    expect(isActivateKey(' ')).toBe(true)
    expect(isActivateKey('Spacebar')).toBe(true)
  })

  it('rejects everything else', () => {
    expect(isActivateKey('ArrowDown')).toBe(false)
    expect(isActivateKey('e')).toBe(false)
  })
})

describe('clampCursor', () => {
  it('pulls a cursor back inside a shortened list', () => {
    expect(clampCursor(9, 4)).toBe(3)
  })

  it('leaves a valid cursor alone', () => {
    expect(clampCursor(2, 4)).toBe(2)
  })

  it('drops to -1 when the list empties, so Down re-enters at the top', () => {
    expect(clampCursor(2, 0)).toBe(-1)
  })

  it('keeps -1 as -1', () => {
    expect(clampCursor(-1, 4)).toBe(-1)
  })
})
