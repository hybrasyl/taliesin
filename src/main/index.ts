import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createSettingsManager } from './settingsManager'

let userDataPath: string

if (process.platform === 'win32') {
  userDataPath = join(app.getPath('home'), 'AppData', 'Local', 'Erisco', 'Taliesin')
} else {
  userDataPath = join(app.getPath('appData'), 'Erisco', 'Taliesin')
}

app.setPath('userData', userDataPath)

const settingsManager = createSettingsManager(userDataPath)

function createWindow(): void {
  const mainWindow = new BrowserWindow({
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

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html')).catch((err) => {
      console.error('Failed to load file:', err)
    })
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.hybrasyl.taliesin')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── Window controls ──────────────────────────────────────────────────────────

ipcMain.on('minimize-window', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.minimize()
})

ipcMain.on('maximize-window', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  win?.isMaximized() ? win.unmaximize() : win?.maximize()
})

ipcMain.on('close-window', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.close()
})

// ── Settings ─────────────────────────────────────────────────────────────────

ipcMain.handle('settings:load', () => settingsManager.load())
ipcMain.handle('settings:save', (_, settings) => settingsManager.save(settings))
ipcMain.handle('get-user-data-path', () => userDataPath)

// ── File system ───────────────────────────────────────────────────────────────

ipcMain.handle('dialog:openFile', async (_, filters?: Electron.FileFilter[]) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: filters ?? [{ name: 'All Files', extensions: ['*'] }]
  })
  return result.filePaths[0] ?? null
})

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.filePaths[0] ?? null
})

ipcMain.handle('fs:readFile', async (_, filePath: string) => {
  const buffer = await fs.readFile(filePath)
  // Transfer as Uint8Array so dalib-ts can parse it in the renderer
  return buffer
})

ipcMain.handle('fs:listDir', async (_, dirPath: string) => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }))
})

ipcMain.handle('app:getVersion', () => app.getVersion())
