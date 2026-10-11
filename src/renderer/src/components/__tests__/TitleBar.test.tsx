import React from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ThemeProvider, getLuminance } from '@mui/material/styles'
import TitleBar from '../TitleBar'
import { themesByName } from '../../themes'
import { useSettingsStore, PLAIN_CHROME_THEMES, type ThemeName } from '../../store/settingsStore'
import { installMockApi, type MockApi } from '../../__tests__/setup/mockApi'

// HTOO-569. On macOS the bar is an empty drag region that holds the native
// stoplights: no logo, no name, no window buttons. The padding is checked in
// e2e/title-bar.spec.js, because jsdom does not apply the Toolbar's media query.

let api: MockApi

beforeEach(() => {
  api = installMockApi()
})

describe('TitleBar', () => {
  it('draws the logo, the name and three window buttons on Windows and Linux', () => {
    render(<TitleBar />)
    expect(screen.getByTestId('app-title')).toHaveTextContent('Taliesin')
    expect(screen.getByAltText('Taliesin')).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  it('is empty on macOS', () => {
    api.platform = 'darwin'
    render(<TitleBar />)
    expect(screen.getByTestId('title-bar')).toBeInTheDocument()
    expect(screen.queryByTestId('app-title')).not.toBeInTheDocument()
    expect(screen.queryByAltText('Taliesin')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  // The keyline is dark, so it outlines light title text and smears dark text.
  // danaan's title is dark on its gold bar, and grinneal's on its tan one: those
  // are engraved with a cream edge instead (ported from Mabon).
  const DECORATED = (Object.keys(themesByName) as ThemeName[]).filter(
    (n) => !PLAIN_CHROME_THEMES.includes(n)
  )
  it.each(DECORATED)('%s: outlines light title text, engraves dark title text', (name) => {
    const theme = themesByName[name]
    useSettingsStore.setState({ theme: name })
    render(
      <ThemeProvider theme={theme}>
        <TitleBar />
      </ThemeProvider>
    )
    const shadow = getComputedStyle(screen.getByTestId('app-title')).textShadow
    if (getLuminance(theme.palette.secondary.contrastText) < 0.18) {
      expect(shadow).toMatch(/rgba\(255, ?248, ?232/)
      expect(shadow).not.toMatch(/#000|rgb\(0, 0, 0\)/)
    } else {
      expect(shadow).toMatch(/#000|rgb\(0, 0, 0\)/)
    }
    cleanup()
  })

  it('engraves danaan and outlines hybrasyl', () => {
    // The loop above branches on the palette; this pins the two known cases, so
    // a palette change cannot quietly move every theme into one branch.
    const dark = (n: ThemeName): boolean =>
      getLuminance(themesByName[n].palette.secondary.contrastText) < 0.18
    expect(dark('danaan')).toBe(true)
    expect(dark('hybrasyl')).toBe(false)
  })
})
