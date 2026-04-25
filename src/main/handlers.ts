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
import { createHash } from 'crypto'
import {
  buildIndex,
  loadIndex,
  saveIndex,
  getIndexStatus,
  deleteIndex
} from '@eriscorp/hybindex-ts'
import { resolveLibraryPath } from './libraryPath'
import { assertInside, assertInsideAnyRoot } from './pathSafety'
import { parseOrLog } from './schemaLog'
import {
  taliesinSettingsSchema,
  paletteSchema,
  calibrationFileSchema,
  prefabSchema,
  musicMetaDataSchema,
  musicPackArraySchema,
  deployPackSchema,
  packProjectSchema,
  packManifestSchema,
  packCompileFilenamesSchema,
  catalogDataSchema,
  sfxIndexSchema,
  tileThemeSchema
} from './schemas'
import type { createSettingsManager, TaliesinSettings } from './settingsManager'

const execFileAsync = promisify(execFile)

export interface HandlerContext {
  settingsPath: string
  settingsManager: ReturnType<typeof createSettingsManager>
  appGetVersion: () => string
  /** Path roots derived from current settings (active library, pack dir, etc.). */
  settingsRoots: Set<string>
  /** Paths blessed this session via OS dialog selections (one-shot user consent). */
  blessedRoots: Set<string>
}

/**
 * Iterate every currently-allowed path root: the settings dir, settings-derived
 * roots, and session-blessed roots. Used by `assertInsideAnyRoot` at every
 * Category-A handler boundary.
 */
export function* allRoots(ctx: HandlerContext): Iterable<string> {
  yield ctx.settingsPath
  yield* ctx.settingsRoots
  yield* ctx.blessedRoots
}

/**
 * Replace the settings-derived root set from a TaliesinSettings snapshot.
 * Dialog-blessed roots are preserved across this call. Invoke after settings
 * load on startup and after every saveSettings IPC call.
 */
export function applySettingsRoots(ctx: HandlerContext, settings: TaliesinSettings): void {
  ctx.settingsRoots.clear()
  if (settings.clientPath) ctx.settingsRoots.add(settings.clientPath)
  if (settings.activeLibrary) ctx.settingsRoots.add(settings.activeLibrary)
  if (settings.activeMapDirectory) ctx.settingsRoots.add(settings.activeMapDirectory)
  if (settings.musicLibraryPath) ctx.settingsRoots.add(settings.musicLibraryPath)
  if (settings.activeMusicWorkingDir) ctx.settingsRoots.add(settings.activeMusicWorkingDir)
  if (settings.packDir) ctx.settingsRoots.add(settings.packDir)
}

/**
 * Add a session-blessed root (typically from an OS dialog return). Idempotent.
 * Blessings persist for the rest of the process lifetime.
 */
export function blessRoot(ctx: HandlerContext, path: string | null | undefined): void {
  if (path) ctx.blessedRoots.add(path)
}

// ── Settings / app ───────────────────────────────────────────────────────────

export async function loadSettings(ctx: HandlerContext) {
  return ctx.settingsManager.load()
}

export async function saveSettings(ctx: HandlerContext, settings: unknown) {
  const parsed = parseOrLog(ctx, 'settings:save', taliesinSettingsSchema, settings)
  await ctx.settingsManager.save(parsed as TaliesinSettings)
  // Refresh the allowed-root set so subsequent path-validating handlers
  // see the new active library / pack / etc. without waiting for a restart.
  applySettingsRoots(ctx, parsed as TaliesinSettings)
}

export function getUserDataPath(ctx: HandlerContext): string {
  return ctx.settingsPath
}

export async function launchCompanion(ctx: HandlerContext, exePath: string): Promise<boolean> {
  // Whitelist: only the exe path explicitly configured in Settings may be
  // launched. spawn() bypasses the file-read root check (a process is much
  // bigger blast radius than a file read), so we lock it down to one
  // settings-controlled target. Different launcher? Update Settings first.
  const settings = await ctx.settingsManager.load()
  const allowed = settings.companionPath
  if (!allowed || exePath !== allowed) return false
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
//
// Category-A handlers: each path argument is renderer-supplied with no
// implicit parent, so we validate against ctx.roots up front.

export async function readFile(ctx: HandlerContext, filePath: string): Promise<Buffer> {
  return fs.readFile(assertInsideAnyRoot(allRoots(ctx), filePath))
}

export async function listDir(
  ctx: HandlerContext,
  dirPath: string
): Promise<{ name: string; isDirectory: boolean }[]> {
  const safe = assertInsideAnyRoot(allRoots(ctx), dirPath)
  const entries = await fs.readdir(safe, { withFileTypes: true })
  return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }))
}

export async function copyFile(ctx: HandlerContext, src: string, dst: string): Promise<void> {
  const safeSrc = assertInsideAnyRoot(allRoots(ctx), src)
  const safeDst = assertInsideAnyRoot(allRoots(ctx), dst)
  await fs.mkdir(dirname(safeDst), { recursive: true })
  await fs.copyFile(safeSrc, safeDst)
}

export async function writeFile(
  ctx: HandlerContext,
  filePath: string,
  content: string
): Promise<void> {
  const safe = assertInsideAnyRoot(allRoots(ctx), filePath)
  await fs.mkdir(dirname(safe), { recursive: true })
  await fs.writeFile(safe, content, 'utf-8')
}

