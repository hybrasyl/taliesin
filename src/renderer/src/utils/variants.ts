import { applyDuotone, luminance, PixelBuffer } from './duotone'
import { DuotoneParams, PaletteEntry, VariantDef } from './paletteTypes'

export const DEFAULT_VARIANTS: VariantDef[] = [
  {
    id: 'simple',
    label: 'Simple',
    darkFactor: 0.0,
    lightFactor: 0.0,
    midpointLow: 0.25,
    midpointHigh: 0.75
  },
  {
    id: 'subtle',
    label: 'Subtle',
    darkFactor: 0.2,
    lightFactor: 0.2,
    midpointLow: 0.25,
    midpointHigh: 0.75
  },
  {
    id: 'balanced',
    label: 'Balanced',
    darkFactor: 0.3,
    lightFactor: 0.3,
    midpointLow: 0.25,
    midpointHigh: 0.75
  },
  {
    id: 'strong',
    label: 'Strong',
    darkFactor: 0.5,
    lightFactor: 0.5,
    midpointLow: 0.25,
    midpointHigh: 0.75
  },
  {
    id: 'deep-shadow',
    label: 'Deep Shadow',
    darkFactor: 0.5,
    lightFactor: 0.2,
    midpointLow: 0.25,
    midpointHigh: 0.75
  },
  {
    id: 'bright',
    label: 'Bright',
    darkFactor: 0.2,
    lightFactor: 0.5,
    midpointLow: 0.25,
    midpointHigh: 0.75
  },
  {
    id: 'compressed',
    label: 'Compressed',
    darkFactor: 0.3,
    lightFactor: 0.3,
    midpointLow: 0.35,
    midpointHigh: 0.65
  },
  {
    id: 'expanded',
    label: 'Expanded',
    darkFactor: 0.3,
    lightFactor: 0.3,
    midpointLow: 0.15,
    midpointHigh: 0.85
  }
]

export function variantToParams(v: VariantDef): DuotoneParams {
  return {
    darkFactor: v.darkFactor,
    lightFactor: v.lightFactor,
    midpointLow: v.midpointLow,
    midpointHigh: v.midpointHigh
  }
}

export function luminanceHistogram(buf: PixelBuffer): number[] {
  const hist = new Array(256).fill(0)
  let counted = 0
  for (let i = 0; i < buf.data.length; i += 4) {
    if (buf.data[i + 3] === 0) continue
    const lum = luminance(buf.data[i], buf.data[i + 1], buf.data[i + 2])
    const bin = Math.min(255, Math.max(0, Math.round(lum * 255)))
    hist[bin] += 1
    counted += 1
  }
  if (counted === 0) return hist
  for (let i = 0; i < 256; i++) hist[i] /= counted
  return hist
}

function percentileFromHistogram(hist: number[], p: number): number {
  let cumulative = 0
  for (let i = 0; i < 256; i++) {
    cumulative += hist[i]
    if (cumulative >= p) return i / 255
  }
  return 1
}

export interface VariantScore {
  rangePreservation: number
  contrast: number
  midtonePresence: number
  total: number
}

export function scoreVariant(
  sourceHist: number[],
  outputHist: number[],
  midpointLow: number,
  midpointHigh: number
): VariantScore {
  let absDiffSum = 0
  for (let i = 0; i < 256; i++) absDiffSum += Math.abs(sourceHist[i] - outputHist[i])
  const rangePreservation = 1 - absDiffSum / 2

  const p5 = percentileFromHistogram(outputHist, 0.05)
  const p95 = percentileFromHistogram(outputHist, 0.95)
  const contrast = Math.max(0, Math.min(1, p95 - p5))

  let midtonePresence = 0
  for (let i = 0; i < 256; i++) {
    const lum = i / 255
    if (lum >= midpointLow && lum <= midpointHigh) midtonePresence += outputHist[i]
  }

  const total = 0.5 * rangePreservation + 0.3 * contrast + 0.2 * midtonePresence
  return { rangePreservation, contrast, midtonePresence, total }
}

export interface AutoDetectResult {
  bestVariantId: string
  scores: { variantId: string; score: VariantScore }[]
}

export function autoDetectBest(
  source: PixelBuffer,
  entry: PaletteEntry,
  variants: VariantDef[] = DEFAULT_VARIANTS
): AutoDetectResult {
  const sourceHist = luminanceHistogram(source)
  const scores: { variantId: string; score: VariantScore }[] = []
  let best = variants[0].id
  let bestTotal = -Infinity
  for (const v of variants) {
    const out = applyDuotone(source, entry, variantToParams(v))
    const outputHist = luminanceHistogram(out)
    const score = scoreVariant(sourceHist, outputHist, v.midpointLow, v.midpointHigh)
    scores.push({ variantId: v.id, score })
    if (score.total > bestTotal) {
      bestTotal = score.total
      best = v.id
    }
  }
  return { bestVariantId: best, scores }
}
