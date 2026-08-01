import { createContext, useContext } from 'react'
import type { LftFile } from '@eriscorp/dalib-ts'

/**
 * The open LFT font, shared with the grid and the inspector.
 *
 * A context rather than a prop, and deliberately so: `LftFile` holds
 * `bitmapData`, a multi-megabyte `Uint8Array`, and React 19.2's dev build walks
 * any prop whose identity changed with `for...in`, emitting one row per byte.
 * That is the same hazard `archiveStore.ts` documents for `DataArchive`, and the
 * same answer — the children take primitives (a key, a page) and read the font
 * from here. See docs/plans/complete/archive-preview-dev-oom.md.
 */
export interface LftFontValue {
  font: LftFile
  /**
   * Keys whose glyph actually has a bitmap. Most of the 65,535 records are
   * empty, so this is the list worth browsing.
   */
  populatedKeys: number[]
}

const LftFontContext = createContext<LftFontValue | null>(null)

export const LftFontProvider = LftFontContext.Provider

export function useLftFont(): LftFontValue {
  const value = useContext(LftFontContext)
  if (!value) throw new Error('useLftFont must be used inside an LftPreview')
  return value
}

/**
 * How a key would be read as text.
 *
 * Keys are raw byte values, not Unicode: a single ANSI byte, or a DBCS pair
 * assembled as `(lead << 8) | trail`. What a key means therefore depends on the
 * code page the client had selected, which is why the browser labels glyphs by
 * key and never by character name.
 */
export function describeKey(key: number): string {
  const hex = `0x${key.toString(16).toUpperCase().padStart(4, '0')}`
  if (key <= 0xff) {
    return `${hex} · single byte, read under the client's ANSI code page (Windows-1252 on the Western client)`
  }
  const lead = (key >> 8) & 0xff
  const trail = key & 0xff
  return `${hex} · DBCS pair ${lead.toString(16).toUpperCase().padStart(2, '0')} ${trail
    .toString(16)
    .toUpperCase()
    .padStart(2, '0')}, read under code page 949 (EUC-KR)`
}

/** Short form for a grid cell label. */
export function shortKey(key: number): string {
  return `0x${key
    .toString(16)
    .toUpperCase()
    .padStart(key <= 0xff ? 2 : 4, '0')}`
}
