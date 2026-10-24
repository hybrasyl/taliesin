import React from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material'
import { themesByName } from '@renderer/themes'
import { blend, contrast } from '@renderer/lib/contrast'
import type { ThemeName } from '@shared/types'
import { useSettingsStore } from '../../store/settingsStore'
import { useUiStore } from '../../store/uiStore'
import MainLayout from '../MainLayout'
import { installMockApi } from '../../__tests__/setup/mockApi'
import { BUTTON, CURRENT, PLAIN_CHROME_THEMES, chromeKind } from '../titleChrome'

const THEME_NAMES = Object.keys(themesByName) as ThemeName[]

/** A palette path (`info.main`) in a theme, or a CSS colour as it is. */
function colourOf(name: ThemeName, value: string): string {
  const [group, key] = value.split('.')
  const palette = themesByName[name].palette as unknown as Record<string, Record<string, string>>
  return key && palette[group]?.[key] ? palette[group][key] : value
}

function renderLayout(name: ThemeName): void {
  useSettingsStore.setState({ theme: name })
  render(
    <ThemeProvider theme={themesByName[name]}>
      <MainLayout>
        <div />
      </MainLayout>
    </ThemeProvider>
  )
}

/**
 * Taliesin's nav bar reads against itself (WCAG 1.4.11 for icons, 1.4.3 for
 * text). The house `chromeContrast.test.tsx` checks the title bar; this checks
 * the second bar, which the house module does not draw. It paints
 * `secondary.main` too, and its icons and caption take `secondary.contrastText`.
 * A theme's overrides can still change what draws, so this renders the real
 * layout and reads the colour each theme draws.
 *
 * An `opacity` is not in an element's computed colour, so a faded caption or a
 * faded bar passes a colour check and still fails on screen. The captions had
 * `opacity: 0.7` on a bar at `opacity: 0.9`: 3.8:1 to 4.2:1 on screen in
 * hybrasyl, danaan and grinneal (HTOO-572). So each measured element, and each
 * of its ancestors, must have no opacity below 1.
 */
/** The product of the opacities from `el` up to the root: 1 when nothing fades it. */
function fadeOf(el: Element): number {
  let fade = 1
  for (let n: Element | null = el; n; n = n.parentElement) {
    const o = getComputedStyle(n).opacity
    if (o !== '') fade *= Number(o)
  }
  return fade
}

/** The colour `el` draws, after a check that nothing fades it. */
function drawn(el: Element): string {
  expect(fadeOf(el), `${el.textContent?.trim() || el.tagName} is faded`).toBe(1)
  return getComputedStyle(el).color
}

describe('the nav bar', () => {
  beforeEach(() => {
    const api = installMockApi()
    api.companionStatus.mockResolvedValue({ found: false })
    useSettingsStore.setState({ activeLibrary: 'C:/worlds/demo' })
    useUiStore.setState({ currentPage: 'catalog' })
  })
  afterEach(cleanup)

  it.each(THEME_NAMES)('%s: icons are 3:1 and the caption 4.5:1 on the bar', (name) => {
    renderLayout(name)
    const bar = themesByName[name].palette.secondary.main
    // The icon, not the button: a theme can colour an icon apart from its
    // button (the DA themes colour every MUI icon, HTOO-572).
    const icon = (id: string): Element => screen.getByTestId(id).querySelector('svg') as Element
    const navIcon = drawn(icon('nav-dashboard'))
    const activeIcon = drawn(icon('nav-catalog'))
    const caption = drawn(screen.getByText(/Current Library/))

    expect(contrast(navIcon, bar), `nav icon ${navIcon}`).toBeGreaterThanOrEqual(3)
    // The open page's icon drew secondary.dark, the bar colour as text.
    expect(contrast(activeIcon, bar), `open page's icon ${activeIcon}`).toBeGreaterThanOrEqual(3)
    expect(contrast(caption, bar), `caption ${caption}`).toBeGreaterThanOrEqual(4.5)
  })

  it.each(THEME_NAMES)('%s: the empty-library caption takes the bar text colour', (name) => {
    useSettingsStore.setState({ activeLibrary: null })
    renderLayout(name)
    const bar = themesByName[name].palette.secondary.main
    const caption = drawn(screen.getByText('No library selected'))
    expect(contrast(caption, bar), `caption ${caption}`).toBeGreaterThanOrEqual(4.5)
  })

  // Every decorated bar is dark with light text, so the dark stroke outlines
  // the icons in each decorated theme, and nothing is engraved (HTOO-572).
  it.each(THEME_NAMES)('%s: outlines the icons, with no engrave', (name) => {
    renderLayout(name)
    const svg = screen.getByTestId('nav-catalog').querySelector('svg') as SVGElement
    const style = getComputedStyle(svg)
    if (!PLAIN_CHROME_THEMES.includes(name))
      expect(style.stroke).toMatch(/rgba\(0, ?0, ?0, ?0\.25\)/)
    expect(style.filter).not.toMatch(/rgba\(255, ?248, ?232/)
    const captionShadow = getComputedStyle(screen.getByText(/Current Library/)).textShadow
    expect(captionShadow).not.toMatch(/rgba\(255, ?248, ?232/)
  })

  it.each(THEME_NAMES)('%s: the open page carries the house current-page mark', (name) => {
    renderLayout(name)
    const open = getComputedStyle(screen.getByTestId('nav-catalog'))
    const other = getComputedStyle(screen.getByTestId('nav-dashboard'))
    expect(open.boxShadow.toLowerCase()).toBe(CURRENT.ring.toLowerCase())
    expect(open.backgroundColor.replace(/\s/g, '')).toBe(CURRENT.background)
    expect(other.boxShadow.toLowerCase()).not.toBe(CURRENT.ring.toLowerCase())
  })

  // jsdom cannot apply :hover, so this reads the hover colours from
  // titleChrome.ts, which the nav buttons take.
  it.each(THEME_NAMES)('%s: a nav button reads on hover', (name) => {
    const bar = themesByName[name].palette.secondary.main
    const c = BUTTON[chromeKind(name)]
    const fill = blend(colourOf(name, c.hoverBackground), bar)
    const glyph = colourOf(name, c.hoverColor)
    expect(contrast(glyph, fill, fill), `${glyph} on ${fill}`).toBeGreaterThanOrEqual(3)
  })
})
