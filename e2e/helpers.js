import { _electron as electron, expect } from '@playwright/test'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const repoRoot = join(__dirname, '..')
export const mainEntry = join(repoRoot, 'out', 'main', 'index.js')

// The app's userData subdir under %LOCALAPPDATA%. Must match src/main/index.ts
// (`join(localAppData, 'Erisco', 'Taliesin')`).
export const USERDATA_SUBPATH = ['Erisco', 'Taliesin']

// macOS draws a different title bar and installs the application menu (HTOO-569).
export const isMac = process.platform === 'darwin'

// Launch the BUILT app under Electron.
//
// %LOCALAPPDATA% is redirected to a throwaway temp dir because src/main/index.ts
// derives its userData (settings.json) from %LOCALAPPDATA% at module load —
// pointing it at a temp dir keeps every run hermetic and off the real profile.
// Pass `seedSettings` to pre-write settings.json; pass an existing `localAppData`
// to reuse one dir across two launches (persistence-across-relaunch tests).
export async function launchApp({ seedSettings, localAppData: reuseDir } = {}) {
  const localAppData = reuseDir ?? mkdtempSync(join(tmpdir(), 'taliesin-e2e-'))
  if (seedSettings) {
    const dir = join(localAppData, ...USERDATA_SUBPATH)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'settings.json'), JSON.stringify(seedSettings, null, 2))
  }
  // Strip ELECTRON_RUN_AS_NODE — if it's set in the parent environment (some
  // Electron-hosted terminals set it), the launched electron binary runs as
  // plain Node (no `app`, no windows) and the main process throws at
  // app.setPath. We want a real Electron app here.
  //
  // HYBINDEX_CACHE_DIR: hybindex-ts reads LOCALAPPDATA on Windows only and
  // writes ~/.config/Erisco/hybindex elsewhere, so the world-index cache needs
  // its own redirect (HTOO-543). Same layout as Windows.
  const env = {
    ...process.env,
    LOCALAPPDATA: localAppData,
    HYBINDEX_CACHE_DIR: join(localAppData, 'Erisco', 'hybindex'),
    NODE_ENV: 'test'
  }
  delete env.ELECTRON_RUN_AS_NODE
  const electronApp = await electron.launch({ args: [mainEntry], cwd: repoRoot, env })
  await assertIsolated(electronApp, localAppData)
  return { electronApp, localAppData }
}

// Fail the launch when the app's userData is not under the temp dir (HTOO-543).
// This is the alarm, not the fix: it reads userData AFTER the launch, so the app
// has already made its profile folder wherever userData points. It stops a SPEC
// from saving into the real settings. The `localAppData` line in
// src/main/index.ts is what keeps the launch itself off the real profile.
export async function assertIsolated(electronApp, localAppData) {
  const userData = await electronApp.evaluate(({ app }) => app.getPath('userData'))
  const expected = join(localAppData, ...USERDATA_SUBPATH)
  if (resolve(userData).toLowerCase() !== resolve(expected).toLowerCase()) {
    await electronApp.close().catch(() => {})
    throw new Error(`e2e isolation failed: userData is ${userData}, expected ${expected}`)
  }
}

// Find the real main window and wait until it's actually shown. The app pops a
// splash window first, so `firstWindow()` can return the wrong one. The splash
// has NO preload, so we identify the main window by the presence of a preload
// bridge.
//
// The `window.electron` half of the probe is now dead for Taliesin: the
// @electron-toolkit bridge was removed so the preload could run sandboxed, so
// the live path here is the `window[bridge]` fallback, i.e. `window.api`. The
// toolkit check is kept only because this helper is cribbed between siblings
// that still expose it. Do not "simplify" it away without checking them.
export async function getMainWindow(electronApp, { bridge = 'api' } = {}) {
  let page = null
  for (let i = 0; i < 120 && !page; i++) {
    for (const w of electronApp.windows()) {
      const isMain = await w
        .evaluate((b) => !!(window.electron || window[b]), bridge)
        .catch(() => false)
      if (isMain) {
        page = w
        break
      }
    }
    if (!page) await electronApp.waitForEvent('window', { timeout: 500 }).catch(() => {})
  }
  if (!page) throw new Error('main renderer window (with a preload bridge) never appeared')

  const win = await electronApp.browserWindow(page)
  await expect.poll(() => win.evaluate((bw) => bw.isVisible()), { timeout: 20_000 }).toBe(true)
  await page.waitForSelector('[data-testid="app-root"]', { state: 'visible' })
  return page
}

// Snapshot native window geometry (main process) paired with the renderer's view
// of where a given element actually sits on screen, both in CSS px so they're
// directly comparable. `screenLeftOf(sel)` is the tool for measuring content
// offsets / letterboxing; the offset spec pattern (see the E2E doc) builds on it.
export async function readGeometry(electronApp, page, selector = '[data-testid="app-root"]') {
  const win = await electronApp.browserWindow(page)
  const native = await win.evaluate((bw) => ({
    bounds: bw.getBounds(),
    contentBounds: bw.getContentBounds()
  }))
  const dom = await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    const r = el?.getBoundingClientRect()
    return {
      screenX: window.screenX,
      innerWidth: window.innerWidth,
      elementScreenLeft: r ? Math.round(window.screenX + r.left) : null
    }
  }, selector)
  return { native, dom, letterbox: dom.screenX - native.bounds.x }
}

export function tempExists(p) {
  return existsSync(p)
}
