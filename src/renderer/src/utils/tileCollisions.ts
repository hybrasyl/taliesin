import { escapeXml as esc, attr, parseXmlDocument, HYBRASYL_NS } from './xmlUtils'

/**
 * The `TileCollisions` world table (HXML-41, HTOO-611): walkability for each
 * static tile id, as the server reads it. It replaces the server's embedded
 * copy of `sotp.dat` (HS-1630 level 2).
 *
 * This module is built to the shape that HXML-41 gives, before the XSD exists
 * on xml `main`:
 *
 * ```xml
 * <TileCollisions>
 *   <Range Start="13" End="9999" Block="All" />
 *   <Tile Id="21000" Block="Up Down" />
 * </TileCollisions>
 * ```
 *
 * - The value is the collision nibble of the sotp byte only. The blend bits
 *   (0xF0) are client render state, and they stay in the pack.
 * - `Block` is a flags list: Left 0x01, Down 0x02, Right 0x04, Up 0x08, and
 *   All 0x0F.
 * - Ids are `ushort`. An id is the static tile id, which is 1-based: the server
 *   reads `Collisions[id - 1]`, and `SotpFile.getCollision(id)` does the same.
 * - A `Tile` overrides a `Range` that holds the same id. Two `Range` entries that
 *   overlap with different values are an error.
 * - An id with no entry is walkable (HS-1630 level 4), so 0 is never written.
 *
 * Guesses to confirm when HXML-41 merges on xml `main`, because the card does
 * not say:
 * - The root element has no attributes other than the namespace.
 * - All `Range` entries come before all `Tile` entries. That order is valid for
 *   an `xs:sequence` of the two lists and for an `xs:choice`.
 * - The flag names in one `Block` value are written from the high bit down
 *   ("Up Down"), as in the card's example.
 * - An empty `Block` reads as 0. Nothing here writes one.
 */

export const BLOCK_LEFT = 0x01
export const BLOCK_DOWN = 0x02
export const BLOCK_RIGHT = 0x04
export const BLOCK_UP = 0x08
export const BLOCK_ALL = 0x0f

/** The direction flags, high bit first: the order `blockToString` writes. */
const DIRECTIONS: readonly [string, number][] = [
  ['Up', BLOCK_UP],
  ['Right', BLOCK_RIGHT],
  ['Down', BLOCK_DOWN],
  ['Left', BLOCK_LEFT]
]

export const MAX_TILE_ID = 0xffff

export type TileCollisionEntry =
  | { kind: 'range'; start: number; end: number; block: number }
  | { kind: 'tile'; id: number; block: number }

/** Write a collision nibble as a `Block` value. 0 has no value: it is not written. */
export function blockToString(nibble: number): string {
  if (!Number.isInteger(nibble) || nibble < 1 || nibble > BLOCK_ALL) {
    throw new Error(`Block must be a collision nibble from 1 to 15, not ${nibble}`)
  }
  if (nibble === BLOCK_ALL) return 'All'
  return DIRECTIONS.filter(([, bit]) => nibble & bit)
    .map(([name]) => name)
    .join(' ')
}

/** Read a `Block` value. An unknown flag name is an error. */
export function parseBlock(value: string): number {
  let nibble = 0
  for (const token of value.split(/\s+/).filter(Boolean)) {
    if (token === 'All') {
      nibble |= BLOCK_ALL
      continue
    }
    const hit = DIRECTIONS.find(([name]) => name === token)
    if (!hit) throw new Error(`Unknown Block flag "${token}"`)
    nibble |= hit[1]
  }
  return nibble
}

/**
 * Compress a collision table into entries. A run of two or more adjacent ids
 * with the same nonzero nibble is one `Range`; a single id is one `Tile`. A
 * walkable id (nibble 0) has no entry.
 */
export function compressCollisions(
  nibbleOf: (id: number) => number,
  maxId: number
): TileCollisionEntry[] {
  if (!Number.isInteger(maxId) || maxId < 0 || maxId > MAX_TILE_ID) {
    throw new Error(`maxId must be from 0 to ${MAX_TILE_ID}, not ${maxId}`)
  }
  const entries: TileCollisionEntry[] = []
  let id = 1
  while (id <= maxId) {
    const block = nibbleOf(id) & BLOCK_ALL
    if (block === 0) {
      id++
      continue
    }
    let end = id
    while (end + 1 <= maxId && (nibbleOf(end + 1) & BLOCK_ALL) === block) end++
    entries.push(end > id ? { kind: 'range', start: id, end, block } : { kind: 'tile', id, block })
    id = end + 1
  }
  return entries
}

/** The part of dalib-ts `SotpFile` that the seed reads. */
export interface SotpLike {
  readonly maxTileId: number
  getCollision(tileId: number): number
}

/**
 * Seed the table from `sotp.dat` (HTOO-611). The blend bits are dropped:
 * `getCollision` returns the low nibble only.
 */
export function collisionsFromSotp(sotp: SotpLike): TileCollisionEntry[] {
  return compressCollisions((id) => sotp.getCollision(id), Math.min(sotp.maxTileId, MAX_TILE_ID))
}

