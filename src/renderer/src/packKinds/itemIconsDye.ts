import type { PixelBuffer } from '../utils/duotone'
import { parseHex } from '../utils/duotone'

// Six canonical dye colors that the Hybrasyl client substitutes at render
// time for the active player dye. Sourced from
// docs/plans/hybrasyl.client/item-icons-authoring-guide.md.
export const CANONICAL_DYE_HEX = [
  '#B393C7',
  '#9B7BB7',
  '#8F5BA3',
  '#7F3B93',
  '#47235F',
  '#37005B'
] as const

const CANONICAL_RGB = CANONICAL_DYE_HEX.map(parseHex)

export function isCanonicalDye(r: number, g: number, b: number): boolean {
  for (const rgb of CANONICAL_RGB) {
    if (rgb.r === r && rgb.g === g && rgb.b === b) return true
  }
  return false
}

// Heuristic for "looks purple but isn't in the canonical palette" — flags
// pixels that an author probably *meant* to dye but typed slightly off. Not
// authoritative; the runtime client is the source of truth.
function isNearPurple(r: number, g: number, b: number): boolean {
  if (g >= r || g >= b) return false
  const rb = Math.max(r, b)
  if (rb < 32) return false
  const ratio = Math.min(r, b) / rb
  return ratio > 0.5
}

export interface DyeUsageReport {
  canonicalPixels: number
  nonDyeablePurplePixels: number
  totalOpaquePixels: number
}

export function scanDyeUsage(buf: PixelBuffer): DyeUsageReport {
  let canonicalPixels = 0
  let nonDyeablePurplePixels = 0
  let totalOpaquePixels = 0
  const data = buf.data
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a === 0) continue
    totalOpaquePixels++
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (isCanonicalDye(r, g, b)) {
      canonicalPixels++
    } else if (isNearPurple(r, g, b)) {
      nonDyeablePurplePixels++
    }
  }
  return { canonicalPixels, nonDyeablePurplePixels, totalOpaquePixels }
}
