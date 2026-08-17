import { describe, it, expect } from 'vitest'
import { themesByName } from '../index'
import type { ThemeName } from '../../store/settingsStore'
import type { Theme } from '@mui/material/styles'

// Derived from the registry, like palette.test.ts, so a theme added later is
// covered without anyone remembering to add it here.
const THEME_NAMES = Object.keys(themesByName) as ThemeName[]

type StyleObject = Record<string, unknown>

/** The theme's card, as MuiPaper declares it. */
function paperSurface(theme: Theme): StyleObject {
  return theme.components?.MuiPaper?.styleOverrides?.root as StyleObject
}

/** The tooltip style, resolved against its own theme. */
function tooltipStyle(theme: Theme): StyleObject {
  const overrides = theme.components?.MuiTooltip?.styleOverrides?.tooltip
  // The callback form is the point: a fixed value here would be one theme's
  // answer applied to all six.
  expect(typeof overrides).toBe('function')
  return (overrides as (p: { theme: Theme }) => StyleObject)({ theme })
}

/**
 * A tooltip is one of the theme's cards.
 *
 * The failure this guards is quiet. `sharedComponents(surface)` is spread into
 * each theme's own `components` block, so a theme that forgets the spread — or
 * that passes a surface it does not also give `MuiPaper` — drifts with no error
 * anywhere. It shows up as one floating panel in one theme that does not match
 * the panels around it, which is exactly the kind of thing nobody files.
 */
describe('every theme builds its tooltip from its own card', () => {
  it.each(THEME_NAMES)('%s gives the tooltip the card ground and edge', (name) => {
    const theme = themesByName[name]
    const paper = paperSurface(theme)
    const tooltip = tooltipStyle(theme)

    expect(paper).toBeDefined()
    expect(tooltip.backgroundColor).toBe(paper.backgroundColor)
    expect(tooltip.border).toBe(paper.border)
    expect(tooltip.backdropFilter).toBe(paper.backdropFilter)
  })

  it.each(THEME_NAMES)('%s writes on it in the theme text colour', (name) => {
    const theme = themesByName[name]
    expect(tooltipStyle(theme).color).toBe(theme.palette.text.primary)
  })

  it.each(THEME_NAMES)('%s lifts the tooltip off the page', (name) => {
    // A card that sits inline can have no shadow. A floating one cannot — with
    // nothing to lift it, it reads as a hole in the page.
    const shadow = tooltipStyle(themesByName[name]).boxShadow
    expect(shadow).toBeTruthy()
    expect(shadow).not.toBe('none')
  })

  it('keeps the flat themes flat everywhere except the tooltip', () => {
    // The corporate themes are the ones this rule exists for: their card has no
    // shadow, and the tooltip has to gain one without the card gaining one.
    for (const name of ['mundanes', 'dubhaimid'] as const) {
      const theme = themesByName[name]
      expect(paperSurface(theme).boxShadow).toBe('none')
      expect(tooltipStyle(theme).boxShadow).not.toBe('none')
    }
  })

  it('paints the tooltip differently in different themes', () => {
    // If every theme resolved to one value the callback would be doing nothing.
    const grounds = new Set(THEME_NAMES.map((n) => tooltipStyle(themesByName[n]).backgroundColor))
    expect(grounds.size).toBeGreaterThan(1)
  })
})
