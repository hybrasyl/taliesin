import { describe, it, expect } from 'vitest'
import {
  checkTileEligibility,
  isPaletteCycled,
  hasLegacyFloor,
  hasLegacyWall,
  type EligibilityAssets,
  type PaletteTableLike
} from '../tileEligibility'
import type { AnimationTableLike } from '../tileAnimation'

/** Fake animation table: every id in each sequence maps to that sequence. */
function fakeAnimTable(sequences: number[][]): AnimationTableLike {
  const map = new Map<number, { tileSequence: number[] }>()
  for (const seq of sequences) for (const id of seq) map.set(id, { tileSequence: seq })
  return { tryGetEntry: (id) => map.get(id) }
}

/**
 * Fake palette table. `cyclingPalettes` = the set of palette NUMBERS that carry
 * cycling entries. `paletteOf(id)` maps a (already +1-offset) id → palette number;
 * defaults to identity so `id → id`.
 */
function fakePaletteTable(
  cyclingPalettes: Set<number>,
  paletteOf: (id: number) => number = (id) => id
): PaletteTableLike {
  return {
    getPaletteNumber: (id) => paletteOf(id),
    getCyclingEntries: (n) => (cyclingPalettes.has(n) ? [{}] : undefined)
  }
}

describe('isPaletteCycled', () => {
  it('applies the +1 offset before the palette lookup', () => {
    // palette number 6 cycles; getPaletteNumber is identity, so id 5 → palette 6.
    const table = fakePaletteTable(new Set([6]))
    expect(isPaletteCycled(table, 5)).toBe(true)
    expect(isPaletteCycled(table, 6)).toBe(false) // 6 → palette 7, not cycling
  })

  it('is false when the palette carries no cycling entries', () => {
    expect(isPaletteCycled(fakePaletteTable(new Set()), 5)).toBe(false)
  })
})

describe('hasLegacyFloor / hasLegacyWall', () => {
  it('floor legacy is 1..groundTileCount inclusive', () => {
    const a = { groundTileCount: 3 }
    expect(hasLegacyFloor(a, 0)).toBe(false)
    expect(hasLegacyFloor(a, 1)).toBe(true)
    expect(hasLegacyFloor(a, 3)).toBe(true)
    expect(hasLegacyFloor(a, 4)).toBe(false)
  })

  it('wall legacy checks the padded stc HPF entry', () => {
    const a = { iaArchive: { get: (n: string) => (n === 'stc10500.hpf' ? {} : undefined) } }
    expect(hasLegacyWall(a, 10500)).toBe(true)
    expect(hasLegacyWall(a, 10501)).toBe(false)
  })
})

// ── checkTileEligibility ──────────────────────────────────────────────────────

function makeAssets(over: Partial<EligibilityAssets> = {}): EligibilityAssets {
  return {
    groundAnimationTable: fakeAnimTable([]),
    stcAnimationTable: fakeAnimTable([]),
    groundTileCount: 100,
    groundPaletteTable: fakePaletteTable(new Set()),
    stcPaletteTable: fakePaletteTable(new Set()),
    iaArchive: { get: () => undefined },
    ...over
  }
}

describe('checkTileEligibility', () => {
  it('flags a frame-animated floor id (animated takes precedence)', () => {
    // id 50 is animated AND its palette cycles — animated should win.
    const assets = makeAssets({
      groundAnimationTable: fakeAnimTable([[50, 51]]),
      groundPaletteTable: fakePaletteTable(new Set([51])) // 50 → palette 51
    })
    const r = checkTileEligibility(assets, 'floor', 50)
    expect(r).toEqual({ eligible: false, reason: 'animated', sequence: [50, 51] })
  })

  it('flags a palette-cycled floor id inside the legacy range', () => {
    const assets = makeAssets({
      groundTileCount: 100,
      groundPaletteTable: fakePaletteTable(new Set([13])) // floor id 12 → palette 13
    })
    expect(checkTileEligibility(assets, 'floor', 12)).toEqual({ eligible: false, reason: 'cycled' })
  })

  it('does NOT cycled-skip a pack-only floor id (legacy gate)', () => {
    // id beyond groundTileCount has no legacy data → always eligible even if the
    // palette would cycle.
    const assets = makeAssets({
      groundTileCount: 10,
      groundPaletteTable: fakePaletteTable(new Set([21])) // id 20 → palette 21 (cycles)
    })
    expect(checkTileEligibility(assets, 'floor', 20)).toEqual({ eligible: true })
  })

  it('flags a palette-cycled wall id that has a legacy HPF', () => {
    const assets = makeAssets({
      iaArchive: { get: (n: string) => (n === 'stc10500.hpf' ? {} : undefined) },
      stcPaletteTable: fakePaletteTable(new Set([10501])) // wall id 10500 → palette 10501
    })
    expect(checkTileEligibility(assets, 'wall', 10500)).toEqual({
      eligible: false,
      reason: 'cycled'
    })
  })

  it('does NOT cycled-skip a wall id with no legacy HPF', () => {
    const assets = makeAssets({
      iaArchive: { get: () => undefined },
      stcPaletteTable: fakePaletteTable(new Set([10501]))
    })
    expect(checkTileEligibility(assets, 'wall', 10500)).toEqual({ eligible: true })
  })

  it('returns eligible for a plain legacy id with no cycling / animation', () => {
    expect(checkTileEligibility(makeAssets(), 'floor', 12)).toEqual({ eligible: true })
  })

  it("returns eligible (can't verify) when no assets are loaded", () => {
    expect(checkTileEligibility(null, 'floor', 12)).toEqual({ eligible: true })
    expect(checkTileEligibility(undefined, 'wall', 10500)).toEqual({ eligible: true })
  })
})
