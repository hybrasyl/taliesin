import { describe, it, expect } from 'vitest'
import type { Theme } from '@mui/material/styles'
import { themesByName } from '../index'
import { taliesinOverrides } from '../taliesinOverrides'
import type { ThemeName } from '@shared/types'

const THEME_NAMES = Object.keys(themesByName) as ThemeName[]

type StyleObject = Record<string, unknown>

/** The theme's card, as its MuiPaper declares it. */
function paperSurface(theme: Theme): StyleObject {
  return theme.components?.MuiPaper?.styleOverrides?.root as StyleObject
}

/** The tooltip style, resolved against its own theme. */
function tooltipStyle(theme: Theme): StyleObject {
  const overrides = theme.components?.MuiTooltip?.styleOverrides?.tooltip
  // The callback form is the point: a fixed value would be one theme's answer
  // applied to all six.
  expect(typeof overrides).toBe('function')
  return (overrides as (p: { theme: Theme }) => StyleObject)({ theme })
}

/**
 * Each theme file is the house template's file, plus one spread of
 * `taliesinOverrides`. The next port of the template's palettes copies the six
 * files again. This test fails when that copy loses the spread: every tooltip
 * then falls back to MUI's grey slab, and no other test sees it.
 */
describe("Taliesin's component overrides", () => {
  const keys = Object.keys(taliesinOverrides) as (keyof typeof taliesinOverrides)[]

  it('holds the one override that the template does not have', () => {
    expect(keys).toEqual(['MuiTooltip'])
  })

  it('does not replace a key of the shared filledControls', () => {
    expect(keys).not.toContain('MuiButtonBase')
    expect(keys).not.toContain('MuiAlert')
  })

  it.each(THEME_NAMES)('%s carries every one of them', (name) => {
    const components = themesByName[name].components ?? {}
    for (const key of keys) expect(components[key], key).toEqual(taliesinOverrides[key])
  })
})

/**
 * A tooltip is one of the theme's cards (#73). The failure is quiet: a theme
 * whose tooltip does not match its panels shows as one floating card in one
 * theme that looks wrong, and nobody files that.
 */
describe('every theme builds its tooltip from its own card', () => {
  it.each(THEME_NAMES)('%s gives the tooltip the card ground and edge', (name) => {
    const theme = themesByName[name]
    const paper = paperSurface(theme)
    const tooltip = tooltipStyle(theme)

    expect(paper).toBeDefined()
    expect(tooltip.backgroundColor).toBe(paper.backgroundColor ?? theme.palette.background.paper)
    expect(tooltip.border).toBe(paper.border)
    expect(tooltip.backdropFilter).toBe(paper.backdropFilter)
  })

  it.each(THEME_NAMES)('%s writes on it in the theme text colour', (name) => {
    const theme = themesByName[name]
    expect(tooltipStyle(theme).color).toBe(theme.palette.text.primary)
  })

  it.each(THEME_NAMES)('%s lifts the tooltip off the page', (name) => {
    // A card that sits inline can have no shadow. A floating one needs one:
    // with nothing to lift it, it looks like a hole in the page.
    const shadow = tooltipStyle(themesByName[name]).boxShadow
    expect(shadow).toBeTruthy()
    expect(shadow).not.toBe('none')
  })

  it('keeps the flat themes flat everywhere except the tooltip', () => {
    for (const name of ['mundanes', 'dubhaimid'] as const) {
      const theme = themesByName[name]
      expect(paperSurface(theme).boxShadow).toBe('none')
      expect(tooltipStyle(theme).boxShadow).not.toBe('none')
    }
  })

  it('paints the tooltip differently in different themes', () => {
    const grounds = new Set(THEME_NAMES.map((n) => tooltipStyle(themesByName[n]).backgroundColor))
    expect(grounds.size).toBeGreaterThan(1)
  })
})
