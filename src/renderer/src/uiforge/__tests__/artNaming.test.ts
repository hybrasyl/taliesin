import { describe, it, expect } from 'vitest'
import { backgroundFilename, controlArtFilename, artStatesForKind } from '../artNaming'

describe('artNaming', () => {
  it('builds per-variant background names', () => {
    expect(backgroundFilename('extstats', 'compact')).toBe('extstats_compact_bg.png')
  })

  it('builds per-control state art names', () => {
    expect(controlArtFilename('extstats', 'expand_btn', 'normal')).toBe(
      'extstats_expand_btn_normal.png'
    )
    expect(controlArtFilename('extstats', 'expand_btn', 'pressed')).toBe(
      'extstats_expand_btn_pressed.png'
    )
  })

  it('maps kinds to their art states', () => {
    expect(artStatesForKind('button')).toEqual(['normal', 'pressed', 'disabled'])
    expect(artStatesForKind('image')).toEqual(['normal'])
    expect(artStatesForKind('progressbar')).toEqual(['normal'])
    expect(artStatesForKind('label')).toEqual([])
    expect(artStatesForKind('textbox')).toEqual([])
  })
})
