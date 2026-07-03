import { describe, it, expect } from 'vitest'
import { createEmptyLayout, uiPanelLayoutSchema, uiControlSchema } from '../types'

describe('uiPanelLayoutSchema', () => {
  it('accepts createEmptyLayout output', () => {
    expect(() => uiPanelLayoutSchema.parse(createEmptyLayout('mypanel'))).not.toThrow()
  })

  it('requires at least one variant', () => {
    const layout = { ...createEmptyLayout('p'), variants: [] }
    expect(uiPanelLayoutSchema.safeParse(layout).success).toBe(false)
  })

  it('rejects uppercase / hyphenated ids', () => {
    for (const id of ['MyPanel', 'my-panel', 'my panel', '']) {
      expect(uiPanelLayoutSchema.safeParse(createEmptyLayout(id)).success).toBe(false)
    }
  })

  it('rejects duplicate variant names', () => {
    const layout = createEmptyLayout('p')
    layout.variants.push({ name: 'default', controls: [] })
    const res = uiPanelLayoutSchema.safeParse(layout)
    expect(res.success).toBe(false)
  })

  it('rejects duplicate control names within one variant but allows reuse across variants', () => {
    const layout = createEmptyLayout('p')
    const ctrl = { kind: 'label' as const, name: 'hp', rect: { x: 0, y: 0, w: 5, h: 5 } }
    layout.variants[0].controls = [ctrl, { ...ctrl }]
    expect(uiPanelLayoutSchema.safeParse(layout).success).toBe(false)

    layout.variants[0].controls = [ctrl]
    layout.variants.push({ name: 'expanded', controls: [{ ...ctrl }] })
    expect(uiPanelLayoutSchema.safeParse(layout).success).toBe(true)
  })
})

describe('uiControlSchema', () => {
  const base = { kind: 'label', name: 'a', rect: { x: 0, y: 0, w: 5, h: 5 } }

  it('rejects negative width/height but allows negative position', () => {
    expect(uiControlSchema.safeParse({ ...base, rect: { x: -1, y: -1, w: 5, h: 5 } }).success).toBe(
      true
    )
    expect(uiControlSchema.safeParse({ ...base, rect: { x: 0, y: 0, w: -5, h: 5 } }).success).toBe(
      false
    )
  })

  it('rejects frames < 1', () => {
    expect(uiControlSchema.safeParse({ ...base, kind: 'progressbar', frames: 0 }).success).toBe(
      false
    )
  })

  it('rejects non-integer rects', () => {
    expect(uiControlSchema.safeParse({ ...base, rect: { x: 0.5, y: 0, w: 5, h: 5 } }).success).toBe(
      false
    )
  })

  it('rejects unknown kinds', () => {
    expect(uiControlSchema.safeParse({ ...base, kind: 'slider' }).success).toBe(false)
  })
})