export async function writeBytes(
  ctx: HandlerContext,
  filePath: string,
  data: Uint8Array
): Promise<void> {
  const safe = assertInsideAnyRoot(allRoots(ctx), filePath)
  await fs.mkdir(dirname(safe), { recursive: true })
  await fs.writeFile(safe, Buffer.from(data))
}

export async function exists(ctx: HandlerContext, filePath: string): Promise<boolean> {
  try {
    await fs.access(assertInsideAnyRoot(allRoots(ctx), filePath))
    return true
  } catch {
    return false
  }
}

export async function stat(
  ctx: HandlerContext,
  filePath: string
): Promise<{ mtimeMs: number; sizeBytes: number } | null> {
  try {
    const s = await fs.stat(assertInsideAnyRoot(allRoots(ctx), filePath))
    return { mtimeMs: s.mtimeMs, sizeBytes: s.size }
  } catch {
    return null
  }
}

export async function ensureDir(ctx: HandlerContext, dirPath: string): Promise<void> {
  await fs.mkdir(assertInsideAnyRoot(allRoots(ctx), dirPath), { recursive: true })
}

export async function deleteFile(ctx: HandlerContext, filePath: string): Promise<void> {
  await fs.unlink(assertInsideAnyRoot(allRoots(ctx), filePath))
}

export async function listArchive(ctx: HandlerContext, filePath: string): Promise<string[]> {
  const safe = assertInsideAnyRoot(allRoots(ctx), filePath)
  const { DataArchive } = await import('@eriscorp/dalib-ts')
  const buf = await fs.readFile(safe)
  const archive = DataArchive.fromBuffer(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
  return archive.entries.map((e) => e.entryName)
}

// ── Catalog ──────────────────────────────────────────────────────────────────

/**
 * Resolve where to store the catalog for a given map directory.
 * If named "mapfiles", store under sibling .creidhne/. Otherwise store inline.
 */
function getCatalogPath(dirPath: string): string {
  const folderName =
    dirPath
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop()
      ?.toLowerCase() ?? ''
  if (folderName === 'mapfiles') {
    return join(dirPath, '..', '.creidhne', 'map-catalog.json')
  }
  return join(dirPath, 'map-catalog.json')
}

export async function catalogLoad(
  ctx: HandlerContext,
  dirPath: string
): Promise<Record<string, unknown>> {
  const safeDir = assertInsideAnyRoot(allRoots(ctx), dirPath)
  const p = getCatalogPath(safeDir)
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8'))
  } catch {
    return {}
  }
}

export async function catalogSave(
  ctx: HandlerContext,
  dirPath: string,
  data: unknown
): Promise<void> {
  const safeDir = assertInsideAnyRoot(allRoots(ctx), dirPath)
  const parsed = parseOrLog(ctx, 'catalog:save', catalogDataSchema, data)
  const p = getCatalogPath(safeDir)
  await fs.mkdir(dirname(p), { recursive: true })
  await fs.writeFile(p, JSON.stringify(parsed, null, 2), 'utf-8')
}

export async function catalogScan(
  ctx: HandlerContext,
  dirPath: string
): Promise<{ filename: string; sizeBytes: number }[]> {
  const safeDir = assertInsideAnyRoot(allRoots(ctx), dirPath)
  const entries = await fs.readdir(safeDir, { withFileTypes: true })
  const maps = entries.filter((e) => !e.isDirectory() && /^lod\d+(?:-[^.]+)?\.map$/i.test(e.name))
  return Promise.all(
    maps.map(async (e) => {
      const stat = await fs.stat(join(safeDir, e.name))
      return { filename: e.name, sizeBytes: stat.size }
    })
  )
}

// ── Music ────────────────────────────────────────────────────────────────────

const MUSIC_SOURCE_EXTS = new Set(['.mp3', '.ogg', '.mus', '.wav', '.flac'])

function findTxxxFrame(
  native: Record<string, { id: string; value: unknown }[]> | undefined,
  desc: string
): string | null {
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

export async function musicReadFileMeta(ctx: HandlerContext, filePath: string) {
  try {
    const safe = assertInsideAnyRoot(allRoots(ctx), filePath)
    const { parseBuffer } = await import('music-metadata')
    const buf = await fs.readFile(safe)
    const meta = await parseBuffer(buf, undefined, { duration: true, skipCovers: true })
    const { title, artist, genre, album } = meta.common
    const { duration, bitrate, sampleRate, numberOfChannels } = meta.format
    const genreStr = Array.isArray(genre) ? genre.join(', ') : (genre ?? null)
    const prompt = findTxxxFrame(
      meta.native as Record<string, { id: string; value: unknown }[]>,
      'PROMPT'
    )
    return {
      title: title ?? null,
      artist: artist ?? null,
      genre: genreStr || null,
      album: album ?? null,
      duration: duration ?? null,
      bitrate: bitrate ?? null,
      sampleRate: sampleRate ?? null,
      channels: numberOfChannels ?? null,
      prompt: prompt?.trim() || null
    }
  } catch {
    return null
  }
}

async function scanMusicDir(
  rootDir: string,
  relDir = ''
): Promise<{ filename: string; sizeBytes: number }[]> {
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

export async function musicScan(ctx: HandlerContext, dirPath: string) {
  try {
    const safe = assertInsideAnyRoot(allRoots(ctx), dirPath)
    return await scanMusicDir(safe)
  } catch {
    return []
  }
}

export async function musicMetadataLoad(
  ctx: HandlerContext,
  dirPath: string
): Promise<Record<string, unknown>> {
  const safe = assertInsideAnyRoot(allRoots(ctx), dirPath)
  const p = join(safe, 'music-library.json')
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8'))
  } catch {
    return {}
  }
}

export async function musicMetadataSave(
  ctx: HandlerContext,
  dirPath: string,
  data: unknown
): Promise<void> {
  const safe = assertInsideAnyRoot(allRoots(ctx), dirPath)
  const parsed = parseOrLog(ctx, 'music:metadata:save', musicMetaDataSchema, data)
  const p = join(safe, 'music-library.json')
  await fs.mkdir(dirname(p), { recursive: true })
  await fs.writeFile(p, JSON.stringify(parsed, null, 2), 'utf-8')
}

export async function musicPacksLoad(ctx: HandlerContext, dirPath: string): Promise<unknown> {
  const safe = assertInsideAnyRoot(allRoots(ctx), dirPath)
  const p = join(safe, 'music-packs.json')
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8'))
  } catch {
    return []
  }
}

