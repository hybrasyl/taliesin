import { app, shell, BrowserWindow, ipcMain, dialog, screen } from 'electron'
import { join, dirname } from 'path'
import { promises as fs } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
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

  mainWindow.on('maximize', () => {
    const { workArea } = screen.getDisplayMatching(mainWindow.getBounds())
    mainWindow.setBounds(workArea)
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

// ── Music Manager ─────────────────────────────────────────────────────────────

const MUSIC_SOURCE_EXTS = new Set(['.mp3', '.ogg', '.mus', '.wav', '.flac'])

ipcMain.handle('music:readFileMeta', async (_, filePath: string) => {
  try {
    const { parseBuffer } = await import('music-metadata')
    const buf = await fs.readFile(filePath)
    const meta = await parseBuffer(buf, undefined, { duration: false, skipCovers: true })
    const { title, artist, genre, album } = meta.common
    return {
      title:  title  ?? null,
      artist: artist ?? null,
      genre:  genre  ?? null,
      album:  album  ?? null,
    }
  } catch {
    return null
  }
})

async function scanMusicDir(
  rootDir: string,
  relDir = ''
): Promise<{ filename: string; sizeBytes: number }[]> {
  const absDir = relDir ? join(rootDir, relDir) : rootDir
  const entries = await fs.readdir(absDir, { withFileTypes: true })

  const nested = await Promise.all(
    entries.map(async (e): Promise<{ filename: string; sizeBytes: number }[]> => {
      const relPath = relDir ? `${relDir}/${e.name}` : e.name
      if (e.isDirectory()) {
        return scanMusicDir(rootDir, relPath)
      }
      const ext = e.name.slice(e.name.lastIndexOf('.')).toLowerCase()
      if (MUSIC_SOURCE_EXTS.has(ext)) {
        const stat = await fs.stat(join(absDir, e.name))
        return [{ filename: relPath, sizeBytes: stat.size }]
      }
      return []
    })
  )

  return nested.flat()
}

ipcMain.handle('music:scan', async (_, dirPath: string) => {
  return scanMusicDir(dirPath)
})

ipcMain.handle('music:metadata:load', async (_, dirPath: string) => {
  const p = join(dirPath, 'music-library.json')
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8'))
  } catch {
    return {}
  }
})

ipcMain.handle('music:metadata:save', async (_, dirPath: string, data: unknown) => {
  const p = join(dirPath, 'music-library.json')
  await fs.mkdir(dirname(p), { recursive: true })
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf-8')
})

ipcMain.handle('music:packs:load', async (_, dirPath: string) => {
  const p = join(dirPath, 'music-packs.json')
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8'))
  } catch {
    return []
  }
})

ipcMain.handle('music:packs:save', async (_, dirPath: string, packs: unknown) => {
  const p = join(dirPath, 'music-packs.json')
  await fs.mkdir(dirname(p), { recursive: true })
  await fs.writeFile(p, JSON.stringify(packs, null, 2), 'utf-8')
})

interface DeployTrack { musicId: number; sourceFile: string }
interface DeployPack  { id: string; name: string; description?: string; tracks: DeployTrack[] }

async function deployTrack(
  srcPath: string,
  destPath: string,
  ffmpegBin: string,
  kbps: number,
  sampleRate: number
): Promise<void> {
  // Always re-encode to enforce consistent DA client format regardless of source.
  // MP3→MP3 generation loss is negligible when downsampling to 64kbps anyway.
  await execFileAsync(ffmpegBin, [
    '-y',
    '-i', srcPath,
    '-codec:a', 'libmp3lame',
    '-b:a', `${kbps}k`,
    '-ar', String(sampleRate),
    destPath,
  ])
}

ipcMain.handle('music:deploy-pack', async (
  _,
  srcLibDir: string,
  pack: DeployPack,
  destDir: string,
  ffmpegPath: string | null,
  musEncodeKbps: number,
  musEncodeSampleRate: number
) => {
  const ffmpegBin = ffmpegPath || 'ffmpeg'

  // Ensure dest exists, then clear all files in it (not subdirs)
  await fs.mkdir(destDir, { recursive: true })
  const existing = await fs.readdir(destDir, { withFileTypes: true })
  await Promise.all(
    existing
      .filter((e) => !e.isDirectory())
      .map((e) => fs.unlink(join(destDir, e.name)))
  )

  // Deploy each track — copy MP3/MUS directly, encode WAV/OGG via ffmpeg
  await Promise.all(
    pack.tracks.map((track) =>
      deployTrack(
        join(srcLibDir, track.sourceFile),
        join(destDir, `${track.musicId}.mus`),
        ffmpegBin,
        musEncodeKbps,
        musEncodeSampleRate
      )
    )
  )

  // Write sidecar manifest
  const manifest = {
    packId: pack.id,
    packName: pack.name,
    exportedAt: new Date().toISOString(),
    tracks: pack.tracks.map((t) => ({ id: t.musicId, sourceFile: t.sourceFile })),
  }
  await fs.writeFile(join(destDir, 'music-pack.json'), JSON.stringify(manifest, null, 2), 'utf-8')
})

ipcMain.handle('music:client:scan', async (_, clientPath: string) => {
  const musicDir = join(clientPath, 'music')
  try {
    const entries = await fs.readdir(musicDir, { withFileTypes: true })
    const files = entries.filter(
      (e) => !e.isDirectory() && /^\d+\.mus$/i.test(e.name)
    )
    return Promise.all(
      files.map(async (e) => {
        const stat = await fs.stat(join(musicDir, e.name))
        return { filename: e.name, sizeBytes: stat.size }
      })
    )
  } catch {
    return []
  }
})

// ── Sound Effects ─────────────────────────────────────────────────────────────

ipcMain.handle('sfx:list', async (_, clientPath: string) => {
  const { DataArchive } = await import('dalib-ts')
  const legendPath = join(clientPath, 'legend.dat')
  const buf = await fs.readFile(legendPath)
  const archive = DataArchive.fromBuffer(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
  return archive.entries
    .filter((e) => e.entryName.toLowerCase().endsWith('.mp3'))
    .map((e) => ({ entryName: e.entryName, sizeBytes: e.fileSize }))
})

ipcMain.handle('sfx:readEntry', async (_, clientPath: string, entryName: string) => {
  const { DataArchive } = await import('dalib-ts')
  const legendPath = join(clientPath, 'legend.dat')
  const buf = await fs.readFile(legendPath)
  const archive = DataArchive.fromBuffer(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
  const entry = archive.get(entryName)
  if (!entry) throw new Error(`Entry not found: ${entryName}`)
  return Buffer.from(archive.getEntryBuffer(entry))
})

// sfx index is stored at <libraryRoot>/world/sfx-index.json
// activeLibrary passed in is <libraryRoot>/world/xml — go up one level
ipcMain.handle('sfx:index:load', async (_, activeLibrary: string) => {
  const p = join(activeLibrary, '..', 'sfx-index.json')
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8'))
  } catch {
    return {}
  }
})

ipcMain.handle('sfx:index:save', async (_, activeLibrary: string, data: unknown) => {
  const p = join(activeLibrary, '..', 'sfx-index.json')
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf-8')
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
