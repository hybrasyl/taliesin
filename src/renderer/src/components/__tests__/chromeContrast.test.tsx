import React from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material'
import { themesByName } from '../../themes'
import type { ThemeName } from '../../store/settingsStore'
import { useSettingsStore } from '../../store/settingsStore'
import MainLayout from '../MainLayout'
import { installMockApi } from '../../__tests__/setup/mockApi'

const THEME_NAMES = Object.keys(themesByName) as ThemeName[]

const lin = (c: number): number => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** Luminance of a computed `rgb(...)` / `rgba(...)` drawn over `under`. */
function luminance(color: string, under: [number, number, number]): number {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/)
  if (!m) throw new Error(`not a computed colour: ${color}`)
  const a = m[4] === undefined ? 1 : Number(m[4])
  const ch = [1, 2, 3].map((i, k) => Number(m[i]) * a + under[k] * (1 - a))
  return 0.2126 * lin(ch[0]) + 0.7152 * lin(ch[1]) + 0.0722 * lin(ch[2])
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * The chrome's icons stand out from their bar (WCAG 1.4.11, 3:1).
 *
 * The nav icons take `text.button`, and the mundanes theme forces them white
 * in its AppBar override. Neither shows in the palette alone, so this renders
 * the real chrome and reads the colour each theme draws against the bar's
 * `secondary.main`.
 *
 * Not asserted: the toolbar caption at 4.5:1. grinneal's bar is a mid-tone on
 * which no text colour reaches 4.5:1; that is a palette question for the house
 * (the palette card), not a text.button one.
 */
describe('the chrome', () => {
  beforeEach(() => {
    const api = installMockApi()
    api.companionStatus.mockResolvedValue({ found: false })
    useSettingsStore.setState({ activeLibrary: 'C:/worlds/demo' })
  })
  afterEach(cleanup)

  it.each(THEME_NAMES)('%s: a nav icon is 3:1 against the bar', (name) => {
    const theme = themesByName[name]
    render(
      <ThemeProvider theme={theme}>
        <MainLayout>
          <div />
        </MainLayout>
      </ThemeProvider>
    )
    const bar = hexRgb(theme.palette.secondary.main)
    const icon = getComputedStyle(screen.getByTestId('nav-catalog')).color
    const [hi, lo] = [luminance(icon, bar), luminance(`rgb(${bar.join(', ')})`, bar)].sort(
      (x, y) => y - x
    )
    expect((hi + 0.05) / (lo + 0.05), `${name} nav icon ${icon}`).toBeGreaterThanOrEqual(3)
  })
})
