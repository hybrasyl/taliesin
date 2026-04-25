/**
 * IPC handler bodies as plain async functions.
 *
 * Each function takes only its data arguments (no IPC event), so tests can
 * import and call them directly. `registerHandlers` wires every function up
 * to its channel via the supplied `ipcMain` and `BrowserWindow` references.
 */
import type { IpcMain, BrowserWindow as BrowserWindowType } from 'electron'
import { join, dirname } from 'path'
import { promises as fs } from 'fs'
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { buildIndex, loadIndex, saveIndex, getIndexStatus, deleteIndex } from '@eriscorp/hybindex-ts'
import { resolveLibraryPath } from './libraryPath'
import { assertInside } from './pathSafety'
import type { createSettingsManager } from './settingsManager'

const execFileAsync = promisify(execFile)

export interface HandlerContext {
  settingsPath: string
  settingsManager: ReturnType<typeof createSettingsManager>
  appGetVersion: () => string
}

// ── Settings / app ───────────────────────────────────────────────────────────

export async function loadSettings(ctx: HandlerContext) {
  return ctx.settingsManager.load()
}

export async function saveSettings(ctx: HandlerContext, settings: unknown) {
  return ctx.settingsManager.save(settings as Parameters<HandlerContext['settingsManager']['save']>[0])
}

export function getUserDataPath(ctx: HandlerContext): string {
  return ctx.settingsPath
}

export async function launchCompanion(exePath: string): Promise<boolean> {
  try {
    await fs.access(exePath)
    spawn(exePath, [], { detached: true, stdio: 'ignore' }).unref()
    return true
  } catch {
    return false
  }
}

export async function getAppVersion(ctx: HandlerContext): Promise<string> {
  try {
    const pkgPath = join(__dirname, '../../package.json')
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'))
    return pkg.version ?? ctx.appGetVersion()
  } catch {
    return ctx.appGetVersion()
  }
}

// ── File system ──────────────────────────────────────────────────────────────

export async function readFile(filePath: string): Promise<Buffer> {
  return fs.readFile(filePath)
}

export async function listDir(dirPath: string): Promise<{ name: string; isDirectory: boolean }[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }))
}

export async function copyFile(src: string, dst: string): Promise<void> {
  await fs.mkdir(dirname(dst), { recursive: true })
  await fs.copyFile(src, dst)
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
}

export async function writeBytes(filePath: string, data: Uint8Array): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, Buffer.from(data))
}

export async function exists(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true } catch { return false }
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

export async function deleteFile(filePath: string): Promise<void> {
  await fs.unlink(filePath)
}

