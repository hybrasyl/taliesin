import { PixelBuffer } from './duotone'

// ── Orthogonal vs isometric source detection ──────────────────────────────────
//
// A cell is "isometric" when its non-transparent content forms a diamond
// inscribed in the cell (transparent corner triangles) — it is already projected
// and only needs normalizing to target geometry. It is "orthogonal" when the
// cell is a filled square/rectangle (opaque corners) — it needs the ortho→iso
// projection (see tileConvert.ts).
//
// The discriminator is alpha coverage: compare the mean alpha of the four corner
// triangles (outside the inscribed diamond) against the mean alpha inside the
// diamond. Low corners + opaque diamond ⇒ isometric; opaque corners ⇒ orthogonal.
// Detection is a hint; the manager always offers a manual override.

export type Orientation = 'orthogonal' | 'isometric'

export interface OrientationResult {
  orientation: Orientation
  /** 0..1 — how strongly the evidence favours the reported orientation. */
  confidence: number
  /** Mean alpha (0..255) in the corner triangles outside the inscribed diamond. */
  cornerAlpha: number
  /** Mean alpha (0..255) inside the inscribed diamond. */
  diamondAlpha: number
}

export interface DetectOptions {
  /**
   * isoScore threshold above which a cell is called isometric. isoScore =
   * 1 − cornerAlpha/diamondAlpha (clamped 0..1). Default 0.5.
   */
  threshold?: number
}

/** True when (dx,dy) relative to the cell centre lies inside the inscribed diamond. */
function insideDiamond(x: number, y: number, halfW: number, halfH: number): boolean {
  const dx = Math.abs(x + 0.5 - halfW) / halfW
  const dy = Math.abs(y + 0.5 - halfH) / halfH
  return dx + dy <= 1
}

/**
 * Classify a source cell as already-isometric (diamond) or orthogonal (square).
 * Pure — reads only the pixel buffer.
 */
export function detectOrientation(buf: PixelBuffer, opts: DetectOptions = {}): OrientationResult {
  const threshold = opts.threshold ?? 0.5
  const { width, height, data } = buf
  const halfW = width / 2
  const halfH = height / 2

  let inSum = 0
  let inCount = 0
  let outSum = 0
  let outCount = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3]
      if (insideDiamond(x, y, halfW, halfH)) {
        inSum += a
        inCount++
      } else {
        outSum += a
        outCount++
      }
    }
  }

  const diamondAlpha = inCount > 0 ? inSum / inCount : 0
  const cornerAlpha = outCount > 0 ? outSum / outCount : 0

  // isoScore → 1 when corners are empty relative to an opaque diamond, → 0 when
  // corners are as opaque as the diamond (a filled square).
  const isoScore = diamondAlpha > 0 ? Math.max(0, Math.min(1, 1 - cornerAlpha / diamondAlpha)) : 0

  const orientation: Orientation = isoScore >= threshold ? 'isometric' : 'orthogonal'
  const confidence = orientation === 'isometric' ? isoScore : 1 - isoScore

  return { orientation, confidence, cornerAlpha, diamondAlpha }
}
