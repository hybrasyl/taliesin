import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { launchApp, getMainWindow, USERDATA_SUBPATH } from './helpers.js'

// Settings persistence, end to end. Two things are under test and neither is
// reachable from a unit test, because both are properties of a whole app run:
//
//   1. The round trip. Renderer set() -> the settingsStore's 200ms debounced
//      subscription -> saveSettings IPC -> settingsManager's atomic write ->
//      the NEXT launch's load() -> hydrate() -> a rendered, themed UI. Every
//      link has unit coverage; nothing joined them up.
//   2. The startup write contract. A launch that changes nothing must not
//      rewrite settings.json at all. That is what the settingsStore's hydration
//      gate and its suppressNextSave flag exist to guarantee, and it can only be
//      observed across a launch: it is the ABSENCE of a write, and the process
//      that would have made it is the one under test.
//
// Both launches share one %LOCALAPPDATA% temp dir (see launchApp).

// settingsManager.validate() requires `libraries` and `mapDirectories` to be
// arrays; without them load() treats the file as unreadable and falls back to
// defaults, which would make the gate test pass for the wrong reason.
function seed(overrides) {
  return { libraries: [], mapDirectories: [], activeLibrary: null, ...overrides }
}

function settingsFile(localAppData) {
  return join(localAppData, ...USERDATA_SUBPATH, 'settings.json')
}

function readSettings(localAppData) {
  return JSON.parse(readFileSync(settingsFile(localAppData), 'utf-8'))
}

test.describe('Settings persist across a relaunch', () => {
  let electronApp
  let localAppData

  test.afterEach(async () => {
    await electronApp?.close()
  })

  test('a theme picked in Settings is still applied after a relaunch', async () => {
    // --- First launch: change the theme away from the default (hybrasyl). ---
    ;({ electronApp, localAppData } = await launchApp())
    let page = await getMainWindow(electronApp)

    await page.getByTestId('nav-settings').click()
    await expect(page.getByTestId('settings-page')).toBeVisible()
    await expect(page.getByTestId('theme-option-hybrasyl')).toHaveAttribute('aria-checked', 'true')

    await page.getByTestId('theme-option-dubhaimid').click()
    await expect(page.getByTestId('theme-option-dubhaimid')).toHaveAttribute('aria-checked', 'true')

    // Poll until the write has actually reached disk. loadSettings() reads
    // settings.json back through the main process, so this waits out the 200ms
    // debounce by observing the result rather than sleeping on the number.
    await expect
      .poll(() => page.evaluate(() => window.api.loadSettings().then((s) => s.theme)), {
        timeout: 5000
      })
      .toBe('dubhaimid')

    await electronApp.close()

    // --- Second launch: same data dir, nothing seeded. It must hydrate. ---
    ;({ electronApp } = await launchApp({ localAppData }))
    page = await getMainWindow(electronApp)

    // On disk...
    expect(readSettings(localAppData).theme).toBe('dubhaimid')

    // ...and actually applied in the hydrated UI. Dubhaimid is a plain-chrome
    // theme, so the title bar drops its text-shadow -- proof the value reached
    // ThemeProvider and not just the store.
    const shadow = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-testid="app-title"]')).textShadow
    )
    expect(shadow).toBe('none')

    await page.getByTestId('nav-settings').click()
    await expect(page.getByTestId('theme-option-dubhaimid')).toHaveAttribute('aria-checked', 'true')
  })

  test('a launch that changes nothing does not rewrite settings.json', async () => {
    // Launch, read, quit -- change nothing. The assertion is on the file's raw
    // BYTES, not its parsed theme, and that is the whole strength of this test:
    // the seed below is written by the harness, so any write by the app at all
    // would come back through withDefaults() + JSON.stringify and differ in key
    // order and key count even when every value it kept was correct. So this
    // fails on ANY startup write, not just on one that lost data.
    //
    // What it is not: proof that removing the hydration gate breaks something.
    // In a packaged launch nothing calls a setter before hydrate() resolves, so
    // the gate has nothing to block -- it earns its keep against HMR and against
    // a future component that sets during mount. This test locks the contract
    // those guards exist to keep, and it is the contract, not the mechanism,
    // that must never regress.
    const seeded = seed({ theme: 'grinneal', musEncodeKbps: 128 })
    ;({ electronApp, localAppData } = await launchApp({ seedSettings: seeded }))
    const before = readFileSync(settingsFile(localAppData), 'utf-8')
    const page = await getMainWindow(electronApp)

    // The reveal handshake already implies hydrate() resolved -- App calls
    // appReady() in its .finally. Opening Settings proves the seeded theme
    // reached the UI, and gives the 200ms debounce room to fire if anything
    // wrongly queued a save.
    await page.getByTestId('nav-settings').click()
    await expect(page.getByTestId('theme-option-grinneal')).toHaveAttribute('aria-checked', 'true')

    await electronApp.close()

    expect(readFileSync(settingsFile(localAppData), 'utf-8')).toBe(before)
    // Stated separately so a failure says which half broke.
    const after = readSettings(localAppData)
    expect(after.theme).toBe('grinneal')
    expect(after.musEncodeKbps).toBe(128)
  })
})