export async function listArchive(filePath: string): Promise<string[]> {
  const { DataArchive } = await import('@eriscorp/dalib-ts')
  const buf = await fs.readFile(filePath)
  const archive = DataArchive.fromBuffer(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
  return archive.entries.map((e) => e.entryName)
}

// ── Catalog ──────────────────────────────────────────────────────────────────

/**
 * Resolve where to store the catalog for a given map directory.
 * If named "mapfiles", store under sibling .creidhne/. Otherwise store inline.
 */
function getCatalogPath(dirPath: string): string {
  const folderName = dirPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop()?.toLowerCase() ?? ''
  if (folderName === 'mapfiles') {
    return join(dirPath, '..', '.creidhne', 'map-catalog.json')
  }
  return join(dirPath, 'map-catalog.json')
}

export async function catalogLoad(dirPath: string): Promise<Record<string, unknown>> {
  const p = getCatalogPath(dirPath)
  try { return JSON.parse(await fs.readFile(p, 'utf-8')) } catch { return {} }
}

export async function catalogSave(dirPath: string, data: unknown): Promise<void> {
  const p = getCatalogPath(dirPath)
  await fs.mkdir(dirname(p), { recursive: true })
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf-8')
}

export async function catalogScan(dirPath: string): Promise<{ filename: string; sizeBytes: number }[]> {
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
}

// ── Music ────────────────────────────────────────────────────────────────────

const MUSIC_SOURCE_EXTS = new Set(['.mp3', '.ogg', '.mus', '.wav', '.flac'])

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

export async function musicReadFileMeta(filePath: string) {
  try {
    const { parseBuffer } = await import('music-metadata')
    const buf = await fs.readFile(filePath)
    const meta = await parseBuffer(buf, undefined, { duration: true, skipCovers: true })
    const { title, artist, genre, album } = meta.common
    const { duration, bitrate, sampleRate, numberOfChannels } = meta.format
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
}

async function scanMusicDir(rootDir: string, relDir = ''): Promise<{ filename: string; sizeBytes: number }[]> {
  const absDir = relDir ? join(rootDir, relDir) : rootDir
  const entries = await fs.readdir(absDir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (e): Promise<{ filename: string; sizeBytes: number }[]> => {
      const relPath = relDir ? `${relDir}/${e.name}` : e.name
      if (e.isDirectory()) return scanMusicDir(rootDir, relPath)
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

export async function musicScan(dirPath: string) {
  try { return await scanMusicDir(dirPath) }
  catch { return [] }
}

export async function musicMetadataLoad(dirPath: string): Promise<Record<string, unknown>> {
  const p = join(dirPath, 'music-library.json')
  try { return JSON.parse(await fs.readFile(p, 'utf-8')) } catch { return {} }
}

export async function musicMetadataSave(dirPath: string, data: unknown): Promise<void> {
  const p = join(dirPath, 'music-library.json')
  await fs.mkdir(dirname(p), { recursive: true })
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf-8')
}

export async function musicPacksLoad(dirPath: string): Promise<unknown> {
  const p = join(dirPath, 'music-packs.json')
  try { return JSON.parse(await fs.readFile(p, 'utf-8')) } catch { return [] }
}

export async function musicPacksSave(dirPath: string, packs: unknown): Promise<void> {
  const p = join(dirPath, 'music-packs.json')
  await fs.mkdir(dirname(p), { recursive: true })
  await fs.writeFile(p, JSON.stringify(packs, null, 2), 'utf-8')
}

interface DeployTrack { musicId: number; sourceFile: string }
interface DeployPack  { id: string; name: string; description?: string; tracks: DeployTrack[] }

async function deployTrackFn(srcPath: string, destPath: string, ffmpegBin: string, kbps: number, sampleRate: number): Promise<void> {
  await execFileAsync(ffmpegBin, [
    '-y',
    '-i', srcPath,
    '-codec:a', 'libmp3lame',
    '-b:a', `${kbps}k`,
    '-ar', String(sampleRate),
    destPath,
  ])
}

export async function musicDeployPack(
  srcLibDir: string, pack: DeployPack, destDir: string,
  ffmpegPath: string | null, musEncodeKbps: number, musEncodeSampleRate: number,
): Promise<void> {
  const ffmpegBin = ffmpegPath || 'ffmpeg'
  // Resolve and validate every track's source path up front. assertInside
  // rejects path-traversal attempts; fs.stat catches missing files. Both
  // checks run BEFORE touching destDir, so a stale or malicious entry can't
  // wipe the user's deployed pack and leave them with nothing.
  const resolved: { src: string; dst: string; original: string }[] = []
  const missing: string[] = []
  for (const track of pack.tracks) {
    const src = assertInside(srcLibDir, track.sourceFile)
    const dst = assertInside(destDir, `${track.musicId}.mus`)
    resolved.push({ src, dst, original: track.sourceFile })
  }
  await Promise.all(resolved.map(async (r) => {
    try { await fs.stat(r.src) }
    catch { missing.push(r.original) }
  }))
  if (missing.length > 0) {
    throw new Error(`Cannot deploy pack "${pack.name}": missing source file(s): ${missing.join(', ')}`)
  }
  await fs.mkdir(destDir, { recursive: true })
  const existing = await fs.readdir(destDir, { withFileTypes: true })
  await Promise.all(
    existing.filter((e) => !e.isDirectory()).map((e) => fs.unlink(join(destDir, e.name)))
  )
  await Promise.all(
    resolved.map((r) => deployTrackFn(r.src, r.dst, ffmpegBin, musEncodeKbps, musEncodeSampleRate))
  )
  const manifest = {
    packId: pack.id, packName: pack.name,
    exportedAt: new Date().toISOString(),
    tracks: pack.tracks.map((t) => ({ id: t.musicId, sourceFile: t.sourceFile })),
  }
  await fs.writeFile(join(destDir, 'music-pack.json'), JSON.stringify(manifest, null, 2), 'utf-8')
}

export async function musicClientScan(clientPath: string): Promise<{ filename: string; sizeBytes: number }[]> {
  const musicDir = join(clientPath, 'music')
  try {
    const entries = await fs.readdir(musicDir, { withFileTypes: true })
    const files = entries.filter((e) => !e.isDirectory() && /^\d+\.mus$/i.test(e.name))
    return Promise.all(
      files.map(async (e) => {
        const stat = await fs.stat(join(musicDir, e.name))
        return { filename: e.name, sizeBytes: stat.size }
      })
    )
  } catch { return [] }
}

// ── SFX ──────────────────────────────────────────────────────────────────────

export async function sfxList(clientPath: string): Promise<{ entryName: string; sizeBytes: number }[]> {
  const { DataArchive } = await import('@eriscorp/dalib-ts')
  const legendPath = join(clientPath, 'legend.dat')
  const buf = await fs.readFile(legendPath)
  const archive = DataArchive.fromBuffer(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
  return archive.entries
    .filter((e) => e.entryName.toLowerCase().endsWith('.mp3'))
    .map((e) => ({ entryName: e.entryName, sizeBytes: e.fileSize }))
}

export async function sfxReadEntry(clientPath: string, entryName: string): Promise<Buffer> {
  const { DataArchive } = await import('@eriscorp/dalib-ts')
  const legendPath = join(clientPath, 'legend.dat')
  const buf = await fs.readFile(legendPath)
  const archive = DataArchive.fromBuffer(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
  const entry = archive.get(entryName)
  if (!entry) throw new Error(`Entry not found: ${entryName}`)
  return Buffer.from(archive.getEntryBuffer(entry))
}

export async function sfxIndexLoad(activeLibrary: string): Promise<Record<string, unknown>> {
  const p = join(activeLibrary, '..', 'sfx-index.json')
  try { return JSON.parse(await fs.readFile(p, 'utf-8')) } catch { return {} }
}

export async function sfxIndexSave(activeLibrary: string, data: unknown): Promise<void> {
  const p = join(activeLibrary, '..', 'sfx-index.json')
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf-8')
}

// ── World index ──────────────────────────────────────────────────────────────

export async function indexRead(libraryRoot: string) {
  return loadIndex(libraryRoot)
}

export async function indexBuild(libraryRoot: string) {
  const idx = await buildIndex(libraryRoot)
  await saveIndex(libraryRoot, idx)
  return idx
}

export async function indexStatus(libraryRoot: string) {
  return getIndexStatus(libraryRoot)
}

export async function libraryResolve(selectedPath: string) {
  return resolveLibraryPath(selectedPath)
}

export async function indexDelete(libraryRoot: string) {
  return deleteIndex(libraryRoot)
}

// ── Prefabs ──────────────────────────────────────────────────────────────────

function prefabDir(libraryPath: string): string {
  return join(libraryPath, '..', '.creidhne', 'prefabs')
}

export async function prefabList(libraryPath: string) {
  const dir = prefabDir(libraryPath)
  try {
    await fs.mkdir(dir, { recursive: true })
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const summaries: { filename: string; name: string; width: number; height: number; createdAt: string; updatedAt: string }[] = []
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
  } catch { return [] }
}

export async function prefabLoad(libraryPath: string, filename: string) {
  const p = assertInside(prefabDir(libraryPath), filename)
  return JSON.parse(await fs.readFile(p, 'utf-8'))
}

export async function prefabSave(libraryPath: string, filename: string, data: unknown): Promise<void> {
  const dir = prefabDir(libraryPath)
  const p = assertInside(dir, filename)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf-8')
}

export async function prefabDelete(libraryPath: string, filename: string): Promise<void> {
  await fs.unlink(assertInside(prefabDir(libraryPath), filename))
}

export async function prefabRename(libraryPath: string, oldName: string, newName: string): Promise<void> {
  const dir = prefabDir(libraryPath)
  await fs.rename(assertInside(dir, oldName), assertInside(dir, newName))
}

// ── Asset packs (.datf) ──────────────────────────────────────────────────────

export async function packScan(dirPath: string): Promise<Record<string, unknown>[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const packs: Record<string, unknown>[] = []
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
  } catch { return [] }
}

export async function packLoad(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, 'utf-8'))
}

export async function packSave(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

export async function packDelete(filePath: string): Promise<void> {
  await fs.unlink(filePath)
}

export async function packAddAsset(packDir: string, sourcePath: string, targetFilename: string): Promise<void> {
  const dest = assertInside(packDir, targetFilename)
  await fs.mkdir(packDir, { recursive: true })
  await fs.copyFile(sourcePath, dest)
}

export async function packRemoveAsset(packDir: string, filename: string): Promise<void> {
  const target = assertInside(packDir, filename)
  try { await fs.unlink(target) } catch { /* already gone */ }
}

export async function packCompile(packDir: string, manifest: unknown, assetFilenames: string[], outputPath: string): Promise<void> {
  // Validate every asset filename before opening the output stream — prevents
  // a malicious entry from leaking files outside packDir into the archive.
  const resolved = assetFilenames.map((f) => ({ name: f, abs: assertInside(packDir, f) }))
  const archiver = (await import('archiver')).default
  const { createWriteStream } = await import('fs')
  return new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outputPath)
    const archive = archiver('zip', { zlib: { level: 9 } })
    output.on('close', () => resolve())
    archive.on('error', (err: Error) => reject(err))
    archive.pipe(output)
    archive.append(JSON.stringify(manifest, null, 2), { name: '_manifest.json' })
    for (const { name, abs } of resolved) {
      archive.file(abs, { name })
    }
    archive.finalize()
  })
}

// ── Palettes ─────────────────────────────────────────────────────────────────

const palettesSubdir = (packDir: string) => join(packDir, '_palettes')
const calibrationsSubdir = (packDir: string) => join(packDir, '_calibrations')

export async function paletteScan(packDir: string) {
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
  } catch { return [] }
}

export async function paletteLoad(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, 'utf-8'))
}

