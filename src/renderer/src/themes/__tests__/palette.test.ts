import { describe, it, expect } from 'vitest'
import { themesByName } from '../index'
import type { ThemeName } from '../../store/settingsStore'

// Derived from the registry rather than a hand-kept list, so a theme added to
// `themesByName` is covered without anyone remembering to add it here.
const THEME_NAMES = Object.keys(themesByName) as ThemeName[]

/**
 * Palette invariants, pinned because a comment was not enough once already.
 *
 * The Hybrasyl theme shipped with `primary.main` set to the same value as
 * `background.default` (`#0d182f`). Every control that signals its active state
 * through `color="primary"` therefore painted itself the colour of the page
 * behind it, and the affordance INVERTED: a filled Chip takes `primary.main` as
 * its background while an unselected one keeps MUI's default grey, so the
 * selected chip was the one that disappeared.
 *
 * Two places in the Map Maker had already worked around it locally with
 * `Mui-selected` overrides — the tell that this had been hit before and patched
 * at the leaves rather than at the root. Those are gone; this is the root.
 *
 * The bug is that two palette entries held one colour and nothing prevented it,
 * so the test walks EVERY theme rather than the one that was broken. See
 * HTOO-341.
 */

const lin = (c: number): number => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** Relative luminance of `#rrggbb`, or of `rgba(r,g,b,a)` ignoring alpha. */
function luminance(color: string): number {
  const rgba = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  const [r, g, b] = rgba
    ? [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])]
    : [
        parseInt(color.slice(1, 3), 16),
        parseInt(color.slice(3, 5), 16),
        parseInt(color.slice(5, 7), 16)
      ]
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Each style object under `node` that sets `backgroundColor` to `main` and a
 *  `color` (#rrggbb), with its path in the overrides. */
function accentFills(
  node: unknown,
  main: string,
  path: string[] = []
): { path: string; backgroundColor: string; color: string }[] {
  if (!node || typeof node !== 'object') return []
  const o = node as Record<string, unknown>
  const out: { path: string; backgroundColor: string; color: string }[] = []
  if (
    typeof o.backgroundColor === 'string' &&
    o.backgroundColor.toLowerCase() === main.toLowerCase() &&
    typeof o.color === 'string' &&
    /^#[0-9a-f]{6}$/i.test(o.color)
  )
    out.push({ path: path.join(' > '), backgroundColor: o.backgroundColor, color: o.color })
  for (const [k, v] of Object.entries(o)) out.push(...accentFills(v, main, [...path, k]))
  return out
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('theme palettes', () => {
  it('registers all six themes', () => {
    expect(THEME_NAMES).toHaveLength(6)
    for (const name of THEME_NAMES) expect(themesByName[name]).toBeDefined()
  })

  it.each(THEME_NAMES)('%s: primary.main is not the page background', (name) => {
    const p = themesByName[name].palette
    expect(p.primary.main.toLowerCase()).not.toBe(p.background.default.toLowerCase())
  })

  // HTOO-355: both contrast rules, for every theme. The values were picked per
  // theme from a preview of its controls (Mabon WP96 for four of them). A theme
  // that fails here needs a new value, never a lower threshold.
  describe.each(THEME_NAMES)('%s', (name) => {
    const p = themesByName[name].palette

    it('primary.main reads as a control against the page and against paper', () => {
      // 3:1 is the WCAG floor for a UI component boundary (1.4.11). This is what
      // "the selected chip is visible at all" reduces to.
      expect(contrast(p.primary.main, p.background.default)).toBeGreaterThanOrEqual(3)
      expect(contrast(p.primary.main, p.background.paper)).toBeGreaterThanOrEqual(3)
    })

    it('contrastText is legible on primary.main', () => {
      // 4.5:1 (1.4.3): chip and button labels are normal-sized text, not large
      // text. This rule ruled out hybrasyl's cream (#f0e6cc on #4d84d1: 3.05:1)
      // and chadul's green (#a8d8a0 on #2e7a3a: 3.28:1).
      expect(contrast(p.primary.contrastText, p.primary.main)).toBeGreaterThanOrEqual(4.5)
    })

    it('an override that fills with primary.main gives its text 4.5:1', () => {
      // The component overrides paint the accent themselves, with their own label
      // colour. danaan's contained button put cream on its gold (2.76:1) while
      // the palette said otherwise.
      const fills = accentFills(themesByName[name].components ?? {}, p.primary.main)
      for (const f of fills) {
        expect(contrast(f.color, f.backgroundColor), f.path).toBeGreaterThanOrEqual(4.5)
      }
    })
  })
})