export async function musicPacksSave(
  ctx: HandlerContext,
  dirPath: string,
  packs: unknown
): Promise<void> {
  const safe = assertInsideAnyRoot(allRoots(ctx), dirPath)
  const parsed = parseOrLog(ctx, 'music:packs:save', musicPackArraySchema, packs)
  const p = join(safe, 'music-packs.json')
  await fs.mkdir(dirname(p), { recursive: true })
  await fs.writeFile(p, JSON.stringify(parsed, null, 2), 'utf-8')
}

interface DeployTrack {
  musicId: number
  sourceFile: string
}
interface DeployPack {
  id: string
  name: string
  description?: string
  tracks: DeployTrack[]
}

type ParseBuffer = typeof import('music-metadata').parseBuffer

async function deployTrackFn(
  parseBuffer: ParseBuffer,
  srcPath: string,
  destPath: string,
  ffmpegBin: string,
  kbps: number,
  sampleRate: number
): Promise<void> {
  // Fast path: a .mp3 source already encoded at the target bitrate + sample
  // rate can just be copied. Saves an ffmpeg roundtrip per track and avoids
  // the subtle quality hit of re-encoding mp3→mp3. Any parse failure falls
  // through to the safe re-encode below.
  if (srcPath.toLowerCase().endsWith('.mp3')) {
    try {
      const buf = await fs.readFile(srcPath)
      const meta = await parseBuffer(buf, undefined, { duration: false, skipCovers: true })
      if (meta.format.bitrate === kbps * 1000 && meta.format.sampleRate === sampleRate) {
        await fs.copyFile(srcPath, destPath)
        return
      }
    } catch {
      /* fall through to re-encode */
    }
  }
  await execFileAsync(ffmpegBin, [
    '-y',
    '-i',
    srcPath,
    '-codec:a',
    'libmp3lame',
    '-b:a',
    `${kbps}k`,
    '-ar',
    String(sampleRate),
    destPath
  ])
}

export async function musicDeployPack(
  ctx: HandlerContext,
  srcLibDir: string,
  pack: unknown,
  destDir: string,
  ffmpegPath: string | null,
  musEncodeKbps: number,
  musEncodeSampleRate: number
): Promise<void> {
  const parsedPack = parseOrLog(ctx, 'music:deploy-pack', deployPackSchema, pack) as DeployPack
  const ffmpegBin = ffmpegPath || 'ffmpeg'
  const safeSrcLib = assertInsideAnyRoot(allRoots(ctx), srcLibDir)
  const safeDest = assertInsideAnyRoot(allRoots(ctx), destDir)
  // Resolve and validate every track's source path up front. assertInside
  // rejects path-traversal attempts; fs.stat catches missing files. Both
  // checks run BEFORE touching destDir, so a stale or malicious entry can't
  // wipe the user's deployed pack and leave them with nothing.
  const resolved: { src: string; dst: string; original: string }[] = []
  const missing: string[] = []
  for (const track of parsedPack.tracks) {
    const src = assertInside(safeSrcLib, track.sourceFile)
    const dst = assertInside(safeDest, `${track.musicId}.mus`)
    resolved.push({ src, dst, original: track.sourceFile })
  }
  await Promise.all(
    resolved.map(async (r) => {
      try {
        await fs.stat(r.src)
      } catch {
        missing.push(r.original)
      }
    })
  )
  if (missing.length > 0) {
    throw new Error(
      `Cannot deploy pack "${parsedPack.name}": missing source file(s): ${missing.join(', ')}`
    )
  }
  await fs.mkdir(safeDest, { recursive: true })
  const existing = await fs.readdir(safeDest, { withFileTypes: true })
  await Promise.all(
    existing.filter((e) => !e.isDirectory()).map((e) => fs.unlink(join(safeDest, e.name)))
  )
  // Import music-metadata once for the whole pack — parallel dynamic imports
  // race in Vitest's mock substitution and cause one of the calls to fall
  // through to the real module.
  const { parseBuffer } = await import('music-metadata')
  await Promise.all(
    resolved.map((r) =>
      deployTrackFn(parseBuffer, r.src, r.dst, ffmpegBin, musEncodeKbps, musEncodeSampleRate)
    )
  )
  const manifest = {
    packId: parsedPack.id,
    packName: parsedPack.name,
    exportedAt: new Date().toISOString(),
    tracks: parsedPack.tracks.map((t) => ({ id: t.musicId, sourceFile: t.sourceFile }))
  }
  await fs.writeFile(join(safeDest, 'music-pack.json'), JSON.stringify(manifest, null, 2), 'utf-8')
}