export async function paletteSave(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

export async function paletteDelete(filePath: string): Promise<void> {
  try { await fs.unlink(filePath) } catch { /* already gone */ }
}

export async function paletteCalibrationLoad(packDir: string, paletteId: string): Promise<Record<string, unknown>> {
  const path = assertInside(calibrationsSubdir(packDir), `${paletteId}.json`)
  try { return JSON.parse(await fs.readFile(path, 'utf-8')) } catch { return {} }
}

export async function paletteCalibrationSave(packDir: string, paletteId: string, data: unknown): Promise<void> {
  const dir = calibrationsSubdir(packDir)
  const path = assertInside(dir, `${paletteId}.json`)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path, JSON.stringify(data, null, 2), 'utf-8')
}

export async function frameScan(packDir: string): Promise<string[]> {
  const dir = join(packDir, '_frames')
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    return entries
      .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.png'))
      .map(e => e.name)
      .sort((a, b) => a.localeCompare(b))
  } catch { return [] }
}

// ── Tile frequency scanner ──────────────────────────────────────────────────

export async function tileScanAnalyze(dirPaths: string[]) {
  const bgFreq = new Map<number, number>()
  const lfgFreq = new Map<number, number>()
  const rfgFreq = new Map<number, number>()
  let fileCount = 0
  let tileCount = 0

  for (const dirPath of dirPaths) {
    let entries
    try { entries = await fs.readdir(dirPath, { withFileTypes: true }) }
    catch { continue }
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
      } catch { /* skip unreadable */ }
    }
  }

  const sortAndCap = (m: Map<number, number>, cap: number): [number, number][] =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, cap)

  return {
    background: sortAndCap(bgFreq, 200),
    leftForeground: sortAndCap(lfgFreq, 200),
    rightForeground: sortAndCap(rfgFreq, 200),
    fileCount, tileCount,
  }
}

