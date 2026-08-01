import { test, expect } from '@playwright/test'
import { join } from 'path'
import { launchApp, getMainWindow, repoRoot } from './helpers.js'

// Proves the IPC sender guard (windowSecurity.js `guardIpc`) BOTH directions
// against the running app. The unit suite covers the policy; only this covers
// the wiring -- a guard that is correct and never installed passes every unit
// test, and so does one that rejects our own window and bricks the app.

const ROGUE = {
  preload: join(repoRoot, 'out', 'preload', 'index.js'),
  indexHtml: join(repoRoot, 'out', 'renderer', 'index.html')
}

test.describe('IPC sender guard', () => {
  let electronApp

  test.afterEach(async () => {
    await electronApp?.close()
  })

  // FIRST ON PURPOSE: this is the only automated lockout detector in the repo.
  //
  // app-boot.spec.js cannot catch a lockout. Under a total IPC rejection,
  // App.tsx's `hydrate().finally(() => window.api.appReady())` still fires
  // (`.finally` runs on rejection), appReady is an ipcMain.on channel so the
  // guard drops it silently, and index.ts's 15 s `setTimeout(revealMainWindow)`
  // shows the window anyway with `app-root` rendered unconditionally. So that
  // spec goes green at ~15 s with every IPC dead. This one does not.
  test('allows the real main window (lockout regression guard)', async () => {
    ;({ electronApp } = await launchApp())
    const page = await getMainWindow(electronApp)

    const version = await page.evaluate(() => window.api.getAppVersion())
    expect(version).toMatch(/^\d+\.\d+\.\d+/)
  })

  test('refuses an unregistered window with our own preload at our own URL', async () => {
    ;({ electronApp } = await launchApp())
    await getMainWindow(electronApp)

    // The sharpest adversary available to a single-window app: same preload, so
    // a legitimate bridge; same index.html, so a legitimate trusted location.
    // It differs from the real window in exactly one way -- main never called
    // registerTrustedWindow on it.
    const result = await electronApp.evaluate(async ({ BrowserWindow }, paths) => {
      const rogue = new BrowserWindow({
        show: false,
        webPreferences: {
          preload: paths.preload,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false
        }
      })
      await rogue.loadFile(paths.indexHtml)
      const answer = await rogue.webContents.executeJavaScript(
        "window.api.getAppVersion().then(() => 'ALLOWED').catch((e) => 'REFUSED: ' + e.message)"
      )
      rogue.destroy()
      return answer
    }, ROGUE)

    // Expect console noise from the rogue while this runs: its React tree
    // mounts, hydrate() rejects, and the renderer error reporter's own IPC is
    // refused too. Harmless -- assert only on the returned string.
    expect(result).toMatch(/^REFUSED/)
    expect(result).toContain('untrusted sender')
  })
})

// Deliberately NOT tested here: an <iframe> variant. Electron injects preloads
// into subframes only when `nodeIntegrationInSubFrames` is set, which Taliesin
// does not, so `iframe.contentWindow.api` would be undefined and the test would
// pass for the wrong reason. The subframe rejection is covered by the unit
// suite's `senderFrame !== mainFrame` case instead.
