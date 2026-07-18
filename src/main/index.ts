import { app, shell, BrowserWindow, ipcMain, dialog, screen } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, copyFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createSettingsManager } from './settingsManager'
import { registerHandlers, applySettingsRoots, type HandlerContext } from './handlers'
import { loadPacks } from './assetPacks'
import { createSplashWindow } from './splash'

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

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    icon: join(__dirname, '../../resources/taliesin.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
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

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

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

registerHandlers({ ipcMain, BrowserWindow, dialog }, ctx)
