import { describe, it, expect } from 'vitest'
import { parsePanelXml, serializePanelXml, parseRect, formatRect } from '../panelXml'
import type { UiPanelLayout } from '../types'

/** Exercises every control kind and every binding attribute. */
const FULL: UiPanelLayout = {
  id: 'extstats',
  layoutVersion: 1,
  anchor: { x: 0, y: 0, w: 160, h: 100 },
  variants: [
    {
      name: 'compact',
      background: 'extstats_bg.png',
      controls: [
        {
          kind: 'label',
          name: 'hp_text',
          rect: { x: 10, y: 10, w: 60, h: 14 },
          align: 'right',
          binding: { path: 'player.hp', maxPath: 'player.maxhp', format: '{value}/{max}' }
        },
        {
          kind: 'progressbar',
          name: 'hp_bar',
          rect: { x: 10, y: 26, w: 120, h: 8 },
          frames: 12,
          binding: { path: 'player.hp', maxPath: 'player.maxhp' }
        },
        {
          kind: 'image',
          name: 'mail_icon',
          rect: { x: 140, y: 4, w: 16, h: 16 },
          binding: { visiblePath: 'player.mailstatus' }
        },
        { kind: 'button', name: 'expand_btn', rect: { x: 4, y: 80, w: 24, h: 16 } },
        {
          kind: 'textbox',
          name: 'chat_input',
          rect: { x: 10, y: 84, w: 100, h: 14 },
          maxLength: 80
        }
      ]
    },
    { name: 'expanded', background: 'extstats_expanded_bg.png', controls: [] }
  ]
}

describe('rect helpers', () => {
  it('round-trips', () => {
    expect(parseRect(formatRect({ x: 1, y: -2, w: 30, h: 4 }))).toEqual({
      x: 1,
      y: -2,
      w: 30,
      h: 4
    })
  })

  it('accepts whitespace around components', () => {
    expect(parseRect(' 1, 2 ,3,4 ')).toEqual({ x: 1, y: 2, w: 3, h: 4 })
  })

  it('rejects malformed rects', () => {
    expect(() => parseRect('1,2,3')).toThrow(/invalid rect/)
    expect(() => parseRect('1,2,3,x')).toThrow(/invalid rect/)
  })
})

describe('serialize → parse round-trip', () => {
  it('is identity on a layout exercising every kind and binding attribute', () => {
    expect(parsePanelXml(serializePanelXml(FULL))).toEqual(FULL)
  })

  it('is stable (serialize twice yields identical text)', () => {
    const once = serializePanelXml(FULL)
    expect(serializePanelXml(parsePanelXml(once))).toBe(once)
  })
})

describe('parsePanelXml', () => {
  it('parses the format-doc fixture shape', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<panel id="extstats" layout-version="1">
  <anchor rect="0,0,160,100"/>
  <variant name="compact" background="extstats_bg.png">
    <label name="crit" rect="80,10,60,14" align="right"
           bind="player.ext.crit" format="{value:0.0}%"/>
  </variant>
</panel>`
    const layout = parsePanelXml(xml)
    expect(layout.id).toBe('extstats')
    expect(layout.anchor).toEqual({ x: 0, y: 0, w: 160, h: 100 })
    expect(layout.variants).toHaveLength(1)
    const crit = layout.variants[0].controls[0]
    expect(crit.kind).toBe('label')
    expect(crit.binding).toEqual({ path: 'player.ext.crit', format: '{value:0.0}%' })
  })

  it('defaults layout-version to 1', () => {
    const layout = parsePanelXml(
      '<panel id="p"><anchor rect="0,0,10,10"/><variant name="default"/></panel>'
    )
    expect(layout.layoutVersion).toBe(1)
    expect(layout.variants[0].controls).toEqual([])
  })

  it('omits binding when no bind* attributes are present', () => {
    const layout = parsePanelXml(
      '<panel id="p"><anchor rect="0,0,10,10"/><variant name="v"><label name="a" rect="0,0,5,5"/></variant></panel>'
    )
    expect(layout.variants[0].controls[0].binding).toBeUndefined()
  })

  it('rejects a wrong root element', () => {
    expect(() => parsePanelXml('<Map/>')).toThrow(/expected <panel>/)
  })

  it('rejects missing or duplicate anchors', () => {
    expect(() => parsePanelXml('<panel id="p"><variant name="v"/></panel>')).toThrow(
      /exactly one <anchor>/
    )
    expect(() =>
      parsePanelXml(
        '<panel id="p"><anchor rect="0,0,1,1"/><anchor rect="0,0,2,2"/><variant name="v"/></panel>'
      )
    ).toThrow(/exactly one <anchor>/)
  })

  it('rejects unknown control elements', () => {
    expect(() =>
      parsePanelXml(
        '<panel id="p"><anchor rect="0,0,10,10"/><variant name="v"><slider name="s" rect="0,0,5,5"/></variant></panel>'
      )
    ).toThrow(/unknown control element <slider>/)
  })

  it('rejects duplicate control names within a variant (schema refinement)', () => {
    expect(() =>
      parsePanelXml(
        '<panel id="p"><anchor rect="0,0,10,10"/><variant name="v"><label name="a" rect="0,0,5,5"/><label name="a" rect="0,6,5,5"/></variant></panel>'
      )
    ).toThrow(/duplicate control name/)
  })

  it('rejects duplicate variant names (schema refinement)', () => {
    expect(() =>
      parsePanelXml(
        '<panel id="p"><anchor rect="0,0,10,10"/><variant name="v"/><variant name="v"/></panel>'
      )
    ).toThrow(/duplicate variant name/)
  })

  it('rejects malformed XML', () => {
    expect(() => parsePanelXml('<panel id="p">')).toThrow(/XML parse error/)
  })

  it('rejects invalid control names (schema)', () => {
    expect(() =>
      parsePanelXml(
        '<panel id="p"><anchor rect="0,0,10,10"/><variant name="v"><label name="Bad-Name" rect="0,0,5,5"/></variant></panel>'
      )
    ).toThrow()
  })
})

describe('serializePanelXml', () => {
  it('self-closes empty variants and escapes attribute values', () => {
    const layout: UiPanelLayout = {
      id: 'p',
      layoutVersion: 1,
      anchor: { x: 0, y: 0, w: 10, h: 10 },
      variants: [
        {
          name: 'v',
          controls: [
            {
              kind: 'label',
              name: 'a',
              rect: { x: 0, y: 0, w: 5, h: 5 },
              binding: { format: '<{value}> & "{max}"' }
            }
          ]
        },
        { name: 'empty', controls: [] }
      ]
    }
    const xml = serializePanelXml(layout)
    expect(xml).toContain('<variant name="empty"/>')
    expect(xml).toContain('format="&lt;{value}&gt; &amp; &quot;{max}&quot;"')
    expect(parsePanelXml(xml)).toEqual(layout)
  })

  it('rejects an invalid layout before writing', () => {
    const bad = { ...FULL, variants: [] }
    expect(() => serializePanelXml(bad)).toThrow()
  })
})
