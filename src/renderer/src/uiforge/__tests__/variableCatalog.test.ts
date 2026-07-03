import { describe, it, expect } from 'vitest'
import {
  VARIABLE_CATALOG,
  EQUIPMENT_SLOTS,
  aggregateVariablesUsed,
  normalizeVariablePath,
  resolveVariable,
  validatePath,
  variablesUsedIn
} from '../variableCatalog'
import type { UiPanelLayout } from '../types'

describe('variableCatalog — integrity', () => {
  it('has no duplicate paths', () => {
    const seen = new Set<string>()
    for (const d of VARIABLE_CATALOG) {
      expect(seen.has(d.path), `duplicate ${d.path}`).toBe(false)
      seen.add(d.path)
    }
  })

  it('every path is lowercase and dotted', () => {
    for (const d of VARIABLE_CATALOG) {
      expect(d.path).toBe(d.path.toLowerCase())
      expect(d.path).toMatch(/^[a-z0-9_.[\]]+$/)
    }
  })

  it('covers all 18 equipment slots × 3 fields', () => {
    expect(EQUIPMENT_SLOTS).toHaveLength(18)
    for (const slot of EQUIPMENT_SLOTS) {
      for (const field of ['name', 'sprite', 'durability']) {
        expect(resolveVariable(`equipment.${slot}.${field}`)).not.toBeNull()
      }
    }
  })

  it('has the expected core player.ext floats', () => {
    for (const p of ['mr', 'hit', 'dmg', 'crit', 'magiccrit', 'dodge', 'magicdodge']) {
      const res = resolveVariable(`player.ext.${p}`)
      expect(res?.def.type).toBe('float')
    }
  })
})

describe('normalizeVariablePath', () => {
  it('collapses literal indices to the template placeholder', () => {
    expect(normalizeVariablePath('inventory.slot[3].count')).toBe('inventory.slot[n].count')
    expect(normalizeVariablePath('player.hp')).toBe('player.hp')
  })
})

describe('resolveVariable', () => {
  it('resolves a static path', () => {
    const res = resolveVariable('player.hp')
    expect(res?.def.type).toBe('int')
    expect(res?.index).toBeUndefined()
  })

  it('returns null for unknown paths', () => {
    expect(resolveVariable('player.nope')).toBeNull()
  })

  it('resolves an in-range indexed template', () => {
    const res = resolveVariable('inventory.slot[5].name')
    expect(res?.def.type).toBe('string')
    expect(res?.index).toBe(5)
    expect(res?.indexError).toBeFalsy()
  })

  it('flags an out-of-range index', () => {
    expect(resolveVariable('inventory.slot[60].name')?.indexError).toBe(true)
    expect(resolveVariable('inventory.slot[0].name')?.indexError).toBe(true)
  })

  it('flags a hole in skills/spells', () => {
    expect(resolveVariable('skills.slot[35].name')?.indexError).toBe(true)
    expect(resolveVariable('spells.slot[71].name')?.indexError).toBe(true)
    expect(resolveVariable('skills.slot[34].name')?.indexError).toBeFalsy()
  })

  it('requires an index on a template and rejects an index on a static path', () => {
    expect(resolveVariable('inventory.slot.name')).toBeNull()
    expect(resolveVariable('inventory.slot[n].name')?.indexError).toBe(true)
    expect(resolveVariable('player.hp[1]')).toBeNull()
  })
})

describe('validatePath', () => {
  it('passes a compatible numeric bind', () => {
    expect(validatePath('player.hp', ['int', 'float'])).toBeNull()
  })

  it('reports type mismatch', () => {
    expect(validatePath('player.name', ['int', 'float'])).toBe('type-mismatch')
    expect(validatePath('player.mailstatus', ['int'])).toBe('type-mismatch')
  })

  it('reports unknown paths and empty is neutral', () => {
    expect(validatePath('made.up.path')).toBe('unknown')
    expect(validatePath('   ')).toBeNull()
  })

  it('reports index errors', () => {
    expect(validatePath('inventory.slot[99].count', ['int'])).toBe('index-error')
  })

  it('accepts a bool bind-visible', () => {
    expect(validatePath('player.mailstatus', ['bool'])).toBeNull()
    expect(validatePath('player.blinded', ['bool'])).toBeNull()
  })
})

describe('variablesUsedIn / aggregateVariablesUsed', () => {
  const layout: UiPanelLayout = {
    id: 'extstats',
    layoutVersion: 1,
    anchor: { x: 0, y: 0, w: 160, h: 100 },
    variants: [
      {
        name: 'compact',
        controls: [
          {
            kind: 'progressbar',
            name: 'hp_bar',
            rect: { x: 0, y: 0, w: 10, h: 2 },
            binding: { path: 'player.hp', maxPath: 'player.maxhp' }
          },
          {
            kind: 'label',
            name: 'inv',
            rect: { x: 0, y: 0, w: 10, h: 2 },
            binding: { path: 'inventory.slot[3].name' }
          },
          {
            kind: 'image',
            name: 'mail',
            rect: { x: 0, y: 0, w: 10, h: 2 },
            binding: { visiblePath: 'player.mailstatus' }
          },
          { kind: 'button', name: 'btn', rect: { x: 0, y: 0, w: 10, h: 2 } }
        ]
      }
    ]
  }

  it('collects and template-normalizes every bound path, sorted + deduped', () => {
    expect(variablesUsedIn(layout)).toEqual([
      'inventory.slot[n].name',
      'player.hp',
      'player.mailstatus',
      'player.maxhp'
    ])
  })

  it('unions across layouts', () => {
    const other: UiPanelLayout = {
      ...layout,
      id: 'other',
      variants: [
        {
          name: 'default',
          controls: [
            {
              kind: 'label',
              name: 'g',
              rect: { x: 0, y: 0, w: 1, h: 1 },
              binding: { path: 'player.gold' }
            }
          ]
        }
      ]
    }
    expect(aggregateVariablesUsed([layout, other])).toContain('player.gold')
    expect(aggregateVariablesUsed([layout, other])).toContain('player.hp')
  })
})