// ── Themes ──────────────────────────────────────────────────────────────────

export async function themeList(ctx: HandlerContext) {
  const themeDir = join(ctx.settingsPath, 'themes')
  try {
    await fs.mkdir(themeDir, { recursive: true })
    const entries = await fs.readdir(themeDir, { withFileTypes: true })
    const summaries: { filename: string; name: string }[] = []
    for (const e of entries.filter(e => e.isFile() && e.name.endsWith('.json'))) {
      try {
        const raw = await fs.readFile(join(themeDir, e.name), 'utf-8')
        const data = JSON.parse(raw)
        summaries.push({ filename: e.name, name: data.name ?? e.name.replace(/\.json$/, '') })
      } catch { /* skip malformed */ }
    }
    return summaries
  } catch { return [] }
}

export async function themeLoad(ctx: HandlerContext, filename: string) {
  const p = assertInside(join(ctx.settingsPath, 'themes'), filename)
  return JSON.parse(await fs.readFile(p, 'utf-8'))
}

export async function themeSave(ctx: HandlerContext, filename: string, data: unknown): Promise<void> {
  const themeDir = join(ctx.settingsPath, 'themes')
  const p = assertInside(themeDir, filename)
  await fs.mkdir(themeDir, { recursive: true })
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf-8')
}

