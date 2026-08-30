import { PixelBuffer } from './duotone'

// ── Source colour adjustments (Static Tile Manager) ───────────────────────────
//
// Applied to the SOURCE before conversion, so previews, single commits and the
// batch paths all see the same pixels. Alpha is never touched — positioning
// rules (trim, blank rows, the wall slant mask) read alpha, and a colour
// adjustment must not move a tile.

export interface Adjustments {
  /** Added to every channel after contrast. -100..100, 0 = unchanged. */
  brightness: number
  /** Contrast around mid-grey. -100..100, 0 = unchanged. */
  contrast: number
  /** Input level remapped to 0. 0..254, 0 = unchanged. */
  blackPoint: number
}

export const DEFAULT_ADJUSTMENTS: Adjustments = { brightness: 0, contrast: 0, blackPoint: 0 }

export function isIdentityAdjustments(adj: Adjustments): boolean {
  return adj.brightness === 0 && adj.contrast === 0 && adj.blackPoint === 0
}

/**
 * The 256-entry channel map for an adjustment set.
 *
 * Order: black point, then contrast, then brightness. The black point is a
 * levels remap — everything at or below it becomes 0 and the rest stretches
 * back to 0..255 — so it deepens shadows without dimming the highlights the
 * way negative brightness would. Contrast uses the standard correction-factor
 * curve around mid-grey.
 */
export function buildAdjustmentLut(adj: Adjustments): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256)
  const bp = Math.min(254, Math.max(0, Math.round(adj.blackPoint)))
  const c = Math.min(100, Math.max(-100, adj.contrast))
  const factor = (259 * (c * 2.55 + 255)) / (255 * (259 - c * 2.55))
  const b = Math.min(100, Math.max(-100, adj.brightness)) * 2.55
  for (let v = 0; v < 256; v++) {
    let x = ((v - bp) * 255) / (255 - bp)
    x = factor * (x - 128) + 128
    x += b
    lut[v] = x // Uint8ClampedArray clamps to 0..255
  }
  return lut
}

/**
 * Apply an adjustment set to a buffer. Identity returns the input unchanged
 * (same reference), so callers can hang memoization off it.
 */
export function applyAdjustments(src: PixelBuffer, adj: Adjustments): PixelBuffer {
  if (isIdentityAdjustments(adj)) return src
  const lut = buildAdjustmentLut(adj)
  const data = new Uint8ClampedArray(src.data.length)
  for (let i = 0; i < src.data.length; i += 4) {
    data[i] = lut[src.data[i]]
    data[i + 1] = lut[src.data[i + 1]]
    data[i + 2] = lut[src.data[i + 2]]
    data[i + 3] = src.data[i + 3]
  }
  return { data, width: src.width, height: src.height }
}
