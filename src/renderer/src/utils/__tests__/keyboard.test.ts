// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { isTypingTarget } from '../keyboard'

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
