import { PaletteTable, TileAnimationTable, EffectTable } from '@eriscorp/dalib-ts'

/**
 * Typed reader for the `.tbl` text tables inside a Dark Ages archive.
 *
 * Four different formats share the `.tbl` extension, and three of them are
 * whitespace-separated integers, so no single structural test can tell them
 * apart: `1 5 2` is a valid line in a palette mapping table, a palette cycling
 * table and a tile animation table alike. Identification is therefore a ladder —
 * the entry name first, structure only as a fallback — and the rule that fired
 * is reported so a wrong answer is visible rather than silent. The Archive
 * Viewer already does this for palettes; this follows that precedent.
 *
 * Dye tables (`ColorTable`) are deliberately NOT handled here. They are
 * identified and rendered by `TextPreview`, which owns the existing
 * `tryParseColorTable` guard, and they arrive there by this module declining
 * them — never by being tested for first. A dye table cannot satisfy any
 * grammar below, because its `r,g,b` lines are not whitespace-separated
 * integers. Testing for a dye table ahead of this module would be worse than
 * redundant: a short `effect.tbl` opens with a low count line, which is exactly
 * what that header sniff accepts.
 */

/** Refuse to type-parse anything larger than this — it is not a real table. */
export const MAX_TBL_BYTES = 256 * 1024

/**
 * `PaletteTable.parseText` expands `min max palette` into one map entry per id
 * with no cap, so a single malformed line (`1 999999999 5`) allocates until the
 * heap dies. This is the same class of hazard `tryParseColorTable` guards, and
 * it has to be checked BEFORE the buffer reaches the parser.
 */
export const MAX_PALETTE_IDS = 262144

/** Cap the rows we materialise for display; `total` still reports the truth. */
export const MAX_TABLE_ROWS = 512

export type TblKind = 'palette-map' | 'palette-cycling' | 'tile-animation' | 'effect'

export interface PaletteMapRow {
  /** `range` covers min..max; the others are single ids. */
  kind: 'range' | 'override' | 'male' | 'female'
  start: number
  end: number
  palette: number
}

export interface CyclingRow {
  startIndex: number
  endIndex: number
  /** Number of 100 ms intervals between cycle steps. */
  period: number
}

export interface TileAnimationRow {
  tileSequence: number[]
  intervalMs: number
}

export interface EffectRow {
  /** Effect ids are 1-based: effect 1 is the first slot. */
  effectId: number
  frameSequence: number[]
}

interface Base {
  /** Plain-language statement of why this kind was chosen. */
  rule: string
  /** Total rows in the file, which can exceed the rows returned. */
  total: number
}

export type TypedTable =
  | (Base & { kind: 'palette-map'; rows: PaletteMapRow[] })
  | (Base & { kind: 'palette-cycling'; rows: CyclingRow[] })
  | (Base & { kind: 'tile-animation'; rows: TileAnimationRow[] })
  | (Base & { kind: 'effect'; rows: EffectRow[] })

/** Strip the directory and extension: `stcpal.tbl` → `stcpal`. */
function stem(entryName: string): string {
  const base = entryName.toLowerCase().split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  return dot === -1 ? base : base.slice(0, dot)
}

/**
 * Reject binary masquerading as text before any parser sees it. The table
 * formats are ASCII digits, spaces and newlines; a NUL or a stray control byte
 * means this is not one of them.
 */
function looksLikeText(buf: Uint8Array): boolean {
  const head = buf.subarray(0, 512)
  for (const byte of head) {
    if (byte === 9 || byte === 10 || byte === 13) continue
    if (byte < 32 || byte === 127) return false
  }
  return true
}

/** Non-empty, comment-free lines, as every one of these parsers reads them. */
function contentLines(text: string): string[] {
  const out: string[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const commentIdx = rawLine.indexOf('//')
    const line = (commentIdx === -1 ? rawLine : rawLine.slice(0, commentIdx)).trim()
    if (line) out.push(line)
  }
  return out
}

function tokensOf(line: string): string[] {
  return line.split(/\s+/)
}

function allIntegers(tokens: string[]): boolean {
  return tokens.length > 0 && tokens.every((t) => /^-?\d+$/.test(t))
}