export async function themeDelete(ctx: HandlerContext, filename: string): Promise<void> {
  await fs.unlink(assertInside(join(ctx.settingsPath, 'themes'), filename))
}

// ── Registration ────────────────────────────────────────────────────────────

export interface DialogShape {
  showOpenDialog: (opts: Electron.OpenDialogOptions) => Promise<{ canceled: boolean; filePaths: string[] }>
  showSaveDialog: (opts: Electron.SaveDialogOptions) => Promise<{ canceled: boolean; filePath?: string }>
}

export interface RegisterDeps {
  ipcMain: IpcMain
  BrowserWindow: typeof BrowserWindowType
  dialog: DialogShape
}

export function registerHandlers(deps: RegisterDeps, ctx: HandlerContext): void {
  const { ipcMain, BrowserWindow, dialog } = deps

  // Window controls
  ipcMain.on('minimize-window', (e) => { BrowserWindow.fromWebContents(e.sender)?.minimize() })
  ipcMain.on('maximize-window', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    win?.isMaximized() ? win.unmaximize() : win?.maximize()
  })
  ipcMain.on('close-window', (e) => { BrowserWindow.fromWebContents(e.sender)?.close() })

  // Settings / app
  ipcMain.handle('settings:load',        () => loadSettings(ctx))
  ipcMain.handle('settings:save',        (_, settings) => saveSettings(ctx, settings))
  ipcMain.handle('get-user-data-path',   () => getUserDataPath(ctx))
  ipcMain.handle('app:launchCompanion',  (_, p) => launchCompanion(p))
  ipcMain.handle('app:getVersion',       () => getAppVersion(ctx))

  // Dialogs
  ipcMain.handle('dialog:openFile',      async (_, filters?: Electron.FileFilter[]) => {
    const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: filters ?? [{ name: 'All Files', extensions: ['*'] }] })
    return r.filePaths[0] ?? null
  })
  ipcMain.handle('dialog:openDirectory', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return r.filePaths[0] ?? null
  })
  ipcMain.handle('dialog:saveFile',      async (_, filters?: Electron.FileFilter[], defaultPath?: string) => {
    const r = await dialog.showSaveDialog({ filters: filters ?? [{ name: 'All Files', extensions: ['*'] }], defaultPath: defaultPath ?? undefined })
    return r.filePath ?? null
  })

  // Filesystem
  ipcMain.handle('fs:readFile',    (_, p) => readFile(p))
  ipcMain.handle('fs:listDir',     (_, p) => listDir(p))
  ipcMain.handle('fs:copyFile',    (_, s, d) => copyFile(s, d))
  ipcMain.handle('fs:writeFile',   (_, p, c) => writeFile(p, c))
  ipcMain.handle('fs:writeBytes',  (_, p, d) => writeBytes(p, d))
  ipcMain.handle('fs:exists',      (_, p) => exists(p))
  ipcMain.handle('fs:ensureDir',   (_, p) => ensureDir(p))
  ipcMain.handle('fs:deleteFile',  (_, p) => deleteFile(p))
  ipcMain.handle('fs:listArchive', (_, p) => listArchive(p))

  // Catalog
  ipcMain.handle('catalog:load', (_, p) => catalogLoad(p))
  ipcMain.handle('catalog:save', (_, p, d) => catalogSave(p, d))
  ipcMain.handle('catalog:scan', (_, p) => catalogScan(p))

  // Music
  ipcMain.handle('music:readFileMeta',     (_, p) => musicReadFileMeta(p))
  ipcMain.handle('music:scan',             (_, p) => musicScan(p))
  ipcMain.handle('music:metadata:load',    (_, p) => musicMetadataLoad(p))
  ipcMain.handle('music:metadata:save',    (_, p, d) => musicMetadataSave(p, d))
  ipcMain.handle('music:packs:load',       (_, p) => musicPacksLoad(p))
  ipcMain.handle('music:packs:save',       (_, p, packs) => musicPacksSave(p, packs))
  ipcMain.handle('music:deploy-pack',      (_, src, pack, dst, ffmpeg, kbps, sr) => musicDeployPack(src, pack, dst, ffmpeg, kbps, sr))
  ipcMain.handle('music:client:scan',      (_, p) => musicClientScan(p))

  // SFX
  ipcMain.handle('sfx:list',       (_, p) => sfxList(p))
  ipcMain.handle('sfx:readEntry',  (_, p, n) => sfxReadEntry(p, n))
  ipcMain.handle('sfx:index:load', (_, p) => sfxIndexLoad(p))
  ipcMain.handle('sfx:index:save', (_, p, d) => sfxIndexSave(p, d))

  // World index
  ipcMain.handle('index:read',      (_, p) => indexRead(p))
  ipcMain.handle('index:build',     (_, p) => indexBuild(p))
  ipcMain.handle('index:status',    (_, p) => indexStatus(p))
  ipcMain.handle('index:delete',    (_, p) => indexDelete(p))
  ipcMain.handle('library:resolve', (_, p) => libraryResolve(p))

  // Prefabs
  ipcMain.handle('prefab:list',   (_, p) => prefabList(p))
  ipcMain.handle('prefab:load',   (_, p, f) => prefabLoad(p, f))
  ipcMain.handle('prefab:save',   (_, p, f, d) => prefabSave(p, f, d))
  ipcMain.handle('prefab:delete', (_, p, f) => prefabDelete(p, f))
  ipcMain.handle('prefab:rename', (_, p, o, n) => prefabRename(p, o, n))

  // Asset packs
  ipcMain.handle('pack:scan',        (_, p) => packScan(p))
  ipcMain.handle('pack:load',        (_, p) => packLoad(p))
  ipcMain.handle('pack:save',        (_, p, d) => packSave(p, d))
  ipcMain.handle('pack:delete',      (_, p) => packDelete(p))
  ipcMain.handle('pack:addAsset',    (_, d, s, t) => packAddAsset(d, s, t))
  ipcMain.handle('pack:removeAsset', (_, d, f) => packRemoveAsset(d, f))
  ipcMain.handle('pack:compile',     (_, d, m, f, o) => packCompile(d, m, f, o))

  // Palettes
  ipcMain.handle('palette:scan',             (_, p) => paletteScan(p))
  ipcMain.handle('palette:load',             (_, p) => paletteLoad(p))
  ipcMain.handle('palette:save',             (_, p, d) => paletteSave(p, d))
  ipcMain.handle('palette:delete',           (_, p) => paletteDelete(p))
  ipcMain.handle('palette:calibrationLoad',  (_, d, id) => paletteCalibrationLoad(d, id))
  ipcMain.handle('palette:calibrationSave',  (_, d, id, data) => paletteCalibrationSave(d, id, data))
  ipcMain.handle('frame:scan',               (_, p) => frameScan(p))

  // Tile scanner
  ipcMain.handle('tileScan:analyze', (_, paths) => tileScanAnalyze(paths))

  // Themes
  ipcMain.handle('theme:list',   () => themeList(ctx))
  ipcMain.handle('theme:load',   (_, f) => themeLoad(ctx, f))
  ipcMain.handle('theme:save',   (_, f, d) => themeSave(ctx, f, d))
  ipcMain.handle('theme:delete', (_, f) => themeDelete(ctx, f))
}
