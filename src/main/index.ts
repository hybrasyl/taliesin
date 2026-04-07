import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, dirname } from 'path'
import { promises as fs } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createSettingsManager } from './settingsManager'
import { buildWorldIndex, readWorldIndex, getIndexStatus, deleteWorldIndex, resolveLibraryPath } from './indexBuilder'

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

// ── Catalog ───────────────────────────────────────────────────────────────────

/**
 * Resolve where to store the catalog for a given map directory.
 *
 * If the directory is named "mapfiles" (standard Hybrasyl layout: world/mapfiles/),
 * store alongside the world index at world/.creidhne/map-catalog.json.
 *
 * Otherwise store directly in the chosen directory as map-catalog.json.
 */
function getCatalogPath(dirPath: string): string {
  const folderName = dirPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop()?.toLowerCase() ?? ''
  if (folderName === 'mapfiles') {
    return join(dirPath, '..', '.creidhne', 'map-catalog.json')
  }
  return join(dirPath, 'map-catalog.json')
}

ipcMain.handle('catalog:load', async (_, dirPath: string) => {
  const p = getCatalogPath(dirPath)
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8'))
  } catch {
    return {}
  }
})

ipcMain.handle('catalog:save', async (_, dirPath: string, data: unknown) => {
  const p = getCatalogPath(dirPath)
  await fs.mkdir(dirname(p), { recursive: true })
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf-8')
})

ipcMain.handle('catalog:scan', async (_, dirPath: string) => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const maps = entries.filter(
    (e) => !e.isDirectory() && /^lod\d+(?:-[^.]+)?\.map$/i.test(e.name)
  )
  return Promise.all(
    maps.map(async (e) => {
      const stat = await fs.stat(join(dirPath, e.name))
      return { filename: e.name, sizeBytes: stat.size }
    })
  )
})

// ── Extended FS ───────────────────────────────────────────────────────────────

ipcMain.handle('fs:copyFile', async (_, src: string, dst: string) => {
  await fs.mkdir(dirname(dst), { recursive: true })
  await fs.copyFile(src, dst)
})

ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string) => {
  await fs.mkdir(dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
})

ipcMain.handle('fs:exists', async (_, filePath: string) => {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
})

ipcMain.handle('fs:ensureDir', async (_, dirPath: string) => {
  await fs.mkdir(dirPath, { recursive: true })
})

/** Returns the list of entry names inside a .dat archive (for diagnostics). */
ipcMain.handle('fs:listArchive', async (_, filePath: string) => {
  const { DataArchive } = await import('dalib-ts')
  const buf = await fs.readFile(filePath)
  const archive = DataArchive.fromBuffer(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
  return archive.entries.map(e => e.entryName)
})

// ── World index ───────────────────────────────────────────────────────────────

ipcMain.handle('index:read', async (_, libraryRoot: string) => {
  return readWorldIndex(libraryRoot)
})

ipcMain.handle('index:build', async (_, libraryRoot: string) => {
  return buildWorldIndex(libraryRoot)
})

ipcMain.handle('index:status', async (_, libraryRoot: string) => {
  return getIndexStatus(libraryRoot)
})

ipcMain.handle('library:resolve', async (_, selectedPath: string) => {
  return resolveLibraryPath(selectedPath)
})

ipcMain.handle('index:delete', async (_, libraryRoot: string) => {
  return deleteWorldIndex(libraryRoot)
})
