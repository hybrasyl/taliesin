import { describe, it, expect } from 'vitest'
import { readTypedTable, MAX_TBL_BYTES } from '../tblTables'

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text)

describe('readTypedTable — palette mapping tables', () => {
  it('reads ranges, single overrides and gendered overrides', () => {
    const table = readTypedTable('stcpal.tbl', bytes('2 10 5\n20 7\n30 4 -1\n31 6 -2\n'))
    expect(table?.kind).toBe('palette-map')
    expect(table?.rule).toContain('named *pal.tbl')
    if (table?.kind !== 'palette-map') throw new Error('wrong kind')
    expect(table.rows).toEqual([
      { kind: 'range', start: 2, end: 10, palette: 5 },
      { kind: 'override', start: 20, end: 20, palette: 7 },
      { kind: 'male', start: 30, end: 30, palette: 4 },
      { kind: 'female', start: 31, end: 31, palette: 6 }
    ])
  })

  it('ignores blank lines and // comments, as the client parser does', () => {
    const table = readTypedTable('mptpal.tbl', bytes('// header\n\n2 4 9\n'))
    expect(table?.kind).toBe('palette-map')
    expect(table?.total).toBe(1)
  })

  it('refuses a range wide enough to exhaust the heap', () => {
    // PaletteTable.parseText expands min..max into one map entry per id with no
    // cap. This line would allocate a billion entries; the guard must reject it
    // before the parser sees it.
    expect(readTypedTable('stcpal.tbl', bytes('1 999999999 5\n'))).toBeNull()
  })
})

describe('readTypedTable — palette cycling tables', () => {
  it('reads the three-number cycling grammar from a numbered entry name', () => {
    const table = readTypedTable('mpt001.tbl', bytes('0 5 2\n10 15 4\n'))
    expect(table?.kind).toBe('palette-cycling')
    expect(table?.rule).toContain('mpt001')
    if (table?.kind !== 'palette-cycling') throw new Error('wrong kind')
    expect(table.rows).toEqual([
      { startIndex: 0, endIndex: 5, period: 2 },
      { startIndex: 10, endIndex: 15, period: 4 }
    ])
  })
})

describe('readTypedTable — tile animation tables', () => {
  it('reads each distinct sequence once, with its interval in milliseconds', () => {
    const table = readTypedTable('gndani.tbl', bytes('1 2 3 5\n10 11 3\n'))
    expect(table?.kind).toBe('tile-animation')
    if (table?.kind !== 'tile-animation') throw new Error('wrong kind')
    expect(table.rows).toEqual([
      { tileSequence: [1, 2, 3], intervalMs: 500 },
      { tileSequence: [10, 11], intervalMs: 300 }
    ])
  })
})

describe('readTypedTable — effect tables', () => {
  it('reads one row per 1-based effect slot', () => {
    const table = readTypedTable('effect.tbl', bytes('2\n1 2 3\n4 5\n'))
    expect(table?.kind).toBe('effect')
    if (table?.kind !== 'effect') throw new Error('wrong kind')
    expect(table.rows).toEqual([
      { effectId: 1, frameSequence: [1, 2, 3] },
      { effectId: 2, frameSequence: [4, 5] }
    ])
  })

  it('keeps a blank middle line as an empty slot', () => {
    const table = readTypedTable('effect.tbl', bytes('3\n1 2\n\n7\n'))
    if (table?.kind !== 'effect') throw new Error('wrong kind')
    expect(table.total).toBe(3)
    expect(table.rows[1]).toEqual({ effectId: 2, frameSequence: [] })
  })
})

describe('readTypedTable — identification by structure', () => {
  it('reads an off-convention name with a count line as an effect table', () => {
    const table = readTypedTable('unusual.tbl', bytes('2\n1 2\n3 4\n'))
    expect(table?.kind).toBe('effect')
    expect(table?.rule).toContain('structure')
  })

  it('reads more than three numbers on a line as an animation table', () => {
    const table = readTypedTable('unusual.tbl', bytes('1 2 3 4 5\n'))
    expect(table?.kind).toBe('tile-animation')
    expect(table?.rule).toContain('structure')
  })

  it('reads two-and-three-number lines as a palette table', () => {
    const table = readTypedTable('unusual.tbl', bytes('2 10 5\n20 7\n'))
    expect(table?.kind).toBe('palette-map')
    expect(table?.rule).toContain('structure')
  })
})

describe('readTypedTable — guards and fallbacks', () => {
  it('refuses an entry larger than the cap', () => {
    const big = new Uint8Array(MAX_TBL_BYTES + 1).fill(0x31)
    expect(readTypedTable('stcpal.tbl', big)).toBeNull()
  })

  it('refuses binary content that happens to be named like a table', () => {
    expect(readTypedTable('stcpal.tbl', new Uint8Array([0x00, 0x01, 0x02, 0xff]))).toBeNull()
  })

  it('refuses an empty entry', () => {
    expect(readTypedTable('stcpal.tbl', new Uint8Array())).toBeNull()
  })

  it('leaves a dye table alone — its rows are not this module’s grammar', () => {
    // color0.tbl matches the <prefix><number> cycling name rule, so the reader
    // has to fall through on content rather than on name. This is the whole
    // mechanism by which a dye table reaches TextPreview — nothing tests for
    // one ahead of this module. See the header comment in tblTables.ts.
    const dye = bytes('6\n0\n255,255,255\n0,0,0\n0,0,0\n0,0,0\n0,0,0\n0,0,0\n')
    expect(readTypedTable('color0.tbl', dye)).toBeNull()
  })

  it('falls back on prose that is not a table at all', () => {
    expect(readTypedTable('readme.tbl', bytes('this is not a table\n'))).toBeNull()
  })
})
