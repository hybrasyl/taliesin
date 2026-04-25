import { describe, it, expect } from 'vitest'
import { PRESET_LIST, buildFromPreset, type PresetId } from '../presets'

const ALL_IDS: PresetId[] = ['blank', 'hybrasyl-elements', 'greyscale', 'sepia', 'da-classic']

describe('PRESET_LIST', () => {
  it('exposes one entry per PresetId', () => {
    const ids = PRESET_LIST.map((p) => p.id).sort()
    expect(ids).toEqual([...ALL_IDS].sort())
  })

  it('every preset has a non-empty label and description', () => {
    for (const p of PRESET_LIST) {
      expect(p.label.length).toBeGreaterThan(0)
      expect(p.description.length).toBeGreaterThan(0)
    }
  })
})

describe('buildFromPreset', () => {
  it('attaches the supplied id and name to every preset', () => {
    for (const id of ALL_IDS) {
      const palette = buildFromPreset(id, 'my-id', 'My Name')
      expect(palette.id).toBe('my-id')
      expect(palette.name).toBe('My Name')
    }
  })

  it('sets lastModified to a valid ISO 8601 string', () => {
    const palette = buildFromPreset('blank', 'x', 'X')
    expect(palette.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    // Should be parseable back to a date close to now
    const parsed = new Date(palette.lastModified).getTime()
    expect(Date.now() - parsed).toBeLessThan(5_000)
  })

  it('blank preset has exactly one entry', () => {
    expect(buildFromPreset('blank', 'x', 'X').entries).toHaveLength(1)
  })

  it('hybrasyl-elements has the expected 17 elements', () => {
    const palette = buildFromPreset('hybrasyl-elements', 'x', 'X')
    expect(palette.entries).toHaveLength(17)
    const ids = palette.entries.map((e) => e.id)
    expect(ids).toContain('fire')
    expect(ids).toContain('water')
    expect(ids).toContain('chaos')
    expect(ids).toContain('order')
  })

  it('greyscale, sepia, and da-classic each have one entry', () => {
    expect(buildFromPreset('greyscale', 'x', 'X').entries).toHaveLength(1)
    expect(buildFromPreset('sepia', 'x', 'X').entries).toHaveLength(1)
    expect(buildFromPreset('da-classic', 'x', 'X').entries).toHaveLength(1)
  })

  it('every entry has valid hex shadow/highlight colors', () => {
    for (const id of ALL_IDS) {
      for (const entry of buildFromPreset(id, 'x', 'X').entries) {
        expect(entry.shadowColor).toMatch(/^#[0-9A-Fa-f]{6}$/)
        expect(entry.highlightColor).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
    }
  })

  it('returns a fresh entries array per call (no shared references)', () => {
    const a = buildFromPreset('hybrasyl-elements', 'a', 'A')
    const b = buildFromPreset('hybrasyl-elements', 'b', 'B')
    expect(a.entries).not.toBe(b.entries)
    a.entries[0].name = 'mutated'
    expect(b.entries[0].name).not.toBe('mutated')
  })

  it('determinism: two calls yield identical content (modulo lastModified)', () => {
    const a = buildFromPreset('hybrasyl-elements', 'x', 'X')
    const b = buildFromPreset('hybrasyl-elements', 'x', 'X')
    expect({ ...a, lastModified: '_' }).toEqual({ ...b, lastModified: '_' })
  })
})
