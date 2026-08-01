import { BrowserWindow } from 'electron'
import { join } from 'path'
import { hardenWindow } from './windowSecurity'

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
    // The splash has no IPC needs; keep it isolated with no preload. With no
    // preload there is nothing for the sandbox to break, so it is free here --
    // and it is deliberately NOT registered as a trusted window, because a
    // window with no bridge cannot send IPC and registering it would widen the
    // trusted set for nothing.
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Nothing here should ever open a window or navigate away. `will-navigate`
  // fires only for renderer-initiated navigation, never for the loadFile below,
  // so this does not block the splash loading its own HTML -- which is
  // deliberately not a trusted location.
  hardenWindow(splash, { allowExternal: false, openExternal: () => {} })

  // Mirrors the icon path convention in index.ts (`../../resources/...`).
  // resources/** is bundled + asarUnpacked, so this resolves in production too.
  splash.loadFile(join(__dirname, '../../resources/splash.html')).catch((err) => {
    console.error('Failed to load splash:', err)
  })

  splash.once('ready-to-show', () => splash.show())
  return splash
}
