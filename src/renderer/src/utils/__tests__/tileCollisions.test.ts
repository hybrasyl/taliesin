import { describe, it, expect } from 'vitest'
import { SotpFile } from '@eriscorp/dalib-ts'
import {
  BLOCK_ALL,
  BLOCK_DOWN,
  BLOCK_LEFT,
  BLOCK_UP,
  blockToString,
  collisionsFromSotp,
  compressCollisions,
  lookupCollision,
  parseBlock,
  parseTileCollisionsXml,
  serializeTileCollisionsXml,
  validateTileCollisions,
  type TileCollisionEntry
} from '../tileCollisions'
import { HYBRASYL_NS } from '../xmlUtils'

/** The TileCollisions world table, to the HXML-41 shape (HTOO-611). */

/** A sotp.dat whose byte for tile `id` is `bytes[id - 1]`. */
function sotpOf(bytes: number[]): SotpFile {
  return new SotpFile(Uint8Array.from(bytes))
}

describe('Block values', () => {
  it('writes All for 0x0F and the direction names high bit first', () => {
    expect(blockToString(BLOCK_ALL)).toBe('All')
    expect(blockToString(BLOCK_UP | BLOCK_DOWN)).toBe('Up Down')
    expect(blockToString(BLOCK_LEFT)).toBe('Left')
  })

  it('refuses 0 and values outside the nibble', () => {
    expect(() => blockToString(0)).toThrow()
    expect(() => blockToString(0x10)).toThrow()
  })

  it('reads every value it writes', () => {
    for (let n = 1; n <= 15; n++) expect(parseBlock(blockToString(n))).toBe(n)
  })

  it('reads the card example, and refuses an unknown flag', () => {
    expect(parseBlock('Up Down')).toBe(BLOCK_UP | BLOCK_DOWN)
    expect(parseBlock('All')).toBe(BLOCK_ALL)
    expect(() => parseBlock('Sideways')).toThrow(/Sideways/)
  })
})

describe('compressCollisions', () => {
  it('makes a Range for a run, a Tile for a single id, and skips walkable ids', () => {
    const table = [0, 15, 15, 15, 0, 10, 15, 15]
    expect(compressCollisions((id) => table[id - 1] ?? 0, table.length)).toEqual([
      { kind: 'range', start: 2, end: 4, block: 15 },
      { kind: 'tile', id: 6, block: 10 },
      { kind: 'range', start: 7, end: 8, block: 15 }
    ])
  })

  it('splits a run where the nibble changes', () => {
    const table = [15, 15, 8, 8]
    expect(compressCollisions((id) => table[id - 1]!, 4)).toEqual([
      { kind: 'range', start: 1, end: 2, block: 15 },
      { kind: 'range', start: 3, end: 4, block: 8 }
    ])
  })
})

describe('collisionsFromSotp', () => {
  it('reads tile N from sotp[N - 1] and drops the blend bits', () => {
    // tile 1 = 0x0F, tile 2 = 0x8F (blocked + blend), tile 3 = 0x80 (open + blend)
    const entries = collisionsFromSotp(sotpOf([0x0f, 0x8f, 0x80, 0x00, 0x0f]))
    expect(entries).toEqual([
      { kind: 'range', start: 1, end: 2, block: 15 },
      { kind: 'tile', id: 5, block: 15 }
    ])
  })

  it('round-trips: every id reads back as sotp.getCollision(id)', () => {
    // The four values of the shipped file, in an uneven pattern, plus two
    // direction-only values that the shipped file does not use.
    const values = [0x00, 0x0f, 0x80, 0x8f, 0x0a, 0x01]
    const bytes = Array.from(
      { length: 4000 },
      (_, i) => values[(i * 7 + (i >> 5)) % values.length]!
    )
    for (let i = 1000; i < 2500; i++) bytes[i] = 0x0f
    const sotp = sotpOf(bytes)
    const xml = serializeTileCollisionsXml(collisionsFromSotp(sotp))
    const back = parseTileCollisionsXml(xml)
    expect(validateTileCollisions(back)).toEqual([])
    for (let id = 1; id <= sotp.maxTileId + 2; id++) {
      expect(lookupCollision(back, id)).toBe(sotp.getCollision(id))
    }
  })
})

