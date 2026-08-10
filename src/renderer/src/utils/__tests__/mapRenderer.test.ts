import { describe, it, expect, vi } from 'vitest'
import { PaletteTable, type DataArchive } from '@eriscorp/dalib-ts'
import {
  lruTouch,
  lruGet,
  _assetCacheSize,
  clearAllCaches,
  drawDiamond,
  buildWallPaletteTable
} from '../mapRenderer'

// A fake archive that satisfies the only surface PaletteTable.fromArchive uses,
// so the REAL dalib parser runs against it and no ia.dat is needed in CI.
// Every one of the three .tbl formats is `min max value`, which is the whole
// reason stcani parses cleanly as a palette map.
function fakeIaArchive(files: Record<string, string>): DataArchive {
  const entries = Object.entries(files).map(([entryName, text]) => ({
    entryName,
    // dalib routes on this: a numeric identifier means "cycling file".
    tryGetNumericIdentifier: () => {
      const m = /^[a-z]+(\d+)\.tbl$/i.exec(entryName)
      return m ? parseInt(m[1], 10) : null
    },
    toUint8Array: () => new TextEncoder().encode(text)
  }))
  return {
    getEntriesByPattern: (pattern: string, ext: string) =>
      entries.filter((e) => e.entryName.startsWith(pattern) && e.entryName.endsWith(ext))
  } as unknown as DataArchive
}

// Mirrors the real tables' shape: stcpal covers 14458 and does NOT cover 19386,
// which is exactly the arrangement that makes 19386 the one id stcani wins.
const STCPAL = '2 13 0\n14000 15000 7\n19000 19300 188\n'
// Real stcani lines are `startTile endTile frameCount`. Read as a palette range,
// `14457 14460 5` maps 14457..14460 to "palette" 5 — colliding with stcpal —
// and `19386 19390 19390` lands where stcpal has nothing.
const STCANI = '14457 14460 5\n19386 19390 19390\n'
const STC0006 = '236 241 2\n'

describe('buildWallPaletteTable (HTOO-151)', () => {
  it('does not let stcani.tbl contribute palette mappings', () => {
    const archive = fakeIaArchive({
      'stcani.tbl': STCANI,
      'stcpal.tbl': STCPAL,
      'stc0006.tbl': STC0006
    })
    const table = buildWallPaletteTable(archive)
    // 19386 is the id stcpal does not cover, so it is the one stcani used to
    // win outright — with a "palette" number that does not exist.
    expect(table.getPaletteNumber(19386)).not.toBe(19390)
    // And the ids the two tables share still come from stcpal.
    expect(table.getPaletteNumber(14458)).toBe(7)
  })

  it('keeps the cycling entries tileEligibility depends on', () => {
    // The reason this is not a one-line pattern swap: `fromArchive('stcpal')`
    // alone drops every numeric stc###.tbl, and isPaletteCycled reads them.
    const archive = fakeIaArchive({
      'stcani.tbl': STCANI,
      'stcpal.tbl': STCPAL,
      'stc0006.tbl': STC0006
    })
    expect(buildWallPaletteTable(archive).getCyclingEntries(6)).toBeDefined()
  })

  it('the old broad pattern really did admit stcani — the fault, pinned', () => {
    // Without this, the two assertions above could pass against a fix that does
    // nothing. This is the behaviour being corrected.
    const archive = fakeIaArchive({
      'stcani.tbl': STCANI,
      'stcpal.tbl': STCPAL,
      'stc0006.tbl': STC0006
    })
    const broad = PaletteTable.fromArchive('stc', archive)
    expect(broad.getPaletteNumber(19386)).toBe(19390)
  })

  it('a stcpal single-value override masks the contamination entirely', () => {
    // The second accident, and the one that makes this latent rather than
    // active on the real ia.dat: getPaletteNumber is
    // `overrides ?? entries ?? 0`, and stcpal carries a 2-token override line
    // for 19386. So even the one id stcani reaches resolves to stcpal's answer.
    // Measured: across ids 0..20000 the real archive shows ZERO differences.
    const withOverride = fakeIaArchive({
      'stcani.tbl': STCANI,
      'stcpal.tbl': STCPAL + '19386 188\n', // 2 tokens = a single-value override
      'stc0006.tbl': STC0006
    })
    expect(PaletteTable.fromArchive('stc', withOverride).getPaletteNumber(19386)).toBe(188)
    expect(buildWallPaletteTable(withOverride).getPaletteNumber(19386)).toBe(188)
  })

  it('stcpal merging last is what limits the damage, and is not guaranteed', () => {
    // Archive order is the only thing keeping stcpal on top. Reverse it and the
    // shared ids flip to stcani's values — 486 of them in the real ia.dat.
    const reversed = fakeIaArchive({
      'stcpal.tbl': STCPAL,
      'stcani.tbl': STCANI,
      'stc0006.tbl': STC0006
    })
    expect(PaletteTable.fromArchive('stc', reversed).getPaletteNumber(14458)).toBe(5)
    // The fix is order-independent, which is the actual point.
    expect(buildWallPaletteTable(reversed).getPaletteNumber(14458)).toBe(7)
  })
})

