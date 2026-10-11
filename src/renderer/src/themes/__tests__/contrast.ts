/**
 * WCAG contrast for the theme tests. One copy, so the palette test and the
 * rendered tests measure the same way.
 */

const lin = (c: number): number => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** `#rrggbb`, or `rgb(a)(r, g, b[, a])` as a palette or getComputedStyle gives it. */
export function parseColor(color: string): [number, number, number, number] {
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?/i)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])]
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`not a colour this test reads: ${color}`)
  return [
    parseInt(color.slice(1, 3), 16),
    parseInt(color.slice(3, 5), 16),
    parseInt(color.slice(5, 7), 16),
    1
  ]
}

/** Relative luminance of a colour drawn over `under` (opaque) when it is translucent. */
export function luminance(color: string, under = '#000000'): number {
  const [r, g, b, a] = parseColor(color)
  const [ur, ug, ub] = parseColor(under)
  const mix = (c: number, u: number): number => c * a + u * (1 - a)
  return 0.2126 * lin(mix(r, ur)) + 0.7152 * lin(mix(g, ug)) + 0.0722 * lin(mix(b, ub))
}

/** Contrast ratio of two colours, each drawn over `under` when it is translucent. */
export function contrast(a: string, b: string, under?: string): number {
  const [hi, lo] = [luminance(a, under), luminance(b, under)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