/** Put the `Range` entries first, then the `Tile` entries, each by id. */
function ordered(entries: TileCollisionEntry[]): TileCollisionEntry[] {
  const key = (e: TileCollisionEntry): number => (e.kind === 'range' ? e.start : e.id)
  const ranges = entries.filter((e) => e.kind === 'range').sort((a, b) => key(a) - key(b))
  const tiles = entries.filter((e) => e.kind === 'tile').sort((a, b) => key(a) - key(b))
  return [...ranges, ...tiles]
}

/**
 * Write the table. `note`, if given, goes in a comment under the root, for
 * example where the table was seeded from.
 */
export function serializeTileCollisionsXml(entries: TileCollisionEntry[], note?: string): string {
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<TileCollisions xmlns="${HYBRASYL_NS}">`
  ]
  if (note?.trim()) lines.push(`  <!-- ${note.trim().replace(/--/g, '- -')} -->`)
  for (const e of ordered(entries)) {
    const block = esc(blockToString(e.block))
    lines.push(
      e.kind === 'range'
        ? `  <Range Start="${e.start}" End="${e.end}" Block="${block}" />`
        : `  <Tile Id="${e.id}" Block="${block}" />`
    )
  }
  lines.push('</TileCollisions>')
  return lines.join('\n') + '\n'
}

function readId(el: Element, name: string): number {
  const raw = attr(el, name)
  const n = Number(raw)
  if (raw.trim() === '' || !Number.isInteger(n)) {
    throw new Error(`<${el.tagName}> ${name}="${raw}" is not a whole number`)
  }
  return n
}

/** Read a table. The checks of `validateTileCollisions` are not applied here. */
export function parseTileCollisionsXml(xml: string): TileCollisionEntry[] {
  const root = parseXmlDocument(xml).documentElement
  if (root.tagName !== 'TileCollisions') {
    throw new Error(`Expected a <TileCollisions> root, not <${root.tagName}>`)
  }
  const entries: TileCollisionEntry[] = []
  for (const el of Array.from(root.children)) {
    const block = parseBlock(attr(el, 'Block'))
    if (el.tagName === 'Range') {
      entries.push({ kind: 'range', start: readId(el, 'Start'), end: readId(el, 'End'), block })
    } else if (el.tagName === 'Tile') {
      entries.push({ kind: 'tile', id: readId(el, 'Id'), block })
    } else {
      throw new Error(`Unexpected <${el.tagName}> in <TileCollisions>`)
    }
  }
  return entries
}

/**
 * Check the table against the HXML-41 rules. Returns one message for each
 * fault; an empty list means the table is valid.
 */
export function validateTileCollisions(entries: TileCollisionEntry[]): string[] {
  const errors: string[] = []
  const isId = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= MAX_TILE_ID
  for (const e of entries) {
    if (!Number.isInteger(e.block) || e.block < 1 || e.block > BLOCK_ALL) {
      errors.push(`${describe(e)}: Block must be a collision nibble from 1 to 15`)
    }
    if (e.kind === 'range') {
      if (!isId(e.start) || !isId(e.end)) errors.push(`${describe(e)}: an id is not a ushort`)
      else if (e.start > e.end) errors.push(`${describe(e)}: Start is after End`)
    } else if (!isId(e.id)) {
      errors.push(`${describe(e)}: Id is not a ushort`)
    }
  }
  const ranges = entries
    .filter((e): e is Extract<TileCollisionEntry, { kind: 'range' }> => e.kind === 'range')
    .sort((a, b) => a.start - b.start)
  // After the sort, an overlap with any earlier range is also an overlap with
  // the earlier range that reaches furthest.
  let reach: (typeof ranges)[number] | null = null
  for (const r of ranges) {
    if (reach && r.start <= reach.end && r.block !== reach.block) {
      errors.push(`${describe(r)} overlaps ${describe(reach)} with a different Block`)
    }
    if (!reach || r.end > reach.end) reach = r
  }
  const tiles = new Map<number, number>()
  for (const e of entries) {
    if (e.kind !== 'tile') continue
    const prev = tiles.get(e.id)
    if (prev !== undefined && prev !== e.block) {
      errors.push(`Tile ${e.id} is given two different Block values`)
    }
    tiles.set(e.id, e.block)
  }
  return errors
}

function describe(e: TileCollisionEntry): string {
  return e.kind === 'range' ? `Range ${e.start}-${e.end}` : `Tile ${e.id}`
}

/**
 * The collision nibble for one id, by the HXML-41 overlap rule: a `Tile` wins
 * over a `Range`, and an id with no entry is walkable (0).
 */
export function lookupCollision(entries: TileCollisionEntry[], id: number): number {
  let fromRange = 0
  for (const e of entries) {
    if (e.kind === 'tile' && e.id === id) return e.block
    if (e.kind === 'range' && id >= e.start && id <= e.end) fromRange = e.block
  }
  return fromRange
}
