import { PaletteEntry, DuotoneParams } from './paletteTypes'

export interface PixelBuffer {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface Rgb { r: number; g: number; b: number }

export function parseHex(hex: string): Rgb {
  const s = hex.startsWith('#') ? hex.slice(1) : hex
  const v = parseInt(s, 16)
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff }
}

export function luminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) }
}

export function mapLuminance(lum: number, entry: PaletteEntry, p: DuotoneParams): Rgb {
  if (p.clampBlack && lum <= 0) return { r: 0, g: 0, b: 0 }
  if (p.clampWhite && lum >= 1) return { r: 255, g: 255, b: 255 }

  const shadow = parseHex(entry.shadowColor)
  const highlight = parseHex(entry.highlightColor)

  const darkerShadow: Rgb = {
    r: shadow.r * (1 - p.darkFactor),
    g: shadow.g * (1 - p.darkFactor),
    b: shadow.b * (1 - p.darkFactor),
  }
  const lighterHighlight: Rgb = {
    r: highlight.r + (255 - highlight.r) * p.lightFactor,
    g: highlight.g + (255 - highlight.g) * p.lightFactor,
    b: highlight.b + (255 - highlight.b) * p.lightFactor,
  }

  if (lum <= p.midpointLow) {
    const t = p.midpointLow > 0 ? lum / p.midpointLow : 0
    return lerpRgb(darkerShadow, shadow, t)
  }
  if (lum >= p.midpointHigh) {
    const span = 1 - p.midpointHigh
    const t = span > 0 ? (lum - p.midpointHigh) / span : 0
    return lerpRgb(highlight, lighterHighlight, t)
  }
  const span = p.midpointHigh - p.midpointLow
  const t = span > 0 ? (lum - p.midpointLow) / span : 0
  return lerpRgb(shadow, highlight, t)
}

export function applyDuotone(src: PixelBuffer, entry: PaletteEntry, p: DuotoneParams): PixelBuffer {
  const out = new Uint8ClampedArray(src.data.length)
  for (let i = 0; i < src.data.length; i += 4) {
    const r = src.data[i]
    const g = src.data[i + 1]
    const b = src.data[i + 2]
    const a = src.data[i + 3]
    const lum = luminance(r, g, b)
    const c = mapLuminance(lum, entry, p)
    out[i] = Math.round(c.r)
    out[i + 1] = Math.round(c.g)
    out[i + 2] = Math.round(c.b)
    out[i + 3] = a
  }
  return { data: out, width: src.width, height: src.height }
}

// Radial luminance ramp used as a default preview "test icon" before a
// canonical test icon has been assigned to a palette.
export function buildLuminanceRamp(size: number): PixelBuffer {
  const data = new Uint8ClampedArray(size * size * 4)
  const cx = (size - 1) / 2
  const cy = (size - 1) / 2
  const maxR = Math.sqrt(cx * cx + cy * cy)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx
      const dy = y - cy
      const r = Math.sqrt(dx * dx + dy * dy) / maxR
      const v = Math.round((1 - r) * 255)
      const i = (y * size + x) * 4
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return { data, width: size, height: size }
}

export function toGrayscale(src: PixelBuffer): PixelBuffer {
  const out = new Uint8ClampedArray(src.data.length)
  for (let i = 0; i < src.data.length; i += 4) {
    const lum = luminance(src.data[i], src.data[i + 1], src.data[i + 2])
    const v = Math.round(lum * 255)
    out[i] = v
    out[i + 1] = v
    out[i + 2] = v
    out[i + 3] = src.data[i + 3]
  }
  return { data: out, width: src.width, height: src.height }
}