export async function musicClientScan(
  ctx: HandlerContext,
  clientPath: string
): Promise<{ filename: string; sizeBytes: number }[]> {
  try {
    const safe = assertInsideAnyRoot(allRoots(ctx), clientPath)
    const musicDir = join(safe, 'music')
    const entries = await fs.readdir(musicDir, { withFileTypes: true })
    const files = entries.filter((e) => !e.isDirectory() && /^\d+\.mus$/i.test(e.name))
    return Promise.all(
      files.map(async (e) => {
        const stat = await fs.stat(join(musicDir, e.name))
        return { filename: e.name, sizeBytes: stat.size }
      })
    )
  } catch {
    return []
  }
}

// ── SFX ──────────────────────────────────────────────────────────────────────

export async function sfxList(
  ctx: HandlerContext,
  clientPath: string
): Promise<{ entryName: string; sizeBytes: number }[]> {
  const safe = assertInsideAnyRoot(allRoots(ctx), clientPath)
  const { DataArchive } = await import('@eriscorp/dalib-ts')
  const legendPath = join(safe, 'legend.dat')
  const buf = await fs.readFile(legendPath)
  const archive = DataArchive.fromBuffer(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
  return archive.entries
    .filter((e) => e.entryName.toLowerCase().endsWith('.mp3'))
    .map((e) => ({ entryName: e.entryName, sizeBytes: e.fileSize }))
}

export async function sfxReadEntry(
  ctx: HandlerContext,
  clientPath: string,
  entryName: string
): Promise<Buffer> {
  const safe = assertInsideAnyRoot(allRoots(ctx), clientPath)
  const { DataArchive } = await import('@eriscorp/dalib-ts')
  const legendPath = join(safe, 'legend.dat')
  const buf = await fs.readFile(legendPath)
  const archive = DataArchive.fromBuffer(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
  const entry = archive.get(entryName)
  if (!entry) throw new Error(`Entry not found: ${entryName}`)
  return Buffer.from(archive.getEntryBuffer(entry))
}

export async function sfxIndexLoad(
  ctx: HandlerContext,
  activeLibrary: string
): Promise<Record<string, unknown>> {
  const safe = assertInsideAnyRoot(allRoots(ctx), activeLibrary)
  const p = join(safe, '..', 'sfx-index.json')
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8'))
  } catch {
    return {}
  }
}

export async function sfxIndexSave(
  ctx: HandlerContext,
  activeLibrary: string,
  data: unknown
): Promise<void> {
  const safe = assertInsideAnyRoot(allRoots(ctx), activeLibrary)
  const parsed = parseOrLog(ctx, 'sfx:index:save', sfxIndexSchema, data)
  const p = join(safe, '..', 'sfx-index.json')
  await fs.writeFile(p, JSON.stringify(parsed, null, 2), 'utf-8')
}

// ── BIK video conversion ─────────────────────────────────────────────────────

/**
 * Convert a BIK video buffer to MP4 via ffmpeg, with content-addressed caching.
 * The cache lives under `cacheDir` and is keyed by SHA-256 of the input bytes,
 * so repeated calls for the same entry skip the conversion entirely.
 *
 * Returns the absolute path to the cached MP4.
 */
export async function bikConvert(
  ctx: HandlerContext,
  bytes: Uint8Array,
  ffmpegPath: string | null,
  cacheDir: string
): Promise<string> {
  const ffmpegBin = ffmpegPath || 'ffmpeg'
  const safeCache = assertInsideAnyRoot(allRoots(ctx), cacheDir)
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 32)
  await fs.mkdir(safeCache, { recursive: true })
  // assertInside guards against a malicious cacheDir + hash combination escaping
  // the cache root; hash is 32 hex chars from createHash so this should always
  // resolve cleanly, but the check keeps the safety invariant locally enforced.
  const mp4Path = assertInside(safeCache, `${hash}.mp4`)
  try {
    await fs.access(mp4Path)
    return mp4Path // cache hit
  } catch {
    /* fall through to conversion */
  }

  const bikPath = assertInside(safeCache, `${hash}.bik`)
  await fs.writeFile(bikPath, Buffer.from(bytes))
  try {
    await execFileAsync(ffmpegBin, [
      '-y',
      '-i',
      bikPath,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      mp4Path
    ])
  } finally {
    // Always remove the source temp file; mp4 stays cached on success and
    // is left absent on failure so the next attempt can retry cleanly.
    fs.unlink(bikPath).catch(() => undefined)
  }
  return mp4Path
}

// ── World index ──────────────────────────────────────────────────────────────

export async function indexRead(ctx: HandlerContext, libraryRoot: string) {
  return loadIndex(assertInsideAnyRoot(allRoots(ctx), libraryRoot))
}

