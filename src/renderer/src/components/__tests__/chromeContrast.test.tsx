import React from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material'
import { themesByName } from '../../themes'
import type { ThemeName } from '../../store/settingsStore'
import { useSettingsStore, PLAIN_CHROME_THEMES } from '../../store/settingsStore'
import MainLayout from '../MainLayout'
import { installMockApi } from '../../__tests__/setup/mockApi'
import { contrast } from '../../themes/__tests__/contrast'
import { isDarkText } from '../chromeEngrave'

const THEME_NAMES = Object.keys(themesByName) as ThemeName[]

/**
 * The chrome reads against its bars (WCAG 1.4.11 for icons, 1.4.3 for text).
 *
 * The title bar and the nav bar paint `secondary.main`, and their icons and
 * caption take `secondary.contrastText`. A theme's component overrides can
 * still change what draws (mundanes styles the AppBar), and the palette alone
 * does not show that. So this renders the real chrome and reads the colour each
 * theme draws.
 *
 * The caption's `opacity: 0.7` is not in its computed colour, so the 4.5:1 here
 * is for the colour, not the faded caption on screen.
 */
describe('the chrome', () => {
  beforeEach(() => {
    const api = installMockApi()
    api.companionStatus.mockResolvedValue({ found: false })
    useSettingsStore.setState({ activeLibrary: 'C:/worlds/demo' })
  })
  afterEach(cleanup)

  it.each(THEME_NAMES)('%s: icons are 3:1 and the caption 4.5:1 on the bar', (name) => {
    const theme = themesByName[name]
    render(
      <ThemeProvider theme={theme}>
        <MainLayout>
          <div />
        </MainLayout>
      </ThemeProvider>
    )
    const bar = theme.palette.secondary.main
    const drawn = (el: Element): string => getComputedStyle(el).color
    const navIcon = drawn(screen.getByTestId('nav-catalog'))
    const titleIcon = drawn(screen.getByRole('button', { name: 'Minimize' }))
    const caption = drawn(screen.getByText(/Current Library/))

    expect(contrast(navIcon, bar), `nav icon ${navIcon}`).toBeGreaterThanOrEqual(3)
    expect(contrast(titleIcon, bar), `title-bar icon ${titleIcon}`).toBeGreaterThanOrEqual(3)
    expect(contrast(caption, bar), `caption ${caption}`).toBeGreaterThanOrEqual(4.5)
  })

  // Dark bar text (danaan, grinneal) is engraved, not outlined: the dark stroke
  // on the icons merges with a dark glyph. See chromeEngrave.ts.
  it.each(THEME_NAMES)('%s: the nav bar engraves dark text and outlines light', (name) => {
    const theme = themesByName[name]
    render(
      <ThemeProvider theme={theme}>
        <MainLayout>
          <div />
        </MainLayout>
      </ThemeProvider>
    )
    const captionShadow = getComputedStyle(screen.getByText(/Current Library/)).textShadow
    const iconStroke = getComputedStyle(
      screen.getByTestId('nav-catalog').querySelector('svg') as SVGElement
    ).stroke
    const iconFilter = getComputedStyle(
      screen.getByTestId('nav-catalog').querySelector('svg') as SVGElement
    ).filter
    // The outline is a translucent black stroke, rgba(0,0,0,0.25).
    const KEYLINE_STROKE = /rgba\(0, ?0, ?0, ?0\.25\)/
    if (isDarkText(theme.palette.secondary.contrastText)) {
      expect(captionShadow).toMatch(/rgba\(255, ?248, ?232/)
      expect(iconStroke).not.toMatch(KEYLINE_STROKE)
      expect(iconFilter).toMatch(/rgba\(255, ?248, ?232/)
    } else {
      expect(captionShadow).not.toMatch(/rgba\(255, ?248, ?232/)
      // The plain (corporate) themes draw flat icons with no stroke at all.
      if (!PLAIN_CHROME_THEMES.includes(name)) expect(iconStroke).toMatch(KEYLINE_STROKE)
    }
  })

  it('treats danaan and grinneal as dark bar text, hybrasyl as light', () => {
    // Pins the branch above, so a palette change cannot move every theme into one side.
    const dark = (n: ThemeName): boolean =>
      isDarkText(themesByName[n].palette.secondary.contrastText)
    expect([dark('danaan'), dark('grinneal'), dark('hybrasyl')]).toEqual([true, true, false])
  })
})
