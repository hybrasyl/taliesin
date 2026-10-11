// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { historyChord, isModKey, isTypingTarget } from '../keyboard'

// HTOO-342. The Map Maker and the map XML editor's Placement tab both bind
// single-letter tool keys and both have text fields in reach, so both need the
// same answer to "is the user typing?". One rule, pinned here.

afterEach(() => {
  document.body.innerHTML = ''
})

/** Attach an element to the document so focus() actually takes. */
function mount<T extends HTMLElement>(el: T): T {
  document.body.appendChild(el)
  return el
}

describe('isTypingTarget', () => {
  it('is true for a text input', () => {
    expect(isTypingTarget(mount(document.createElement('input')))).toBe(true)
  })

  it('is true for a textarea and a select', () => {
    expect(isTypingTarget(mount(document.createElement('textarea')))).toBe(true)
    expect(isTypingTarget(mount(document.createElement('select')))).toBe(true)
  })

  // Not used in this app today, and exactly what a tagName-only check gets
  // wrong the first time somebody adds a rich-text field.
  it('is true for a contentEditable element', () => {
    const div = mount(document.createElement('div'))
    div.contentEditable = 'true'
    // jsdom does not implement isContentEditable off the attribute.
    Object.defineProperty(div, 'isContentEditable', { value: true })
    expect(isTypingTarget(div)).toBe(true)
  })

  it('is false for the canvas, a button and the body', () => {
    expect(isTypingTarget(mount(document.createElement('canvas')))).toBe(false)
    expect(isTypingTarget(mount(document.createElement('button')))).toBe(false)
    expect(isTypingTarget(document.body)).toBe(false)
  })

  // A window listener reads the target directly; callers that only have the
  // document fall back to whatever holds focus.
  it('falls back to the focused element when there is no usable target', () => {
    const input = mount(document.createElement('input'))
    input.focus()
    expect(isTypingTarget(null)).toBe(true)
    input.blur()
    expect(isTypingTarget(null)).toBe(false)
  })

  it('ignores a non-element target rather than throwing', () => {
    expect(isTypingTarget(new EventTarget())).toBe(false)
  })
})

// HTOO-569. On macOS the command key is ⌘ alone; a Control chord is the text
// system's (⌃K, ⌃P) and must never run a Taliesin command.
describe('isModKey', () => {
  const key = (ctrlKey: boolean, metaKey: boolean) => ({ ctrlKey, metaKey })

  it('is ⌘ alone on macOS', () => {
    expect(isModKey(key(false, true), 'darwin')).toBe(true)
    expect(isModKey(key(true, false), 'darwin')).toBe(false)
    expect(isModKey(key(true, true), 'darwin')).toBe(false)
    expect(isModKey(key(false, false), 'darwin')).toBe(false)
  })

  it('is Ctrl or the meta key elsewhere, as it always was', () => {
    for (const platform of ['win32', 'linux', undefined]) {
      expect(isModKey(key(true, false), platform)).toBe(true)
      expect(isModKey(key(false, true), platform)).toBe(true)
      expect(isModKey(key(false, false), platform)).toBe(false)
    }
  })
})

describe('historyChord', () => {
  const chord = (
    key: string,
    mods: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }
  ) => ({
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...mods
  })

  it('undoes on mod+Z and redoes on Shift+mod+Z, on every platform', () => {
    expect(historyChord(chord('z', { metaKey: true }), 'darwin')).toBe('undo')
    expect(historyChord(chord('Z', { metaKey: true, shiftKey: true }), 'darwin')).toBe('redo')
    expect(historyChord(chord('z', { ctrlKey: true }), 'win32')).toBe('undo')
    expect(historyChord(chord('Z', { ctrlKey: true, shiftKey: true }), 'win32')).toBe('redo')
  })

  it('redoes on Ctrl+Y off macOS only', () => {
    expect(historyChord(chord('y', { ctrlKey: true }), 'win32')).toBe('redo')
    expect(historyChord(chord('y', { metaKey: true }), 'darwin')).toBeNull()
  })

  it('leaves a Control chord alone on macOS, and a bare key everywhere', () => {
    expect(historyChord(chord('z', { ctrlKey: true }), 'darwin')).toBeNull()
    expect(historyChord(chord('z', {}), 'win32')).toBeNull()
  })
})