describe('drawDiamond', () => {
  function mockCtx() {
    return {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn()
    } as unknown as CanvasRenderingContext2D
  }

  it('traces the four diamond corners at scale 1 (HTILE_W=28, half-height 14)', () => {
    const ctx = mockCtx()
    drawDiamond(ctx, 100, 50, 1)
    expect(ctx.beginPath).toHaveBeenCalledOnce()
    expect(ctx.moveTo).toHaveBeenCalledWith(100, 36) // top: cy - hv
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 128, 50) // right: cx + hw
    expect(ctx.lineTo).toHaveBeenNthCalledWith(2, 100, 64) // bottom: cy + hv
    expect(ctx.lineTo).toHaveBeenNthCalledWith(3, 72, 50) // left: cx - hw
    expect(ctx.closePath).toHaveBeenCalledOnce()
  })

  it('scales the diamond half-extents by the scale factor', () => {
    const ctx = mockCtx()
    drawDiamond(ctx, 0, 0, 0.5) // hw = 14, hv = 7
    expect(ctx.moveTo).toHaveBeenCalledWith(0, -7)
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 14, 0)
    expect(ctx.lineTo).toHaveBeenNthCalledWith(2, 0, 7)
    expect(ctx.lineTo).toHaveBeenNthCalledWith(3, -14, 0)
  })

  it('defaults scale to 1', () => {
    const ctx = mockCtx()
    drawDiamond(ctx, 0, 0)
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 28, 0)
  })
})

describe('lruTouch', () => {
  it('inserts a new key', () => {
    const m = new Map<string, number>()
    lruTouch(m, 'a', 1, 3)
    expect([...m.entries()]).toEqual([['a', 1]])
  })

  it('refreshes an existing key to MRU position', () => {
    const m = new Map<string, number>([
      ['a', 1],
      ['b', 2],
      ['c', 3]
    ])
    lruTouch(m, 'a', 1, 3)
    expect([...m.keys()]).toEqual(['b', 'c', 'a'])
  })

  it('evicts the oldest entry when over the limit', () => {
    const m = new Map<string, number>()
    lruTouch(m, 'a', 1, 2)
    lruTouch(m, 'b', 2, 2)
    lruTouch(m, 'c', 3, 2) // should evict 'a'
    expect([...m.keys()]).toEqual(['b', 'c'])
    expect(m.size).toBe(2)
  })

  it('honors limit=1 (only keeps the most recent)', () => {
    const m = new Map<string, number>()
    lruTouch(m, 'a', 1, 1)
    lruTouch(m, 'b', 2, 1)
    expect([...m.keys()]).toEqual(['b'])
  })

  it('overwriting a key with a new value updates the value AND bumps to MRU', () => {
    const m = new Map<string, number>([
      ['a', 1],
      ['b', 2]
    ])
    lruTouch(m, 'a', 99, 3)
    expect(m.get('a')).toBe(99)
    expect([...m.keys()]).toEqual(['b', 'a'])
  })

  it('repeated insertion past limit caps the cache size', () => {
    const m = new Map<string, number>()
    for (let i = 0; i < 50; i++) lruTouch(m, `k${i}`, i, 2)
    expect(m.size).toBe(2)
    expect([...m.keys()]).toEqual(['k48', 'k49'])
  })
})

describe('lruGet', () => {
  it('returns the value for an existing key', () => {
    const m = new Map<string, number>([
      ['a', 1],
      ['b', 2]
    ])
    expect(lruGet(m, 'a')).toBe(1)
  })

  it('returns undefined for a missing key', () => {
    const m = new Map<string, number>()
    expect(lruGet(m, 'missing')).toBeUndefined()
  })

  it('bumps the read key to MRU', () => {
    const m = new Map<string, number>([
      ['a', 1],
      ['b', 2],
      ['c', 3]
    ])
    lruGet(m, 'a')
    expect([...m.keys()]).toEqual(['b', 'c', 'a'])
  })

  it('does not insert when the key is missing (no side effects)', () => {
    const m = new Map<string, number>([['a', 1]])
    lruGet(m, 'b')
    expect(m.size).toBe(1)
    expect(m.has('b')).toBe(false)
  })
})

describe('clearAllCaches / _assetCacheSize', () => {
  it('clearAllCaches resets the asset cache to size 0', () => {
    clearAllCaches()
    expect(_assetCacheSize()).toBe(0)
  })
})
