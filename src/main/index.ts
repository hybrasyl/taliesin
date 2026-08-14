import { app, shell, session, BrowserWindow, ipcMain, dialog, screen } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, copyFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createSettingsManager } from './settingsManager'
import { registerHandlers, applySettingsRoots, type HandlerContext } from './handlers'
import { loadPacks } from './assetPacks'
import { createSplashWindow, type SplashController } from './splash'
import { initSessionLog, captureError } from './report/sessionLog'
import { installGlobalErrorHandlers } from './report/errorHandlers'
import {
  initWindowSecurity,
  registerTrustedWindow,
  hardenWindow,
  guardIpc,
  installContentSecurityPolicy,
  DEV_RENDERER_CSP,
  RENDERER_CSP
} from './windowSecurity'
import { shouldDisableHardwareAcceleration, REMOTE_SESSION_CSS } from './remoteSession'

// Settings + cache both under %LOCALAPPDATA%/Erisco/Taliesin (local). On Windows,
// Electron's app.getPath('cache') actually returns the ROAMING dir, so we resolve
// %LOCALAPPDATA% ourselves. macOS/Linux have no roaming concept; appData is local.
const localAppData =
  process.platform === 'win32'
    ? (process.env.LOCALAPPDATA ?? join(app.getPath('home'), 'AppData', 'Local'))
    : app.getPath('appData')
const settingsPath = join(localAppData, 'Erisco', 'Taliesin')
const cachePath = join(localAppData, 'Erisco', 'Taliesin')
app.setPath('userData', cachePath)

// Software rendering under Remote Desktop (HTOO-325). MUST be here, before the
// `ready` event: app.disableHardwareAcceleration() after ready does not throw and
// does not warn in a way anybody reads -- it simply stops working. That ordering
// is the one thing about this fix no unit test could otherwise see, so
// remoteSession.test.ts reads this file and asserts the position.
//
// Read ONCE and kept, because createWindow needs the same answer later for the
// CSS mitigation, and two calls that could disagree is a worse shape than one
// constant however unlikely the disagreement.
const softwareRendering = shouldDisableHardwareAcceleration(process.platform, process.env)
if (softwareRendering) app.disableHardwareAcceleration()

// Single instance. Two copies write the same settings.json and the same caches
// under userData, and the last writer wins -- jsonStore's crash-safe write keeps
// the file well-formed, so the loss is silent: change a setting in window A,
// change a different one in window B, and A's change is gone with no error.
// settingsStore's hydration gate guards the first frame and HMR; it cannot see
// a second process.
//
// The lock is keyed on the userData directory, so it must be requested AFTER the
// setPath above -- ask first and two copies take two different locks.
//
// `app.exit(0)`, not `app.quit()`: quit() is async, so a losing instance would
// run every module-scope side effect below -- the roaming migration, the session
// log, the settings manager, handler registration -- against the winner's
// directory before the event loop tore it down. exit() stops here. Keep this
// immediately after setPath; the further down it drifts, the more work a doomed
// instance does first.
if (!app.requestSingleInstanceLock()) app.exit(0)

// One-time roaming → local settings migration (Windows). Previously settings
// lived in %APPDATA%/Erisco/Taliesin; carry a returning user's settings over so
// active library / packs / preferences don't reset. Best-effort.
function migrateSettingsFromRoaming(): void {
  try {
    const oldDir = join(app.getPath('appData'), 'Erisco', 'Taliesin')
    if (oldDir === settingsPath) return // same location (non-Windows) — nothing to do
    const newPrimary = join(settingsPath, 'settings.json')
    if (existsSync(newPrimary)) return // already migrated or fresh local settings exist
    const oldPrimary = join(oldDir, 'settings.json')
    if (!existsSync(oldPrimary)) return // nothing to migrate
    mkdirSync(settingsPath, { recursive: true })
    copyFileSync(oldPrimary, newPrimary)
    const oldBackup = join(oldDir, 'settings.bak.json')
    if (existsSync(oldBackup)) copyFileSync(oldBackup, join(settingsPath, 'settings.bak.json'))
  } catch {
    /* best effort — settings manager falls back to defaults */
  }
}
migrateSettingsFromRoaming()

const settingsManager = createSettingsManager(settingsPath)

// Report Issue / diagnostics: capture uncaught main-process errors into the
// scrubbed per-session log, and touch this run's log file (keep-5 rotation) under
// <settingsPath>/logs. Wired up first so an error during boot is still captured.
// Both best-effort — a logging failure must never block startup.
installGlobalErrorHandlers(captureError)
void initSessionLog(join(settingsPath, 'logs'))

