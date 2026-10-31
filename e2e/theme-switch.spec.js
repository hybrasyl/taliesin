import { test, expect } from '@playwright/test'
import { launchApp, getMainWindow, isMac } from './helpers.js'

// Smoke test for all eight themes. A theme is a MUI theme object built through
// responsiveFontSizes(); a bad token -- a missing palette entry, a malformed
// value, a key one theme has and another does not -- throws at RENDER time. The
// jsdom unit suite never sees it: it mounts components against a single theme,
// and the ones that read palette values off `themesByName` (ThemePicker's
// swatches) do not paint. Here every theme is applied to the real, fully
// composed renderer.
//
// Three things are asserted per theme, and each catches a different failure:
//   - nothing throws (a broken token),
//   - the app is still mounted afterwards (a throw caught by ErrorBoundary
//     instead, which would leave no pageerror to see),
//   - the paint actually changed (a theme selected but silently not applied).

const THEMES = [
  { name: 'hybrasyl', plain: false },
  { name: 'chadul', plain: false },
  { name: 'danaan', plain: false },
  { name: 'grinneal', plain: false },
  { name: 'shattered', plain: false },
  { name: 'untamed', plain: false },
  { name: 'mundanes', plain: true },
  { name: 'dubhaimid', plain: true }
]

test.describe('All eight themes render', () => {
  let electronApp

  test.afterEach(async () => {
    await electronApp?.close()
  })

  test('switching through every theme keeps the app alive and restyled', async () => {
    ;({ electronApp } = await launchApp())
    const page = await getMainWindow(electronApp)

    // Fail the test on anything the renderer throws while we drive it.
    const pageErrors = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.getByTestId('nav-settings').click()
    await expect(page.getByTestId('settings-page')).toBeVisible()

    const backgrounds = new Set()

    for (const { name, plain } of THEMES) {
      await page.getByTestId(`theme-option-${name}`).click()
      await expect(page.getByTestId(`theme-option-${name}`)).toHaveAttribute('aria-checked', 'true')

      // Still mounted and painted after the switch.
      await expect(page.getByTestId('app-root')).toBeVisible()
      await expect(page.getByTestId('settings-page')).toBeVisible()
      await expect(page.getByTestId('title-bar')).toBeVisible()

      // The PLAIN_CHROME_THEMES branch: the two corporate themes drop the title
      // bar's text-shadow, and the four decorated ones paint the keyline and
      // depth. Nothing is engraved (HTOO-572). This is the branch's only effect
      // a spec can see in a production build: MUI strips the data-testid it puts
      // on its own icons when NODE_ENV is production, so the window glyphs are
      // not selectable there (HTOO-173/174). The wordmark is the bar's one
      // heading, an h6.
      // macOS has no title text (HTOO-569), so the check is for Windows and Linux.
      if (!isMac) {
        const shadow = await page.evaluate(
          () => getComputedStyle(document.querySelector('[data-testid="title-bar"] h6')).textShadow
        )
        if (plain) expect(shadow, `${name} should use plain chrome`).toBe('none')
        else expect(shadow, `${name} should use gamified chrome`).not.toBe('none')
      }

      // CssBaseline paints palette.background.default onto body.
      backgrounds.add(await page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    }

    expect(pageErrors, `renderer errors: ${pageErrors.join(' | ')}`).toEqual([])

    // Eight themes, eight distinct backgrounds. Exact rather than ">1": the eight
    // `background.default` values are literal and all differ today, so a
    // collision means either a theme stopped being applied or two themes became
    // indistinguishable to look at. Both are worth a failure.
    expect(backgrounds.size, `saw: ${[...backgrounds].join(', ')}`).toBe(THEMES.length)
  })
})
