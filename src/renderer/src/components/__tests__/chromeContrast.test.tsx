import React from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material'
import { themesByName } from '../../themes'
import type { ThemeName } from '../../store/settingsStore'
import { useSettingsStore } from '../../store/settingsStore'
import MainLayout from '../MainLayout'
import { installMockApi } from '../../__tests__/setup/mockApi'
import { contrast } from '../../themes/__tests__/contrast'

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
})