// Exported so tests can seed `blessedRoots` with the synthetic paths their
// in-memory filesystem uses. In production this is used purely internally.
export const ctx: HandlerContext = {
  settingsPath,
  settingsManager,
  appGetVersion: () => app.getVersion(),
  settingsRoots: new Set<string>(),
  blessedRoots: new Set<string>()
}

// Hydrate ctx.settingsRoots from the persisted settings as soon as we boot
// so the first IPC call from the renderer can already see active library /
// pack / music dirs etc. as authorised paths.
settingsManager.load().then((s) => {
  applySettingsRoots(ctx, s)
  // Scan installed .datf packs up front so the first map render can already
  // resolve static_tiles / world_maps overrides.
  void loadPacks({ brigidAssetsPath: s.brigidAssetsPath ?? null, clientPath: s.clientPath ?? null })
})

// Startup splash: shown immediately at boot, torn down once the renderer signals
// `app:ready` (settings hydrated) — see revealMainWindow() and the whenReady
// block below. A safety timeout backstops a renderer that never signals.
let mainWindow: BrowserWindow | null = null
let splash: SplashController | null = null
let mainWindowRevealed = false

// The splash owns the swap, not this function: `dismiss` shows the splash if it
// never got the chance, holds it for the remainder of a minimum-visible floor,
// then destroys it and calls back here. Revealing from the callback means the
// always-on-top splash is gone before the main window appears, rather than
// hovering over a live window.
function revealMainWindow(): void {
  if (mainWindowRevealed) return
  mainWindowRevealed = true
  const reveal = (): void => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    }
  }
  // `mainWindowRevealed` above already makes this run-once, and `dismiss` guards
  // its own re-entry, so there is no third guard to keep here.
  if (splash) splash.dismiss(reveal)
  else reveal()
}

// The other half of the lock: a second launch surfaces the window we already
// have instead of dying quietly, which is also what double-clicking the exe
// twice is expected to do.
//
// It does NOT reveal a window that has not been revealed yet. Before `app:ready`
// the main window is deliberately hidden behind the splash, which is alwaysOnTop
// and already on screen -- so the user is looking at this app booting, and
// forcing the unhydrated window forward would break the reveal handshake to
// show them less.
app.on('second-instance', () => {
  if (!mainWindowRevealed) return
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

// WHERE THE RENDERER LIVES, derived once. Two things read these: the trusted
// location set below, and createWindow's loader. They must agree, and the cost
// of disagreeing is not a subtle bug -- the guard would reject the very window
// it exists to allow, and the app would boot to a window in which every IPC
// fails. Deriving once is what makes that impossible; a comment asking two
// expressions to stay identical only asks nicely.
//
// `|| undefined` rather than `?? undefined`: an empty ELECTRON_RENDERER_URL must
// fall through to the packaged path, not be trusted as an origin.
// `is.dev` is `!app.isPackaged`, computed at import time, so module scope is
// safe -- and it is the right scope, because registerHandlers below also runs
// at module scope.
const RENDERER_DEV_URL = (is.dev && process.env['ELECTRON_RENDERER_URL']) || undefined
const RENDERER_INDEX_HTML = join(__dirname, '../renderer/index.html')

// Record the renderer locations we trust, BEFORE any window loads. The IPC guard
// fails closed against this list, so an empty or wrong list rejects every IPC.
initWindowSecurity(RENDERER_DEV_URL, RENDERER_INDEX_HTML)

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    // 256px PNG is the largest size any consumer of this option asks for; the
    // 1024px master would be decoded in full for nothing. PNG, not WebP -- this
    // one goes through nativeImage rather than Chromium.
    icon: join(__dirname, '../../resources/taliesin-icon-256.png'),
    // Stated explicitly rather than inherited: contextIsolation and
    // nodeIntegration are Electron's defaults, but a reader should not have to
    // know that to audit this block. `sandbox: true` became reachable once the
    // preload stopped importing @electron-toolkit/preload -- see the note in
    // src/preload/index.ts. Adding any package import back there breaks the
    // sandbox at run time in the PACKAGED app only; it builds and lints clean.
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow = win

  // A window keeps its native background — Electron's default white, because no
  // `backgroundColor` can be right for six themes of which two are light — while
  // the renderer's compositor tears down. That background is what paints for the
  // last frame or two before the window leaves the screen, which reads as a white
  // flash on quit. Hiding the window takes it off screen first; `close` runs
  // before the teardown, and the close itself proceeds as normal after this
  // returns. Covers every close path (title-bar button, Alt+F4, app quit),
  // because they all raise `close`.
  win.on('close', () => {
    win.hide()
  })

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
    // Backstop 3: the main window can die before the reveal. Without this the
    // splash is alwaysOnTop + skipTaskbar, so it strands as a floating window
    // the user cannot focus, close, or find in the taskbar.
    splash?.destroy()
    splash = null
  })

  win.on('maximize', () => {
    const { workArea } = screen.getDisplayMatching(win.getBounds())
    win.setBounds(workArea)
  })

  // Trusted before it loads: registerTrustedWindow is what lets this window's
  // IPC through guardIpc, and the guard fails closed, so registering after the
  // load would reject whatever the renderer sends during hydration.
  registerTrustedWindow(win)

  // Replaces an ungated setWindowOpenHandler that passed any URL straight to
  // shell.openExternal -- which honours file:, smb:, ms-msdt: and any custom
  // scheme registered on the machine, making it an OS-level open primitive
  // reachable from renderer content. Now: child windows denied, navigation away
  // from our own bundle denied, and only http/https/mailto handed to the OS.
  hardenWindow(win, (url) => shell.openExternal(url))

  // Under software compositing the themes' MuiPaper backdrop blur is the most
  // expensive thing on screen, so turning the GPU off and leaving it in place
  // would be half a fix. `dom-ready` fires before first paint, so there is no
  // flash of the blurred style. The failure is logged rather than thrown -- a
  // window that renders with one expensive effect still beats no window, and this
  // whole path is a performance mitigation rather than a correctness one.
  //
  // The splash is deliberately not a second call site: it has no MuiPaper and is
  // on screen for a moment.
  if (softwareRendering) {
    win.webContents.on('dom-ready', () => {
      win.webContents.insertCSS(REMOTE_SESSION_CSS).catch((err) => {
        console.warn('[display] remote-session CSS injection failed:', err?.message ?? err)
      })
    })
  }

  // Same two bindings initWindowSecurity was given, so the location we load and
  // the location we trust cannot disagree.
  if (RENDERER_DEV_URL) {
    win.loadURL(RENDERER_DEV_URL)
  } else {
    win.loadFile(RENDERER_INDEX_HTML).catch((err) => {
      console.error('Failed to load file:', err)
    })
  }
}