export async function indexBuild(ctx: HandlerContext, libraryRoot: string) {
  const safe = assertInsideAnyRoot(allRoots(ctx), libraryRoot)
  const idx = await buildIndex(safe)
  await saveIndex(safe, idx)
  return idx
}

export async function indexStatus(ctx: HandlerContext, libraryRoot: string) {
  return getIndexStatus(assertInsideAnyRoot(allRoots(ctx), libraryRoot))
}

export async function libraryResolve(ctx: HandlerContext, selectedPath: string) {
  return resolveLibraryPath(assertInsideAnyRoot(allRoots(ctx), selectedPath))
}

export async function indexDelete(ctx: HandlerContext, libraryRoot: string) {
  return deleteIndex(assertInsideAnyRoot(allRoots(ctx), libraryRoot))
}

// ── Prefabs ──────────────────────────────────────────────────────────────────

function prefabDir(libraryPath: string): string {
  return join(libraryPath, '..', '.creidhne', 'prefabs')
}

export async function prefabList(ctx: HandlerContext, libraryPath: string) {
  const safeLib = assertInsideAnyRoot(allRoots(ctx), libraryPath)
  const dir = prefabDir(safeLib)
  try {
    await fs.mkdir(dir, { recursive: true })
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const summaries: {
      filename: string
      name: string
      width: number
      height: number
      createdAt: string
      updatedAt: string
    }[] = []
    for (const e of entries.filter((e) => e.isFile() && e.name.endsWith('.json'))) {
      try {
        const raw = await fs.readFile(join(dir, e.name), 'utf-8')
        const data = JSON.parse(raw)
        summaries.push({
          filename: e.name,
          name: data.name ?? e.name.replace(/\.json$/, ''),
          width: data.width ?? 0,
          height: data.height ?? 0,
          createdAt: data.createdAt ?? '',
          updatedAt: data.updatedAt ?? ''
        })
      } catch {
        /* skip malformed */
      }
    }
    return summaries
  } catch {
    return []
  }
}

export async function prefabLoad(ctx: HandlerContext, libraryPath: string, filename: string) {
  const safeLib = assertInsideAnyRoot(allRoots(ctx), libraryPath)
  const p = assertInside(prefabDir(safeLib), filename)
  return JSON.parse(await fs.readFile(p, 'utf-8'))
}

export async function prefabSave(
  ctx: HandlerContext,
  libraryPath: string,
  filename: string,
  data: unknown
): Promise<void> {
  const safeLib = assertInsideAnyRoot(allRoots(ctx), libraryPath)
  const parsed = parseOrLog(ctx, 'prefab:save', prefabSchema, data)
  const dir = prefabDir(safeLib)
  const p = assertInside(dir, filename)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(p, JSON.stringify(parsed, null, 2), 'utf-8')
}

export async function prefabDelete(
  ctx: HandlerContext,
  libraryPath: string,
  filename: string
): Promise<void> {
  const safeLib = assertInsideAnyRoot(allRoots(ctx), libraryPath)
  await fs.unlink(assertInside(prefabDir(safeLib), filename))
}

export async function prefabRename(
  ctx: HandlerContext,
  libraryPath: string,
  oldName: string,
  newName: string
): Promise<void> {
  const safeLib = assertInsideAnyRoot(allRoots(ctx), libraryPath)
  const dir = prefabDir(safeLib)
  await fs.rename(assertInside(dir, oldName), assertInside(dir, newName))
}

// ── Asset packs (.datf) ──────────────────────────────────────────────────────

export async function packScan(
  ctx: HandlerContext,
  dirPath: string
): Promise<Record<string, unknown>[]> {
  try {
    const safe = assertInsideAnyRoot(allRoots(ctx), dirPath)
    const entries = await fs.readdir(safe, { withFileTypes: true })
    const packs: Record<string, unknown>[] = []
    for (const e of entries.filter((e) => e.isFile() && e.name.endsWith('.json'))) {
      try {
        const raw = await fs.readFile(join(safe, e.name), 'utf-8')
        const data = JSON.parse(raw)
        if (data.pack_id && data.content_type) {
          packs.push({ filename: e.name, ...data })
        }
      } catch {
        /* skip malformed */
      }
    }
    return packs
  } catch {
    return []
  }
}

export async function packLoad(ctx: HandlerContext, filePath: string) {
  return JSON.parse(await fs.readFile(assertInsideAnyRoot(allRoots(ctx), filePath), 'utf-8'))
}

export async function packSave(
  ctx: HandlerContext,
  filePath: string,
  data: unknown
): Promise<void> {
  const safe = assertInsideAnyRoot(allRoots(ctx), filePath)
  const parsed = parseOrLog(ctx, 'pack:save', packProjectSchema, data)
  await fs.mkdir(dirname(safe), { recursive: true })
  await fs.writeFile(safe, JSON.stringify(parsed, null, 2), 'utf-8')
}

export async function packDelete(ctx: HandlerContext, filePath: string): Promise<void> {
  await fs.unlink(assertInsideAnyRoot(allRoots(ctx), filePath))
}

export async function packAddAsset(
  ctx: HandlerContext,
  packDir: string,
  sourcePath: string,
  targetFilename: string
): Promise<void> {
  const safePack = assertInsideAnyRoot(allRoots(ctx), packDir)
  const safeSrc = assertInsideAnyRoot(allRoots(ctx), sourcePath)
  const dest = assertInside(safePack, targetFilename)
  await fs.mkdir(safePack, { recursive: true })
  await fs.copyFile(safeSrc, dest)
}