describe('serializeTileCollisionsXml', () => {
  const entries: TileCollisionEntry[] = [
    { kind: 'tile', id: 21000, block: BLOCK_UP | BLOCK_DOWN },
    { kind: 'range', start: 13, end: 9999, block: BLOCK_ALL }
  ]

  it('writes the HXML-41 shape, ranges first, in the Hybrasyl namespace', () => {
    expect(serializeTileCollisionsXml(entries)).toBe(
      [
        '<?xml version="1.0" encoding="utf-8"?>',
        `<TileCollisions xmlns="${HYBRASYL_NS}">`,
        '  <Range Start="13" End="9999" Block="All" />',
        '  <Tile Id="21000" Block="Up Down" />',
        '</TileCollisions>',
        ''
      ].join('\n')
    )
  })

  it('writes a note as a safe comment', () => {
    const xml = serializeTileCollisionsXml([], 'Seeded -- from sotp.dat')
    expect(xml).toContain('<!-- Seeded - - from sotp.dat -->')
    expect(parseTileCollisionsXml(xml)).toEqual([])
  })
})

describe('parseTileCollisionsXml', () => {
  it('reads the card example', () => {
    const xml = `<TileCollisions xmlns="${HYBRASYL_NS}">
      <Range Start="13" End="9999" Block="All" />
      <Tile Id="21000" Block="Up Down" />
    </TileCollisions>`
    expect(parseTileCollisionsXml(xml)).toEqual([
      { kind: 'range', start: 13, end: 9999, block: BLOCK_ALL },
      { kind: 'tile', id: 21000, block: BLOCK_UP | BLOCK_DOWN }
    ])
  })

  it('refuses another root, an unknown child and a bad id', () => {
    expect(() => parseTileCollisionsXml('<Map />')).toThrow(/TileCollisions/)
    expect(() =>
      parseTileCollisionsXml('<TileCollisions><Cell Id="1" Block="All" /></TileCollisions>')
    ).toThrow(/Cell/)
    expect(() =>
      parseTileCollisionsXml('<TileCollisions><Tile Id="x" Block="All" /></TileCollisions>')
    ).toThrow(/whole number/)
  })
})

describe('the overlap rule', () => {
  it('lets a Tile override the Range that holds its id', () => {
    const entries: TileCollisionEntry[] = [
      { kind: 'range', start: 10, end: 20, block: BLOCK_ALL },
      { kind: 'tile', id: 15, block: BLOCK_UP }
    ]
    expect(validateTileCollisions(entries)).toEqual([])
    expect(lookupCollision(entries, 15)).toBe(BLOCK_UP)
    expect(lookupCollision(entries, 14)).toBe(BLOCK_ALL)
    expect(lookupCollision(entries, 21)).toBe(0)
  })

  it('refuses two ranges that overlap with different values', () => {
    const errors = validateTileCollisions([
      { kind: 'range', start: 1, end: 100, block: BLOCK_ALL },
      { kind: 'range', start: 200, end: 300, block: BLOCK_ALL },
      { kind: 'range', start: 50, end: 60, block: BLOCK_UP }
    ])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/Range 50-60 overlaps Range 1-100/)
  })

  it('accepts two ranges that overlap with the same value', () => {
    expect(
      validateTileCollisions([
        { kind: 'range', start: 1, end: 100, block: BLOCK_ALL },
        { kind: 'range', start: 50, end: 150, block: BLOCK_ALL }
      ])
    ).toEqual([])
  })

  it('refuses ids outside ushort, a reversed range, a zero Block and a Tile given twice', () => {
    const errors = validateTileCollisions([
      { kind: 'tile', id: 70000, block: BLOCK_ALL },
      { kind: 'range', start: 9, end: 3, block: BLOCK_ALL },
      { kind: 'tile', id: 5, block: 0 },
      { kind: 'tile', id: 6, block: BLOCK_UP },
      { kind: 'tile', id: 6, block: BLOCK_DOWN }
    ])
    expect(errors).toHaveLength(4)
  })
})
