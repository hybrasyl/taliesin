import { describe, it, expect } from 'vitest'
import { themesByName } from '../index'
import type { ThemeName } from '../../store/settingsStore'

// Derived from the registry, like palette.test.ts, so a theme added later is
// covered without anyone remembering to add it here.
const THEME_NAMES = Object.keys(themesByName) as ThemeName[]

/**
 * Every theme carries the shared component overrides.
 *
 * The failure this guards is quiet. `sharedComponents` is spread into each
 * theme's own `components` block, so a theme that forgets the spread — or that
 * declares `MuiTooltip` after it and wins — loses the override with no error
 * anywhere. It shows up as one screen in one theme wearing MUI's default grey
 * slab, which is exactly the kind of thing nobody files.
 */
describe('shared component overrides reach every theme', () => {
  it.each(THEME_NAMES)('%s styles MuiTooltip from the palette', (name) => {
    const theme = themesByName[name]
    const tooltip = theme.components?.MuiTooltip
    expect(tooltip).toBeDefined()

    const overrides = tooltip?.styleOverrides?.tooltip
    // The callback form is the point: a fixed colour here would be one theme's
    // answer applied to all six.
    expect(typeof overrides).toBe('function')

    const style = (overrides as (p: { theme: typeof theme }) => Record<string, unknown>)({ theme })
    expect(style.backgroundColor).toBe(theme.palette.background.paper)
    expect(style.color).toBe(theme.palette.text.primary)
    expect(style.border).toContain(theme.palette.divider)
  })

  it.each(THEME_NAMES)('%s gives the tooltip an arrow', (name) => {
    expect(themesByName[name].components?.MuiTooltip?.defaultProps?.arrow).toBe(true)
  })

  it('paints the tooltip differently in different themes', () => {
    // If two themes resolved to one colour the callback would be doing nothing.
    const grounds = new Set(THEME_NAMES.map((n) => themesByName[n].palette.background.paper))
    expect(grounds.size).toBeGreaterThan(1)
  })
})