export async function packRemoveAsset(
  ctx: HandlerContext,
  packDir: string,
  filename: string
): Promise<void> {
  const safePack = assertInsideAnyRoot(allRoots(ctx), packDir)
  const target = assertInside(safePack, filename)
  try {
    await fs.unlink(target)
  } catch {
    /* already gone */
  }
}

export async function packCompile(
  ctx: HandlerContext,
  packDir: string,
  manifest: unknown,
  assetFilenames: unknown,
  outputPath: string
): Promise<void> {
  const safePack = assertInsideAnyRoot(allRoots(ctx), packDir)
  const safeOut = assertInsideAnyRoot(allRoots(ctx), outputPath)
  const parsedManifest = parseOrLog(ctx, 'pack:compile', packManifestSchema, manifest)
  const parsedFilenames = parseOrLog(
    ctx,
    'pack:compile',
    packCompileFilenamesSchema,
    assetFilenames
  )
  // Validate every asset filename before opening the output stream — prevents
  // a malicious entry from leaking files outside packDir into the archive.
  const resolved = parsedFilenames.map((f) => ({ name: f, abs: assertInside(safePack, f) }))
  const archiver = (await import('archiver')).default
  const { createWriteStream } = await import('fs')
  return new Promise<void>((resolve, reject) => {
    const output = createWriteStream(safeOut)
    const archive = archiver('zip', { zlib: { level: 9 } })
    output.on('close', () => resolve())
    archive.on('error', (err: Error) => reject(err))
    archive.pipe(output)
    archive.append(JSON.stringify(parsedManifest, null, 2), { name: '_manifest.json' })
    for (const { name, abs } of resolved) {
      archive.file(abs, { name })
    }
    archive.finalize()
  })
}

// ── Palettes ─────────────────────────────────────────────────────────────────

const palettesSubdir = (packDir: string) => join(packDir, '_palettes')
const calibrationsSubdir = (packDir: string) => join(packDir, '_calibrations')

export async function paletteScan(ctx: HandlerContext, packDir: string) {
  try {
    const safePack = assertInsideAnyRoot(allRoots(ctx), packDir)
    const dir = palettesSubdir(safePack)
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const palettes: { filename: string; id: string; name: string; entryCount: number }[] = []
    for (const e of entries.filter((e) => e.isFile() && e.name.endsWith('.json'))) {
      try {
        const raw = await fs.readFile(join(dir, e.name), 'utf-8')
        const data = JSON.parse(raw)
        if (data.id && Array.isArray(data.entries)) {
          palettes.push({
            filename: e.name,
            id: data.id,
            name: data.name ?? data.id,
            entryCount: data.entries.length
          })
        }
      } catch {
        /* skip malformed */
      }
    }
    return palettes.sort((a, b) => a.id.localeCompare(b.id))
  } catch {
    return []
  }
}

export async function paletteLoad(ctx: HandlerContext, filePath: string) {
  return JSON.parse(await fs.readFile(assertInsideAnyRoot(allRoots(ctx), filePath), 'utf-8'))
}

export async function paletteSave(
  ctx: HandlerContext,
  filePath: string,
  data: unknown
): Promise<void> {
  const safe = assertInsideAnyRoot(allRoots(ctx), filePath)
  const parsed = parseOrLog(ctx, 'palette:save', paletteSchema, data)
  await fs.mkdir(dirname(safe), { recursive: true })
  await fs.writeFile(safe, JSON.stringify(parsed, null, 2), 'utf-8')
}

export async function paletteDelete(ctx: HandlerContext, filePath: string): Promise<void> {
  try {
    await fs.unlink(assertInsideAnyRoot(allRoots(ctx), filePath))
  } catch {
    /* already gone */
  }
}

export async function paletteCalibrationLoad(
  ctx: HandlerContext,
  packDir: string,
  paletteId: string
): Promise<Record<string, unknown>> {
  const safePack = assertInsideAnyRoot(allRoots(ctx), packDir)
  const path = assertInside(calibrationsSubdir(safePack), `${paletteId}.json`)
  try {
    return JSON.parse(await fs.readFile(path, 'utf-8'))
  } catch {
    return {}
  }
}

export async function paletteCalibrationSave(
  ctx: HandlerContext,
  packDir: string,
  paletteId: string,
  data: unknown
): Promise<void> {
  const safePack = assertInsideAnyRoot(allRoots(ctx), packDir)
  const parsed = parseOrLog(ctx, 'palette:calibrationSave', calibrationFileSchema, data)
  const dir = calibrationsSubdir(safePack)
  const path = assertInside(dir, `${paletteId}.json`)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path, JSON.stringify(parsed, null, 2), 'utf-8')
}