/** Decide the kind from the entry name. Returns null when the name says nothing. */
function kindFromName(entryName: string): { kind: TblKind; rule: string } | null {
  const name = stem(entryName)
  if (name === 'effect') {
    return { kind: 'effect', rule: 'named effect.tbl' }
  }
  if (name.endsWith('ani')) {
    return { kind: 'tile-animation', rule: `named *ani.tbl (${name})` }
  }
  if (name.endsWith('pal')) {
    return { kind: 'palette-map', rule: `named *pal.tbl (${name})` }
  }
  // `mpt001.tbl`, `stc0006.tbl` — a numeric identifier marks a cycling file for
  // the palette family, which is how PaletteTable.fromArchive splits them.
  if (/^[a-z]+\d+$/.test(name)) {
    return { kind: 'palette-cycling', rule: `named <prefix><number>.tbl (${name})` }
  }
  return null
}

/** Decide the kind from the line shapes alone, for names off the convention. */
function kindFromStructure(lines: string[]): { kind: TblKind; rule: string } | null {
  if (lines.length === 0) return null

  const bodies = lines.map(tokensOf)
  if (!bodies.every(allIntegers)) return null

  // An effect table opens with a lone count line; nothing else does.
  if (bodies.length > 1 && bodies[0]!.length === 1) {
    return { kind: 'effect', rule: 'structure: a lone count line, then frame sequences' }
  }
  // Only an animation sequence runs past three numbers on a line.
  if (bodies.some((t) => t.length >= 4)) {
    return { kind: 'tile-animation', rule: 'structure: more than three numbers on a line' }
  }
  if (bodies.every((t) => t.length === 2 || t.length === 3)) {
    return { kind: 'palette-map', rule: 'structure: two or three numbers per line' }
  }
  return null
}

/**
 * Total ids a palette mapping table would expand to. Used as the pre-parse
 * guard; see MAX_PALETTE_IDS.
 */
function paletteIdCount(lines: string[]): number {
  let count = 0
  for (const line of lines) {
    const tokens = tokensOf(line)
    if (tokens.length < 2) continue
    const min = parseInt(tokens[0]!, 10)
    if (isNaN(min)) continue
    if (tokens.length === 2) {
      count += 1
      continue
    }
    const mid = parseInt(tokens[1]!, 10)
    const third = parseInt(tokens[2]!, 10)
    if (isNaN(mid) || isNaN(third)) continue
    // -1 and -2 are gendered single-id overrides, not ranges.
    count += third === -1 || third === -2 ? 1 : Math.max(0, mid - min + 1)
    if (count > MAX_PALETTE_IDS) return count
  }
  return count
}

/**
 * Read the rows of a palette mapping table.
 *
 * The rows come from `PaletteTable.toText()` rather than the original file:
 * dalib-ts keeps its four id maps `protected`, and round-tripping through its
 * own serialiser means the rows shown are the mapping the library actually
 * built, not a second opinion about the same bytes. Ranges are re-derived from
 * consecutive ids, so a file written as one range shows as one range.
 */
function readPaletteMap(text: string, lines: string[], rule: string): TypedTable | null {
  if (paletteIdCount(lines) > MAX_PALETTE_IDS) return null
  const table = PaletteTable.fromBuffer(new TextEncoder().encode(text))
  const emitted = contentLines(table.toText())
  const rows: PaletteMapRow[] = []
  for (const line of emitted) {
    const tokens = tokensOf(line)
    if (!allIntegers(tokens)) continue
    const a = parseInt(tokens[0]!, 10)
    const b = parseInt(tokens[1]!, 10)
    if (tokens.length === 2) {
      rows.push({ kind: 'override', start: a, end: a, palette: b })
    } else if (tokens.length >= 3) {
      const c = parseInt(tokens[2]!, 10)
      if (c === -1) rows.push({ kind: 'male', start: a, end: a, palette: b })
      else if (c === -2) rows.push({ kind: 'female', start: a, end: a, palette: b })
      else rows.push({ kind: 'range', start: a, end: b, palette: c })
    }
  }
  if (rows.length === 0) return null
  return {
    kind: 'palette-map',
    rule,
    total: rows.length,
    rows: rows.slice(0, MAX_TABLE_ROWS)
  }
}

/**
 * Read a palette cycling table.
 *
 * dalib-ts parses this format only inside `PaletteTable.fromArchive`, which
 * merges a whole family of files and keys them by the name's number — there is
 * no public entry point for one entry's bytes. The grammar it applies is three
 * integers per line, reproduced here for a single-entry preview. Recorded as a
 * dalib-ts follow-up in docs/plans/00a-backlog.md.
 */