// Reveal the main window (and dismiss the splash) once the renderer reports it
// has hydrated its settings — see the `app:ready` IPC handler in handlers.ts.
ctx.onAppReady = revealMainWindow

// Reveal settings.json in the OS file manager (Settings → About). `shell` and
// the settings path live here, so the handler in handlers.ts delegates back.
ctx.revealSettings = () => shell.showItemInFolder(join(settingsPath, 'settings.json'))

app.whenReady().then(() => {
  electronApp.setAppUserModelId('co.eris.taliesin')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Before the first window, and it has to be: the header governs a RESPONSE, so
  // a document already loading has gone past it. `session.defaultSession` does
  // not exist until the app is ready, which is why this is here rather than at
  // module scope beside initWindowSecurity.
  // The dev server needs a looser script-src than the packaged app: Vite's React
  // plugin injects its refresh preamble as an inline script. `RENDERER_DEV_URL`
  // rather than `is.dev` alone, so a dev build that is NOT being served by Vite
  // still gets the real policy. See DEV_RENDERER_CSP.
  installContentSecurityPolicy(
    session.defaultSession,
    RENDERER_DEV_URL ? DEV_RENDERER_CSP : RENDERER_CSP
  )

  // Splash first so the user sees branded feedback instantly, then the (hidden)
  // main window loads behind it. The splash is torn down on `app:ready`.
  splash = createSplashWindow()
  createWindow()

  // Safety backstop: if the renderer errors before signalling `app:ready`, force
  // the window visible so the app can never be left permanently invisible.
  setTimeout(revealMainWindow, 15000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindowRevealed = false
      splash = createSplashWindow()
      createWindow()
      setTimeout(revealMainWindow, 15000)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Every handler registers through the guarded proxy, never the raw `ipcMain`,
// so the sender check applies by construction rather than by each handler
// remembering to ask for it. The corollary: a handler registered on the raw
// `ipcMain` silently opts OUT of the check. Keep this the only call site.
registerHandlers({ ipcMain: guardIpc(ipcMain), BrowserWindow, dialog }, ctx)