export async function frameScan(ctx: HandlerContext, packDir: string): Promise<string[]> {
  const safePack = assertInsideAnyRoot(allRoots(ctx), packDir)
  const dir = join(safePack, '_frames')
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    return entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.png'))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

// ── Tile frequency scanner ──────────────────────────────────────────────────

export async function tileScanAnalyze(ctx: HandlerContext, dirPaths: string[]) {
  const bgFreq = new Map<number, number>()
  const lfgFreq = new Map<number, number>()
  const rfgFreq = new Map<number, number>()
  let fileCount = 0
  let tileCount = 0

  for (const dirPath of dirPaths) {
    let entries
    let safeDir: string
    try {
      safeDir = assertInsideAnyRoot(allRoots(ctx), dirPath)
      entries = await fs.readdir(safeDir, { withFileTypes: true })
    } catch {
      continue
    }
    const mapFiles = entries.filter((e) => e.isFile() && /\.map$/i.test(e.name))
    for (const entry of mapFiles) {
      try {
        const buf = await fs.readFile(join(safeDir, entry.name))
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
      } catch {
        /* skip unreadable */
      }
    }
  }

  const sortAndCap = (m: Map<number, number>, cap: number): [number, number][] =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, cap)

  return {
    background: sortAndCap(bgFreq, 200),
    leftForeground: sortAndCap(lfgFreq, 200),
    rightForeground: sortAndCap(rfgFreq, 200),
    fileCount,
    tileCount
  }
}

// ── Themes ──────────────────────────────────────────────────────────────────

export async function themeList(ctx: HandlerContext) {
  const themeDir = join(ctx.settingsPath, 'themes')
  try {
    await fs.mkdir(themeDir, { recursive: true })
    const entries = await fs.readdir(themeDir, { withFileTypes: true })
    const summaries: { filename: string; name: string }[] = []
    for (const e of entries.filter((e) => e.isFile() && e.name.endsWith('.json'))) {
      try {
        const raw = await fs.readFile(join(themeDir, e.name), 'utf-8')
        const data = JSON.parse(raw)
        summaries.push({ filename: e.name, name: data.name ?? e.name.replace(/\.json$/, '') })
      } catch {
        /* skip malformed */
      }
    }
    return summaries
  } catch {
    return []
  }
}

export async function themeLoad(ctx: HandlerContext, filename: string) {
  const p = assertInside(join(ctx.settingsPath, 'themes'), filename)
  return JSON.parse(await fs.readFile(p, 'utf-8'))
}

export async function themeSave(
  ctx: HandlerContext,
  filename: string,
  data: unknown
): Promise<void> {
  const parsed = parseOrLog(ctx, 'theme:save', tileThemeSchema, data)
  const themeDir = join(ctx.settingsPath, 'themes')
  const p = assertInside(themeDir, filename)
  await fs.mkdir(themeDir, { recursive: true })
  await fs.writeFile(p, JSON.stringify(parsed, null, 2), 'utf-8')
}

export async function themeDelete(ctx: HandlerContext, filename: string): Promise<void> {
  await fs.unlink(assertInside(join(ctx.settingsPath, 'themes'), filename))
}

// ── Registration ────────────────────────────────────────────────────────────

export interface DialogShape {
  showOpenDialog: (
    opts: Electron.OpenDialogOptions
  ) => Promise<{ canceled: boolean; filePaths: string[] }>
  showSaveDialog: (
    opts: Electron.SaveDialogOptions
  ) => Promise<{ canceled: boolean; filePath?: string }>
}

export interface RegisterDeps {
  ipcMain: IpcMain
  BrowserWindow: typeof BrowserWindowType
  dialog: DialogShape
}

