import { app, shell, BrowserWindow, ipcMain, dialog, screen } from 'electron'
import { join, dirname } from 'path'
import { promises as fs } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn } from 'child_process'
import { createSettingsManager } from './settingsManager'
import { buildIndex, loadIndex, saveIndex, getIndexStatus, deleteIndex } from '@eriscorp/hybindex-ts'
import { resolveLibraryPath } from './libraryPath'

// Settings in %APPDATA%/Erisco/Taliesin (roaming), cache in %LOCALAPPDATA%/Erisco/Taliesin (local)
const settingsPath = join(app.getPath('appData'), 'Erisco', 'Taliesin')
const cachePath = join(app.getPath('cache'), 'Erisco', 'Taliesin')
app.setPath('userData', cachePath)

const settingsManager = createSettingsManager(settingsPath)

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
ipcMain.handle('get-user-data-path', () => settingsPath)

// ── Companion app launch ─────────────────────────────────────────────────────

ipcMain.handle('app:launchCompanion', async (_, exePath: string) => {
  try {
    await fs.access(exePath)
    spawn(exePath, [], { detached: true, stdio: 'ignore' }).unref()
    return true
  } catch {
    return false
  }
})

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

ipcMain.handle('dialog:saveFile', async (_, filters?: Electron.FileFilter[], defaultPath?: string) => {
  const result = await dialog.showSaveDialog({
    filters: filters ?? [{ name: 'All Files', extensions: ['*'] }],
    defaultPath: defaultPath ?? undefined,
  })
  return result.filePath ?? null
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

ipcMain.handle('app:getVersion', async () => {
  // app.getVersion() returns Electron's version in dev mode; read package.json directly
  try {
    const pkgPath = join(__dirname, '../../package.json')
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'))
    return pkg.version ?? app.getVersion()
  } catch {
    return app.getVersion()
  }
})

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

ipcMain.handle('fs:writeBytes', async (_, filePath: string, data: Uint8Array) => {
  await fs.mkdir(dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, Buffer.from(data))
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

ipcMain.handle('fs:deleteFile', async (_, filePath: string) => {
  await fs.unlink(filePath)
})

/** Returns the list of entry names inside a .dat archive (for diagnostics). */
ipcMain.handle('fs:listArchive', async (_, filePath: string) => {
  const { DataArchive } = await import('@eriscorp/dalib-ts')
  const buf = await fs.readFile(filePath)
  const archive = DataArchive.fromBuffer(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
  return archive.entries.map(e => e.entryName)
})

// ── Music Manager ─────────────────────────────────────────────────────────────

const MUSIC_SOURCE_EXTS = new Set(['.mp3', '.ogg', '.mus', '.wav', '.flac'])

/**
 * Find a TXXX user-defined text frame by description (e.g. "PROMPT") across
 * ID3v2.3 / ID3v2.4 native tag lists. music-metadata surfaces TXXX entries
 * either with id "TXXX:<desc>" (flattened) or id "TXXX" with value.description.
 */
function findTxxxFrame(native: Record<string, { id: string; value: unknown }[]> | undefined, desc: string): string | null {
  if (!native) return null
  const wantedId = `TXXX:${desc}`
  for (const entries of Object.values(native)) {
    for (const entry of entries) {
      if (entry.id === wantedId) {
        const v = entry.value
        if (typeof v === 'string') return v
        if (v && typeof v === 'object' && 'text' in v) {
          const t = (v as { text: unknown }).text
          if (Array.isArray(t)) return t.join('\n')
          if (typeof t === 'string') return t
        }
        return null
      }
      if (entry.id === 'TXXX' && entry.value && typeof entry.value === 'object') {
        const v = entry.value as { description?: string; text?: unknown }
        if (v.description === desc) {
          if (Array.isArray(v.text)) return v.text.join('\n')
          if (typeof v.text === 'string') return v.text
        }
      }
    }
  }
  return null
}

ipcMain.handle('music:readFileMeta', async (_, filePath: string) => {
  try {
    const { parseBuffer } = await import('music-metadata')
    const buf = await fs.readFile(filePath)
    const meta = await parseBuffer(buf, undefined, { duration: true, skipCovers: true })
    const { title, artist, genre, album } = meta.common
    const { duration, bitrate, sampleRate, numberOfChannels } = meta.format
    // music-metadata returns genre as string[]; flatten to a single joined string
    const genreStr = Array.isArray(genre) ? genre.join(', ') : (genre ?? null)
    const prompt = findTxxxFrame(meta.native as Record<string, { id: string; value: unknown }[]>, 'PROMPT')
    return {
      title:      title        ?? null,
      artist:     artist       ?? null,
      genre:      genreStr     || null,
      album:      album        ?? null,
      duration:   duration     ?? null,
      bitrate:    bitrate      ?? null,
      sampleRate: sampleRate   ?? null,
      channels:   numberOfChannels ?? null,
      prompt:     prompt?.trim() || null,
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
  const { DataArchive } = await import('@eriscorp/dalib-ts')
  const legendPath = join(clientPath, 'legend.dat')
  const buf = await fs.readFile(legendPath)
  const archive = DataArchive.fromBuffer(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
  return archive.entries
    .filter((e) => e.entryName.toLowerCase().endsWith('.mp3'))
    .map((e) => ({ entryName: e.entryName, sizeBytes: e.fileSize }))
})

ipcMain.handle('sfx:readEntry', async (_, clientPath: string, entryName: string) => {
  const { DataArchive } = await import('@eriscorp/dalib-ts')
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
  return loadIndex(libraryRoot)
})

ipcMain.handle('index:build', async (_, libraryRoot: string) => {
  const idx = await buildIndex(libraryRoot)
  await saveIndex(libraryRoot, idx)
  return idx
})

ipcMain.handle('index:status', async (_, libraryRoot: string) => {
  return getIndexStatus(libraryRoot)
})

ipcMain.handle('library:resolve', async (_, selectedPath: string) => {
  return resolveLibraryPath(selectedPath)
})

ipcMain.handle('index:delete', async (_, libraryRoot: string) => {
  return deleteIndex(libraryRoot)
})

// ── Prefabs ──────────────────────────────────────────────────────────────────

function prefabDir(libraryPath: string): string {
  return join(libraryPath, '..', '.creidhne', 'prefabs')
}

ipcMain.handle('prefab:list', async (_, libraryPath: string) => {
  const dir = prefabDir(libraryPath)
  try {
    await fs.mkdir(dir, { recursive: true })
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const summaries = []
    for (const e of entries.filter(e => e.isFile() && e.name.endsWith('.json'))) {
      try {
        const raw = await fs.readFile(join(dir, e.name), 'utf-8')
        const data = JSON.parse(raw)
        summaries.push({
          filename: e.name,
          name: data.name ?? e.name.replace(/\.json$/, ''),
          width: data.width ?? 0,
          height: data.height ?? 0,
          createdAt: data.createdAt ?? '',
          updatedAt: data.updatedAt ?? '',
        })
      } catch { /* skip malformed */ }
    }
    return summaries
  } catch {
    return []
  }
})

ipcMain.handle('prefab:load', async (_, libraryPath: string, filename: string) => {
  const p = join(prefabDir(libraryPath), filename)
  const raw = await fs.readFile(p, 'utf-8')
  return JSON.parse(raw)
})

ipcMain.handle('prefab:save', async (_, libraryPath: string, filename: string, data: unknown) => {
  const dir = prefabDir(libraryPath)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(join(dir, filename), JSON.stringify(data, null, 2), 'utf-8')
})

ipcMain.handle('prefab:delete', async (_, libraryPath: string, filename: string) => {
  await fs.unlink(join(prefabDir(libraryPath), filename))
})

ipcMain.handle('prefab:rename', async (_, libraryPath: string, oldName: string, newName: string) => {
  const dir = prefabDir(libraryPath)
  await fs.rename(join(dir, oldName), join(dir, newName))
})

// ── Asset Packs (.datf) ──────────────────────────────────────────────────────

ipcMain.handle('pack:scan', async (_, dirPath: string) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const packs = []
    for (const e of entries.filter(e => e.isFile() && e.name.endsWith('.json'))) {
      try {
        const raw = await fs.readFile(join(dirPath, e.name), 'utf-8')
        const data = JSON.parse(raw)
        if (data.pack_id && data.content_type) {
          packs.push({ filename: e.name, ...data })
        }
      } catch { /* skip malformed */ }
    }
    return packs
  } catch {
    return []
  }
})

ipcMain.handle('pack:load', async (_, filePath: string) => {
  const raw = await fs.readFile(filePath, 'utf-8')
  return JSON.parse(raw)
})

ipcMain.handle('pack:save', async (_, filePath: string, data: unknown) => {
  await fs.mkdir(dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
})

ipcMain.handle('pack:delete', async (_, filePath: string) => {
  await fs.unlink(filePath)
})

ipcMain.handle('pack:addAsset', async (_, packDir: string, sourcePath: string, targetFilename: string) => {
  await fs.mkdir(packDir, { recursive: true })
  await fs.copyFile(sourcePath, join(packDir, targetFilename))
})

ipcMain.handle('pack:removeAsset', async (_, packDir: string, filename: string) => {
  try { await fs.unlink(join(packDir, filename)) } catch { /* already gone */ }
})

ipcMain.handle('pack:compile', async (_, packDir: string, manifest: unknown, assetFilenames: string[], outputPath: string) => {
  const archiver = (await import('archiver')).default
  const { createWriteStream } = await import('fs')

  return new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outputPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => resolve())
    archive.on('error', (err: Error) => reject(err))

    archive.pipe(output)
    archive.append(JSON.stringify(manifest, null, 2), { name: '_manifest.json' })
    for (const filename of assetFilenames) {
      archive.file(join(packDir, filename), { name: filename })
    }
    archive.finalize()
  })
})

// ── Palettes & Duotone ──────────────────────────────────────────────────────

const palettesSubdir = (packDir: string) => join(packDir, '_palettes')
const calibrationsSubdir = (packDir: string) => join(packDir, '_calibrations')

ipcMain.handle('palette:scan', async (_, packDir: string) => {
  try {
    const dir = palettesSubdir(packDir)
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const palettes: { filename: string; id: string; name: string; entryCount: number }[] = []
    for (const e of entries.filter(e => e.isFile() && e.name.endsWith('.json'))) {
      try {
        const raw = await fs.readFile(join(dir, e.name), 'utf-8')
        const data = JSON.parse(raw)
        if (data.id && Array.isArray(data.entries)) {
          palettes.push({ filename: e.name, id: data.id, name: data.name ?? data.id, entryCount: data.entries.length })
        }
      } catch { /* skip malformed */ }
    }
    return palettes.sort((a, b) => a.id.localeCompare(b.id))
  } catch {
    return []
  }
})

ipcMain.handle('palette:load', async (_, filePath: string) => {
  const raw = await fs.readFile(filePath, 'utf-8')
  return JSON.parse(raw)
})

ipcMain.handle('palette:save', async (_, filePath: string, data: unknown) => {
  await fs.mkdir(dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
})

ipcMain.handle('palette:delete', async (_, filePath: string) => {
  try { await fs.unlink(filePath) } catch { /* already gone */ }
})

ipcMain.handle('palette:calibrationLoad', async (_, packDir: string, paletteId: string) => {
  const path = join(calibrationsSubdir(packDir), `${paletteId}.json`)
  try {
    const raw = await fs.readFile(path, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
})

ipcMain.handle('palette:calibrationSave', async (_, packDir: string, paletteId: string, data: unknown) => {
  const dir = calibrationsSubdir(packDir)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(join(dir, `${paletteId}.json`), JSON.stringify(data, null, 2), 'utf-8')
})

ipcMain.handle('frame:scan', async (_, packDir: string) => {
  const dir = join(packDir, '_frames')
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    return entries
      .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.png'))
      .map(e => e.name)
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
})

// ── Tile Frequency Scanner ──────────────────────────────────────────────────

ipcMain.handle('tileScan:analyze', async (_, dirPaths: string[]) => {
  const bgFreq = new Map<number, number>()
  const lfgFreq = new Map<number, number>()
  const rfgFreq = new Map<number, number>()
  let fileCount = 0
  let tileCount = 0

  for (const dirPath of dirPaths) {
    let entries: Awaited<ReturnType<typeof fs.readdir>>
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true })
    } catch {
      continue
    }
    const mapFiles = entries.filter(e => e.isFile() && /\.map$/i.test(e.name))

    for (const entry of mapFiles) {
      try {
        const buf = await fs.readFile(join(dirPath, entry.name))
        const totalTiles = Math.floor(buf.length / 6)
        fileCount++
        tileCount += totalTiles

        for (let i = 0; i < totalTiles; i++) {
          const offset = i * 6
          const bg = buf.readInt16LE(offset)
          const lfg = buf.readInt16LE(offset + 2)
          const rfg = buf.readInt16LE(offset + 4)
          if (bg !== 0) bgFreq.set(bg, (bgFreq.get(bg) ?? 0) + 1)
          if (lfg !== 0) lfgFreq.set(lfg, (lfgFreq.get(lfg) ?? 0) + 1)
          if (rfg !== 0) rfgFreq.set(rfg, (rfgFreq.get(rfg) ?? 0) + 1)
        }
      } catch { /* skip unreadable files */ }
    }
  }

  const sortAndCap = (m: Map<number, number>, cap: number): [number, number][] =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, cap)

  return {
    background: sortAndCap(bgFreq, 200),
    leftForeground: sortAndCap(lfgFreq, 200),
    rightForeground: sortAndCap(rfgFreq, 200),
    fileCount,
    tileCount,
  }
})

// ── Tile Themes ─────────────────────────────────────────────────────────────

const themeDir = join(settingsPath, 'themes')

ipcMain.handle('theme:list', async () => {
  try {
    await fs.mkdir(themeDir, { recursive: true })
    const entries = await fs.readdir(themeDir, { withFileTypes: true })
    const summaries = []
    for (const e of entries.filter(e => e.isFile() && e.name.endsWith('.json'))) {
      try {
        const raw = await fs.readFile(join(themeDir, e.name), 'utf-8')
        const data = JSON.parse(raw)
        summaries.push({
          filename: e.name,
          name: data.name ?? e.name.replace(/\.json$/, ''),
        })
      } catch { /* skip malformed */ }
    }
    return summaries
  } catch {
    return []
  }
})

ipcMain.handle('theme:load', async (_, filename: string) => {
  const raw = await fs.readFile(join(themeDir, filename), 'utf-8')
  return JSON.parse(raw)
})

ipcMain.handle('theme:save', async (_, filename: string, data: unknown) => {
  await fs.mkdir(themeDir, { recursive: true })
  await fs.writeFile(join(themeDir, filename), JSON.stringify(data, null, 2), 'utf-8')
})

ipcMain.handle('theme:delete', async (_, filename: string) => {
  await fs.unlink(join(themeDir, filename))
})
