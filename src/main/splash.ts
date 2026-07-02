import { BrowserWindow } from 'electron'
import { join } from 'path'

/**
 * Frameless, transparent splash window shown the instant the app boots — before
 * the main window's renderer bundle has evaluated. It stays up until the
 * renderer signals `app:ready` (see the boot sequence in `index.ts`), so the
 * user gets immediate branded feedback instead of a few seconds of nothing.
 *
 * Deliberately dependency-free and self-contained (loads a static
 * `resources/splash.html`) so it ports to Creidhne by copying this file +
 * `resources/splash.html` and swapping the logo/title. See
 * `docs/splash-screen.md`.
 */
export function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    center: true,
    skipTaskbar: true,
    show: false,
    // The splash has no IPC needs; keep it isolated with no preload.
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Mirrors the icon path convention in index.ts (`../../resources/...`).
  // resources/** is bundled + asarUnpacked, so this resolves in production too.
  splash.loadFile(join(__dirname, '../../resources/splash.html')).catch((err) => {
    console.error('Failed to load splash:', err)
  })

  splash.once('ready-to-show', () => splash.show())
  return splash
}
