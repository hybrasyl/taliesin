import { describe, it, expect } from 'vitest'
import {
  CONTROL_TYPE,
  classifyControl,
  controlFileToLayout,
  sanitizeName,
  type PrefabControl,
  type PrefabControlFile
} from '../prefabImport'
import { uiPanelLayoutSchema } from '../types'

const rect = (left: number, top: number, right: number, bottom: number): PrefabControl['rect'] => ({
  left,
  top,
  right,
  bottom
})

describe('sanitizeName', () => {
  it('lowercases and replaces invalid chars', () => {
    expect(sanitizeName('HP Bar')).toBe('hp_bar')
    expect(sanitizeName('mail-icon!')).toBe('mail_icon')
  })

  it('trims leading/trailing underscores and never returns empty', () => {
    expect(sanitizeName('__foo__')).toBe('foo')
    expect(sanitizeName('!!!')).toBe('control')
    expect(sanitizeName('')).toBe('control')
  })
})

describe('classifyControl', () => {
  const base: PrefabControl = { name: 'c', type: CONTROL_TYPE.DoesNotReturnValue }

  it('maps editable/readonly text', () => {
    expect(classifyControl({ ...base, type: CONTROL_TYPE.EditableText }).kind).toBe('textbox')
    expect(classifyControl({ ...base, type: CONTROL_TYPE.ReadonlyText }).kind).toBe('label')
  })

  it('maps images + return value → button', () => {
    const r = classifyControl({
      ...base,
      type: CONTROL_TYPE.ReturnsValue,
      returnValue: 5,
      images: [{ imageName: 'x', frameIndex: 0 }]
    })
    expect(r.kind).toBe('button')
  })

  it('maps images only → image', () => {
    const r = classifyControl({ ...base, images: [{ imageName: 'x', frameIndex: 0 }] })
    expect(r.kind).toBe('image')
  })

  it('defaults unrecognized controls to label with a warning', () => {
    const r = classifyControl(base)
    expect(r.kind).toBe('label')
    expect(r.warning).toMatch(/defaulted to label/)
  })
})

describe('controlFileToLayout', () => {
  const cf: PrefabControlFile = {
    controls: [
      {
        name: 'root',
        type: CONTROL_TYPE.Anchor,
        rect: rect(20, 40, 180, 140),
        images: [{ imageName: 'extbg', frameIndex: 0 }]
      },
      {
        name: 'HP Text',
        type: CONTROL_TYPE.ReadonlyText,
        rect: rect(30, 50, 90, 64)
      },
      {
        name: 'expand',
        type: CONTROL_TYPE.ReturnsValue,
        returnValue: 1,
        rect: rect(24, 120, 48, 136),
        images: [
          { imageName: 'btns', frameIndex: 2 },
          { imageName: 'btns', frameIndex: 3 }
        ]
      }
    ]
  }

  it('produces a schema-valid single-variant layout', () => {
    const { layout } = controlFileToLayout(cf, 'extstats')
    expect(() => uiPanelLayoutSchema.parse(layout)).not.toThrow()
    expect(layout.id).toBe('extstats')
    expect(layout.variants).toHaveLength(1)
    expect(layout.variants[0].name).toBe('default')
  })

  it('uses the anchor rect as origin and normalizes it to 0,0', () => {
    const { layout } = controlFileToLayout(cf, 'extstats')
    expect(layout.anchor).toEqual({ x: 0, y: 0, w: 160, h: 100 })
    const controls = layout.variants[0].controls
    // HP Text rect re-based by the anchor origin (20,40).
    expect(controls[0].rect).toEqual({ x: 10, y: 10, w: 60, h: 14 })
  })

  it('excludes the anchor control from the variant controls', () => {
    const { layout } = controlFileToLayout(cf, 'extstats')
    expect(layout.variants[0].controls.map((c) => c.name)).toEqual(['hp_text', 'expand'])
  })

  it('assigns kinds via the heuristics', () => {
    const { layout } = controlFileToLayout(cf, 'extstats')
    const [hp, expand] = layout.variants[0].controls
    expect(hp.kind).toBe('label')
    expect(expand.kind).toBe('button')
  })

  it('emits a background art job from the anchor image', () => {
    const { layout, artJobs } = controlFileToLayout(cf, 'extstats')
    expect(layout.variants[0].background).toBe('extstats_default_bg.png')
    const bg = artJobs.find((j) => j.label === 'background')
    expect(bg).toMatchObject({
      imageName: 'extbg',
      frameIndex: 0,
      destFilename: 'extstats_default_bg.png'
    })
  })

  it('emits normal/pressed art jobs from the first two control frames', () => {
    const { artJobs } = controlFileToLayout(cf, 'extstats')
    const control = artJobs.filter((j) => j.label.startsWith('expand'))
    expect(control).toEqual([
      {
        imageName: 'btns',
        frameIndex: 2,
        destFilename: 'extstats_expand_normal.png',
        label: 'expand → normal'
      },
      {
        imageName: 'btns',
        frameIndex: 3,
        destFilename: 'extstats_expand_pressed.png',
        label: 'expand → pressed'
      }
    ])
  })

  it('honors a custom variant name for add-as-variant flows', () => {
    const { layout, artJobs } = controlFileToLayout(cf, 'extstats', 'expanded')
    expect(layout.variants[0].name).toBe('expanded')
    expect(layout.variants[0].background).toBe('extstats_expanded_bg.png')
    expect(artJobs.find((j) => j.label === 'background')?.destFilename).toBe(
      'extstats_expanded_bg.png'
    )
  })

  it('de-duplicates sanitized control names', () => {
    const dup: PrefabControlFile = {
      controls: [
        { name: 'anchor', type: CONTROL_TYPE.Anchor, rect: rect(0, 0, 100, 100) },
        { name: 'HP!', type: CONTROL_TYPE.ReadonlyText, rect: rect(0, 0, 10, 10) },
        { name: 'hp', type: CONTROL_TYPE.ReadonlyText, rect: rect(0, 0, 10, 10) }
      ]
    }
    const { layout } = controlFileToLayout(dup, 'p')
    expect(layout.variants[0].controls.map((c) => c.name)).toEqual(['hp', 'hp_2'])
  })

  it('skips controls without a rect and warns', () => {
    const noRect: PrefabControlFile = {
      controls: [
        { name: 'anchor', type: CONTROL_TYPE.Anchor, rect: rect(0, 0, 50, 50) },
        { name: 'ghost', type: CONTROL_TYPE.ReadonlyText }
      ]
    }
    const { layout, warnings } = controlFileToLayout(noRect, 'p')
    expect(layout.variants[0].controls).toHaveLength(0)
    expect(warnings.some((w) => /ghost/.test(w))).toBe(true)
  })

  it('derives bounds from control rects when no anchor exists', () => {
    const noAnchor: PrefabControlFile = {
      controls: [
        { name: 'a', type: CONTROL_TYPE.ReadonlyText, rect: rect(10, 10, 30, 20) },
        { name: 'b', type: CONTROL_TYPE.ReadonlyText, rect: rect(40, 50, 60, 70) }
      ]
    }
    const { layout, warnings } = controlFileToLayout(noAnchor, 'p')
    expect(layout.anchor).toEqual({ x: 0, y: 0, w: 50, h: 60 })
    expect(layout.variants[0].controls[0].rect).toEqual({ x: 0, y: 0, w: 20, h: 10 })
    expect(warnings.some((w) => /no Anchor/.test(w))).toBe(true)
  })
})