function readPaletteCycling(lines: string[], rule: string): TypedTable | null {
  const rows: CyclingRow[] = []
  for (const line of lines) {
    const tokens = line.split(' ')
    if (tokens.length !== 3) continue
    const startIndex = parseInt(tokens[0]!, 10)
    const endIndex = parseInt(tokens[1]!, 10)
    const period = parseInt(tokens[2]!, 10)
    if (isNaN(startIndex) || isNaN(endIndex) || isNaN(period)) continue
    rows.push({ startIndex, endIndex, period })
  }
  if (rows.length === 0) return null
  return {
    kind: 'palette-cycling',
    rule,
    total: rows.length,
    rows: rows.slice(0, MAX_TABLE_ROWS)
  }
}

/**
 * Read a tile animation table.
 *
 * `TileAnimationTable` indexes one entry under every tile id in its sequence,
 * and keeps that map private, so the rows come from `toText()` — which already
 * de-duplicates back to one line per distinct animation.
 */
function readTileAnimation(text: string, rule: string): TypedTable | null {
  const table = TileAnimationTable.fromBuffer(new TextEncoder().encode(text))
  const rows: TileAnimationRow[] = []
  for (const line of contentLines(table.toText())) {
    const tokens = tokensOf(line)
    if (tokens.length < 2 || !allIntegers(tokens)) continue
    const values = tokens.map((t) => parseInt(t, 10))
    const intervalHundredths = values.pop()!
    rows.push({ tileSequence: values, intervalMs: intervalHundredths * 100 })
  }
  if (rows.length === 0) return null
  return {
    kind: 'tile-animation',
    rule,
    total: rows.length,
    rows: rows.slice(0, MAX_TABLE_ROWS)
  }
}

/**
 * Read an effect table. `EffectTable` enumerates cleanly via count + id.
 *
 * The single trailing line terminator is stripped first: the parser turns every
 * blank line into an empty effect slot, and a file that simply ends with a
 * newline would otherwise report one more effect than its own count line says.
 * Blank lines in the middle are real empty slots and are left alone.
 */
function readEffect(text: string, rule: string): TypedTable | null {
  const trimmed = text.replace(/\r?\n$/, '')
  const table = EffectTable.fromBuffer(new TextEncoder().encode(trimmed))
  if (table.count === 0) return null
  const rows: EffectRow[] = []
  const shown = Math.min(table.count, MAX_TABLE_ROWS)
  for (let effectId = 1; effectId <= shown; effectId++) {
    const entry = table.tryGetEntry(effectId)
    rows.push({ effectId, frameSequence: entry ? [...entry.frameSequence] : [] })
  }
  return { kind: 'effect', rule, total: table.count, rows }
}

/**
 * Identify and read a `.tbl` entry, or return null to leave it to the text view.
 *
 * Null means "this is not one of the typed tables, or it is not safe to parse" —
 * both cases fall back to plain text rather than showing a confident wrong
 * answer.
 */
export function readTypedTable(entryName: string, buf: Uint8Array): TypedTable | null {
  if (buf.length === 0 || buf.length > MAX_TBL_BYTES) return null
  if (!looksLikeText(buf)) return null

  const text = new TextDecoder('utf-8', { fatal: false }).decode(buf)
  const lines = contentLines(text)
  if (lines.length === 0) return null

  const named = kindFromName(entryName)
  const decided = named ?? kindFromStructure(lines)
  if (!decided) return null

  try {
    switch (decided.kind) {
      case 'palette-map':
        return readPaletteMap(text, lines, decided.rule)
      case 'palette-cycling':
        return readPaletteCycling(lines, decided.rule)
      case 'tile-animation':
        return readTileAnimation(text, decided.rule)
      case 'effect':
        return readEffect(text, decided.rule)
    }
  } catch {
    // A parser that throws on these bytes is a "not this kind" answer.
    return null
  }
}

/** Human-readable name for each kind, used as the view's heading. */
export const TBL_KIND_LABELS: Record<TblKind, string> = {
  'palette-map': 'Palette table',
  'palette-cycling': 'Palette cycling table',
  'tile-animation': 'Tile animation table',
  effect: 'Effect table'
}