export function registerHandlers(deps: RegisterDeps, ctx: HandlerContext): void {
  const { ipcMain, BrowserWindow, dialog } = deps

  // Window controls
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

  // Settings / app
  ipcMain.handle('settings:load', () => loadSettings(ctx))
  ipcMain.handle('settings:save', (_, settings) => saveSettings(ctx, settings))
  ipcMain.handle('get-user-data-path', () => getUserDataPath(ctx))
  ipcMain.handle('app:launchCompanion', (_, p) => launchCompanion(ctx, p))
  ipcMain.handle('app:getVersion', () => getAppVersion(ctx))

  // Dialogs — every successful dialog return is added to ctx.blessedRoots so
  // the renderer can immediately read/write the picked path via Category-A
  // handlers without a separate "set active" round-trip.
  ipcMain.handle('dialog:openFile', async (_, filters?: Electron.FileFilter[]) => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filters ?? [{ name: 'All Files', extensions: ['*'] }]
    })
    const picked = r.filePaths[0] ?? null
    blessRoot(ctx, picked)
    return picked
  })
  ipcMain.handle('dialog:openDirectory', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    const picked = r.filePaths[0] ?? null
    blessRoot(ctx, picked)
    return picked
  })
  ipcMain.handle(
    'dialog:saveFile',
    async (_, filters?: Electron.FileFilter[], defaultPath?: string) => {
      const r = await dialog.showSaveDialog({
        filters: filters ?? [{ name: 'All Files', extensions: ['*'] }],
        defaultPath: defaultPath ?? undefined
      })
      const picked = r.filePath ?? null
      blessRoot(ctx, picked)
      return picked
    }
  )

  // Filesystem
  ipcMain.handle('fs:readFile', (_, p) => readFile(ctx, p))
  ipcMain.handle('fs:listDir', (_, p) => listDir(ctx, p))
  ipcMain.handle('fs:copyFile', (_, s, d) => copyFile(ctx, s, d))
  ipcMain.handle('fs:writeFile', (_, p, c) => writeFile(ctx, p, c))
  ipcMain.handle('fs:writeBytes', (_, p, d) => writeBytes(ctx, p, d))
  ipcMain.handle('fs:exists', (_, p) => exists(ctx, p))
  ipcMain.handle('fs:stat', (_, p) => stat(ctx, p))
  ipcMain.handle('fs:ensureDir', (_, p) => ensureDir(ctx, p))
  ipcMain.handle('fs:deleteFile', (_, p) => deleteFile(ctx, p))
  ipcMain.handle('fs:listArchive', (_, p) => listArchive(ctx, p))

  // Catalog
  ipcMain.handle('catalog:load', (_, p) => catalogLoad(ctx, p))
  ipcMain.handle('catalog:save', (_, p, d) => catalogSave(ctx, p, d))
  ipcMain.handle('catalog:scan', (_, p) => catalogScan(ctx, p))

  // Music
  ipcMain.handle('music:readFileMeta', (_, p) => musicReadFileMeta(ctx, p))
  ipcMain.handle('music:scan', (_, p) => musicScan(ctx, p))
  ipcMain.handle('music:metadata:load', (_, p) => musicMetadataLoad(ctx, p))
  ipcMain.handle('music:metadata:save', (_, p, d) => musicMetadataSave(ctx, p, d))
  ipcMain.handle('music:packs:load', (_, p) => musicPacksLoad(ctx, p))
  ipcMain.handle('music:packs:save', (_, p, packs) => musicPacksSave(ctx, p, packs))
  ipcMain.handle('music:deploy-pack', (_, src, pack, dst, ffmpeg, kbps, sr) =>
    musicDeployPack(ctx, src, pack, dst, ffmpeg, kbps, sr)
  )
  ipcMain.handle('music:client:scan', (_, p) => musicClientScan(ctx, p))

  // SFX
  ipcMain.handle('sfx:list', (_, p) => sfxList(ctx, p))
  ipcMain.handle('sfx:readEntry', (_, p, n) => sfxReadEntry(ctx, p, n))
  ipcMain.handle('sfx:index:load', (_, p) => sfxIndexLoad(ctx, p))
  ipcMain.handle('sfx:index:save', (_, p, d) => sfxIndexSave(ctx, p, d))

  // BIK conversion
  ipcMain.handle('bik:convert', (_, bytes, ffmpegPath, cacheDir) =>
    bikConvert(ctx, bytes, ffmpegPath, cacheDir)
  )

  // World index
  ipcMain.handle('index:read', (_, p) => indexRead(ctx, p))
  ipcMain.handle('index:build', (_, p) => indexBuild(ctx, p))
  ipcMain.handle('index:status', (_, p) => indexStatus(ctx, p))
  ipcMain.handle('index:delete', (_, p) => indexDelete(ctx, p))
  ipcMain.handle('library:resolve', (_, p) => libraryResolve(ctx, p))

  // Prefabs
  ipcMain.handle('prefab:list', (_, p) => prefabList(ctx, p))
  ipcMain.handle('prefab:load', (_, p, f) => prefabLoad(ctx, p, f))
  ipcMain.handle('prefab:save', (_, p, f, d) => prefabSave(ctx, p, f, d))
  ipcMain.handle('prefab:delete', (_, p, f) => prefabDelete(ctx, p, f))
  ipcMain.handle('prefab:rename', (_, p, o, n) => prefabRename(ctx, p, o, n))

  // Asset packs
  ipcMain.handle('pack:scan', (_, p) => packScan(ctx, p))
  ipcMain.handle('pack:load', (_, p) => packLoad(ctx, p))
  ipcMain.handle('pack:save', (_, p, d) => packSave(ctx, p, d))
  ipcMain.handle('pack:delete', (_, p) => packDelete(ctx, p))
  ipcMain.handle('pack:addAsset', (_, d, s, t) => packAddAsset(ctx, d, s, t))
  ipcMain.handle('pack:removeAsset', (_, d, f) => packRemoveAsset(ctx, d, f))
  ipcMain.handle('pack:compile', (_, d, m, f, o) => packCompile(ctx, d, m, f, o))

  // Palettes
  ipcMain.handle('palette:scan', (_, p) => paletteScan(ctx, p))
  ipcMain.handle('palette:load', (_, p) => paletteLoad(ctx, p))
  ipcMain.handle('palette:save', (_, p, d) => paletteSave(ctx, p, d))
  ipcMain.handle('palette:delete', (_, p) => paletteDelete(ctx, p))
  ipcMain.handle('palette:calibrationLoad', (_, d, id) => paletteCalibrationLoad(ctx, d, id))
  ipcMain.handle('palette:calibrationSave', (_, d, id, data) =>
    paletteCalibrationSave(ctx, d, id, data)
  )
  ipcMain.handle('frame:scan', (_, p) => frameScan(ctx, p))

  // Tile scanner
  ipcMain.handle('tileScan:analyze', (_, paths) => tileScanAnalyze(ctx, paths))

  // Themes
  ipcMain.handle('theme:list', () => themeList(ctx))
  ipcMain.handle('theme:load', (_, f) => themeLoad(ctx, f))
  ipcMain.handle('theme:save', (_, f, d) => themeSave(ctx, f, d))
  ipcMain.handle('theme:delete', (_, f) => themeDelete(ctx, f))
}
