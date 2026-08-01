import { app, shell, BrowserWindow, ipcMain, dialog, screen } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, copyFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createSettingsManager } from './settingsManager'
import { registerHandlers, applySettingsRoots, type HandlerContext } from './handlers'
import { loadPacks } from './assetPacks'
import { createSplashWindow } from './splash'
import { initSessionLog, captureError } from './report/sessionLog'
import { installGlobalErrorHandlers } from './report/errorHandlers'
import {
  initWindowSecurity,
  registerTrustedWindow,
  hardenWindow,
  guardIpc
} from './windowSecurity'

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
let splashWindow: BrowserWindow | null = null
let mainWindowRevealed = false

function revealMainWindow(): void {
  if (mainWindowRevealed) return
  mainWindowRevealed = true
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
  }
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy()
  splashWindow = null
}

// Record the renderer locations we trust, BEFORE any window loads. The IPC guard
// fails closed against this list, so an empty or wrong list rejects every IPC --
// the safe direction, but it makes this call load-bearing. The dev/prod
// expression below MUST stay textually identical to createWindow's loader
// branch; it sits here rather than 30 lines away so the two cannot drift apart
// unnoticed. `is.dev` is `!app.isPackaged`, computed at import time, so module
// scope is safe -- and it is the right scope, because registerHandlers below
// also runs at module scope.
initWindowSecurity(
  is.dev && process.env['ELECTRON_RENDERER_URL'] ? process.env['ELECTRON_RENDERER_URL'] : undefined,
  join(__dirname, '../renderer/index.html')
)

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

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
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
  hardenWindow(win, { allowExternal: true, openExternal: (url) => shell.openExternal(url) })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html')).catch((err) => {
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

  // Splash first so the user sees branded feedback instantly, then the (hidden)
  // main window loads behind it. The splash is torn down on `app:ready`.
  splashWindow = createSplashWindow()
  createWindow()

  // Safety backstop: if the renderer errors before signalling `app:ready`, force
  // the window visible so the app can never be left permanently invisible.
  setTimeout(revealMainWindow, 15000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindowRevealed = false
      splashWindow = createSplashWindow()
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
