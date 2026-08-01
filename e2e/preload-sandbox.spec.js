import { test, expect } from '@playwright/test'
import { launchApp, getMainWindow } from './helpers.js'

// Guards `sandbox: true` on the main window, and the bridge surviving it.
//
// The regression this exists for is silent and late: a preload that imports a
// package builds, links and lints clean, then throws in the PACKAGED app where
// the sandboxed loader cannot resolve it -- taking window.api and therefore the
// whole UI. Nothing else in the suite would notice until a user did.

test.describe('preload sandbox', () => {
  let electronApp

  test.afterEach(async () => {
    await electronApp?.close()
  })

  test('the main window is sandboxed and the bridge still round-trips', async () => {
    ;({ electronApp } = await launchApp())
    const page = await getMainWindow(electronApp)

    // Read the flag back out of main rather than trusting the source: this is
    // what the window was actually constructed with. `browserWindow(page)`, not
    // a getAllWindows() scan -- the latter races the splash teardown.
    const win = await electronApp.browserWindow(page)
    const sandboxed = await win.evaluate((bw) => bw.webContents.getLastWebPreferences()?.sandbox)
    expect(sandboxed).toBe(true)

    // The flag alone proves nothing useful if the bridge died with it.
    const version = await page.evaluate(() => window.api.getAppVersion())
    expect(version).toMatch(/^\d+\.\d+\.\d+/)
  })

  test('exposes window.api and no longer exposes the toolkit bridge', async () => {
    ;({ electronApp } = await launchApp())
    const page = await getMainWindow(electronApp)

    // NOTE for anyone cribbing this from creidhne: its equivalent asserts
    // `'api' in window === false`, because creidhne's bridge is
    // window.electronAPI. Taliesin's bridge IS window.api, so the assertion is
    // inverted here. Copied verbatim it fails 100% of the time.
    expect(await page.evaluate(() => 'api' in window)).toBe(true)

    // @electron-toolkit/preload was dropped: nothing read this bridge, and its
    // package import was what blocked the sandbox. If this ever comes back,
    // sandbox: true breaks with it.
    expect(await page.evaluate(() => 'electron' in window)).toBe(false)
  })
})
