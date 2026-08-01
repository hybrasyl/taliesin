import { describe, it, expect } from 'vitest'
import {
  buildSpecMarkdown,
  slugForPath,
  specRelPath,
  type CustomVariableSpec
} from '../specTemplate'

describe('slugForPath', () => {
  it('lowercases and dot-separates dotted paths', () => {
    expect(slugForPath('player.ext.critdmg')).toBe('player-ext-critdmg')
  })
  it('collapses index brackets to a hyphenated token', () => {
    expect(slugForPath('inventory.slot[n].count')).toBe('inventory-slot-n-count')
    expect(slugForPath('inventory.slot[3].count')).toBe('inventory-slot-3-count')
  })
  it('trims leading/trailing separators and falls back for empty input', () => {
    expect(slugForPath('  ..player.. ')).toBe('player')
    expect(slugForPath('***')).toBe('variable')
  })
})

describe('specRelPath', () => {
  it('nests under specs/ with a .md extension', () => {
    expect(specRelPath('player.ext.critdmg')).toBe('specs/player-ext-critdmg.md')
  })
})

describe('buildSpecMarkdown', () => {
  const base: CustomVariableSpec = {
    path: 'player.ext.critdmg',
    type: 'float',
    container: 'extstats / compact / critdmg_label (label)',
    frequency: 'on stat recalculation',
    justification: 'Extended crit-damage percentage shown in the stats panel.',
    recommended: 'B'
  }

  it('renders a deterministic, self-consistent spec', () => {
    expect(buildSpecMarkdown(base)).toMatchSnapshot()
  })

  it('is deterministic across calls (no timestamps)', () => {
    expect(buildSpecMarkdown(base)).toBe(buildSpecMarkdown(base))
  })

  it('includes the path, type, container, and all three options', () => {
    const md = buildSpecMarkdown(base)
    expect(md).toContain('# Design spec: `player.ext.critdmg`')
    expect(md).toContain('**Type:** `float`')
    expect(md).toContain('**Used by:** extstats / compact / critdmg_label (label)')
    expect(md).toContain('### Option A')
    expect(md).toContain('### Option B')
    expect(md).toContain('### Option C')
    expect(md).toContain('append f32 to the 0xFF ExtendedStats packet')
  })

  it('omits the "Used by" line when no container is given', () => {
    const md = buildSpecMarkdown({ ...base, container: undefined })
    expect(md).not.toContain('**Used by:**')
  })

  it('marks the recommendation as undecided when none is chosen', () => {
    const md = buildSpecMarkdown({ ...base, recommended: undefined })
    expect(md).toContain('**Recommended:** _(to be decided)_')
  })

  it('picks a type-appropriate binding snippet', () => {
    expect(buildSpecMarkdown({ ...base, type: 'bool' })).toContain(
      'bind-visible="player.ext.critdmg"'
    )
    expect(buildSpecMarkdown({ ...base, type: 'sprite' })).toContain('bind="player.ext.critdmg"')
    expect(buildSpecMarkdown({ ...base, type: 'float' })).toContain('format="{value:0.0}"')
  })
})
