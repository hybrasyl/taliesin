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
  deleteIndex,
  listSectionFiles
} from '@eriscorp/hybindex-ts'
import type { WorldIndex } from '@eriscorp/hybindex-ts'
import { resolveLibraryPath } from './libraryPath'
import {
  loadPacks,
  listActivePacks,
  listCoveredIds,
  listImageEntries,
  readPackEntry,
  resolveAssetBytes,
  suggestedBrigidAssetsPath
} from './assetPacks'
import { assertInside, assertInsideAnyRoot } from './pathSafety'
import { readJsonOr, writeJsonFile, scanJsonDir } from './jsonStore'
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
  /**
   * Called once when the renderer signals `app:ready` (settings hydrated).
   * Wired up in index.ts to reveal the main window + tear down the splash.
   */
  onAppReady?: () => void
  /**
   * Opens the OS file manager with settings.json highlighted. Wired up in
   * index.ts, which owns the electron `shell` reference and settings path.
   */
  revealSettings?: () => void
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
  // Installed .datf packs live here; whitelist it so pack-adjacent reads (e.g.
  // audio preview of an installed pack) pass the path-safety check.
  if (settings.brigidAssetsPath) ctx.settingsRoots.add(settings.brigidAssetsPath)
  // Whitelist EVERY configured world library (each is a <world>/xml dir) plus its
  // world parent — not just the active one. The Settings index panel checks
  // status for every library, and sibling dirs (mapfiles, .creidhne,
  // worldmaps/.ignore) hang off the world parent. Skip a dirname that equals the
  // path (e.g. drive root) to avoid blessing an entire drive.
  const libs = new Set<string>(settings.libraries ?? [])
  if (settings.activeLibrary) libs.add(settings.activeLibrary)
  for (const lib of libs) {
    ctx.settingsRoots.add(lib)
    const worldRoot = dirname(lib)
    if (worldRoot && worldRoot !== lib) ctx.settingsRoots.add(worldRoot)
  }
  if (settings.activeMapDirectory) ctx.settingsRoots.add(settings.activeMapDirectory)
  if (settings.musicLibraryPath) ctx.settingsRoots.add(settings.musicLibraryPath)
  // All music working dirs, not just the active one, so previewing a deployed
  // track in any configured working dir passes path-safety.
  for (const d of settings.musicWorkingDirs ?? []) ctx.settingsRoots.add(d)
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
  const parsed = parseOrLog(
    ctx,
    'settings:save',
    taliesinSettingsSchema,
    settings
  ) as TaliesinSettings
  const prev = await ctx.settingsManager.load().catch(() => null)
  await ctx.settingsManager.save(parsed)
  // Refresh the allowed-root set so subsequent path-validating handlers
  // see the new active library / pack / etc. without waiting for a restart.
  applySettingsRoots(ctx, parsed)
  // Reload installed .datf packs when a pack-source path changes, so the map +
  // worldmap editors pick up new overrides without a restart.
  if (
    !prev ||
    prev.brigidAssetsPath !== parsed.brigidAssetsPath ||
    prev.clientPath !== parsed.clientPath
  ) {
    void loadPacks({
      brigidAssetsPath: parsed.brigidAssetsPath ?? null,
      clientPath: parsed.clientPath ?? null
    })
  }
}

export function getUserDataPath(ctx: HandlerContext): string {
  return ctx.settingsPath
}

/**
 * Re-scan installed .datf packs from the currently-configured sources. Called
 * on demand (e.g. when the map-editor music picker opens) so a pack dropped
 * into the assets dir since launch is picked up without a restart. Cheap — reads
 * each pack's manifest + zip index, not its asset bytes.
 */
export async function reloadPacks(ctx: HandlerContext): Promise<void> {
  const s = await ctx.settingsManager.load()
  await loadPacks({
    brigidAssetsPath: s.brigidAssetsPath ?? null,
    clientPath: s.clientPath ?? null
  })
}

/**
 * ID3/tag metadata (title / artist / album) for an installed pack audio track,
 * or null if the pack doesn't cover it or the entry has no tags. Used by the
 * music picker to label pack tracks. `artist` is the TPE1 "contributing artist".
 */
export async function packTrackMeta(
  subtype: string,
  id: number | string
): Promise<{ title: string | null; artist: string | null; album: string | null } | null> {
  const r = await resolveAssetBytes(subtype, id)
  if (!r) return null
  try {
    const { parseBuffer } = await import('music-metadata')
    const meta = await parseBuffer(
      r.bytes,
      { mimeType: r.mime },
      { duration: false, skipCovers: true }
    )
    const { title, artist, album } = meta.common
    if (!title && !artist && !album) return null
    return { title: title ?? null, artist: artist ?? null, album: album ?? null }
  } catch {
    return null
  }
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
  try {
    const entries = await fs.readdir(safe, { withFileTypes: true })
    return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }))
  } catch (err) {
    // A not-yet-created dir (e.g. maps/.ignore before the first archive) lists as
    // empty rather than throwing — the path-safety check above still applies, so
    // this only softens "directory absent", not "path not allowed".
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

/**
 * List one world type's `.xml` files (`maps`, `castables`, …) recursively,
 * already split into active and archived. Returns the section's absolute `dir`
 * (forward-slashed) plus type-relative, forward-slashed, sorted rel paths —
 * `fire/blast.xml`, `.ignore/old.xml`.
 *
 * Delegates to hybindex's own `listSectionFiles` rather than walking here:
 * that function is the single definition of which files belong to a section —
 * the index builder and its stat cache both go through it — so a scanner of
 * our own would be a third implementation, free to disagree with the index
 * about what exists. Each returned rel path *is* the `<type>NamesByFilename` /
 * `MapDetail.filename` key, so callers look names up directly with no
 * `.ignore/` prefix handling.
 */
export async function listSection(
  ctx: HandlerContext,
  libraryPath: string,
  type: string
): Promise<{ dir: string; active: string[]; archived: string[] }> {
  const safeLib = assertInsideAnyRoot(allRoots(ctx), libraryPath)
  // `type` needs its own traversal check: listSectionFiles joins it onto the
  // library internally, so validating libraryPath alone does not contain it —
  // a `type` of '../../..' would enumerate the disk outside the world.
  assertInside(safeLib, type)
  const { dir, active, archived } = await listSectionFiles(safeLib, type)
  // `join` returns native separators; the renderer composes paths as
  // `${dir}/${rel}` with forward slashes. Handing back a native `dir` makes
  // `selectedFile.path === file.path` silently false, which drops the file
  // list's selection highlight after a rename.
  return { dir: dir.replace(/\\/g, '/'), active, archived }
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
  return readJsonOr<Record<string, unknown>>(getCatalogPath(safeDir), {})
}

export async function catalogSave(
  ctx: HandlerContext,
  dirPath: string,
  data: unknown
): Promise<void> {
  const safeDir = assertInsideAnyRoot(allRoots(ctx), dirPath)
  const parsed = parseOrLog(ctx, 'catalog:save', catalogDataSchema, data)
  await writeJsonFile(getCatalogPath(safeDir), parsed)
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
  return readJsonOr<Record<string, unknown>>(join(safe, 'music-library.json'), {})
}

export async function musicMetadataSave(
  ctx: HandlerContext,
  dirPath: string,
  data: unknown
): Promise<void> {
  const safe = assertInsideAnyRoot(allRoots(ctx), dirPath)
  const parsed = parseOrLog(ctx, 'music:metadata:save', musicMetaDataSchema, data)
  await writeJsonFile(join(safe, 'music-library.json'), parsed)
}

export async function musicPacksLoad(ctx: HandlerContext, dirPath: string): Promise<unknown> {
  const safe = assertInsideAnyRoot(allRoots(ctx), dirPath)
  return readJsonOr<unknown>(join(safe, 'music-packs.json'), [])
}

export async function musicPacksSave(
  ctx: HandlerContext,
  dirPath: string,
  packs: unknown
): Promise<void> {
  const safe = assertInsideAnyRoot(allRoots(ctx), dirPath)
  const parsed = parseOrLog(ctx, 'music:packs:save', musicPackArraySchema, packs)
  await writeJsonFile(join(safe, 'music-packs.json'), parsed)
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
  return readJsonOr<Record<string, unknown>>(join(safe, '..', 'sfx-index.json'), {})
}

export async function sfxIndexSave(
  ctx: HandlerContext,
  activeLibrary: string,
  data: unknown
): Promise<void> {
  const safe = assertInsideAnyRoot(allRoots(ctx), activeLibrary)
  const parsed = parseOrLog(ctx, 'sfx:index:save', sfxIndexSchema, data)
  await writeJsonFile(join(safe, '..', 'sfx-index.json'), parsed)
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

/**
 * Builds currently running, keyed by normalized library path.
 *
 * Nothing upstream serialises build requests, so concurrent callers each ran a
 * full `buildIndex` + `saveIndex` over the same world. Writes are atomic per
 * *file*, but a build writes ~18 of them, so two builds interleave at file
 * granularity and leave a `_filecache.json` that disagrees with the per-type
 * files beside it. That self-heals (the next status reports stale and rebuilds)
 * but costs a wasted rebuild and opens a window where a reader sees a
 * mixed-generation index. Collapsing concurrent requests onto one promise
 * closes it.
 */
const inflightBuilds = new Map<string, Promise<WorldIndex>>()

export async function indexBuild(ctx: HandlerContext, libraryRoot: string): Promise<WorldIndex> {
  const safe = assertInsideAnyRoot(allRoots(ctx), libraryRoot)
  // Key on the normalized path rather than the raw argument. `normalize` keeps
  // a trailing separator ('/lib/' → '\lib\'), so strip it too, or one world
  // reached by two spellings would build twice. The fallback keeps a
  // separator-only path non-empty.
  const key = safe.replace(/[\\/]+$/, '') || safe
  const existing = inflightBuilds.get(key)
  if (existing) return existing
  const build = (async () => {
    const idx = await buildIndex(safe)
    await saveIndex(safe, idx)
    return idx
  })().finally(() => {
    // Clear on rejection too — a failed build must not poison the world until
    // the process restarts.
    inflightBuilds.delete(key)
  })
  inflightBuilds.set(key, build)
  return build
}

/** Test seam: the map is module state and outlives individual test cases. */
export function __resetInflightBuilds(): void {
  inflightBuilds.clear()
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
  return scanJsonDir(
    prefabDir(safeLib),
    (raw, filename) => {
      const data = raw as {
        name?: string
        width?: number
        height?: number
        createdAt?: string
        updatedAt?: string
      }
      return {
        filename,
        name: data.name ?? filename.replace(/\.json$/, ''),
        width: data.width ?? 0,
        height: data.height ?? 0,
        createdAt: data.createdAt ?? '',
        updatedAt: data.updatedAt ?? ''
      }
    },
    { ensure: true }
  )
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
  // Thunk so an out-of-root path fails soft to [] (see scanJsonDir).
  return scanJsonDir(
    () => assertInsideAnyRoot(allRoots(ctx), dirPath),
    (raw, filename) => {
      const data = raw as Record<string, unknown>
      if (data.pack_id && data.content_type) return { filename, ...data }
      return null
    }
  )
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
  await writeJsonFile(safe, parsed)
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
  // ui_sprite_overrides nests frames inside per-source-file folders
  // (e.g. mile.spf/0001.png), so the destination's parent may be deeper than
  // packDir. mkdir-p the target's parent before the copy.
  await fs.mkdir(dirname(dest), { recursive: true })
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

export interface PackImportResult {
  /** Filename of the project .json file that was written under `packDir`. */
  projectFilename: string
  /** Non-fatal warnings (e.g. unparseable filenames that were skipped). */
  warnings: string[]
}

// Hydrate per-asset metadata from the on-wire covers blob. Today only
// item_icons.no_dye round-trips into assetMeta. Other content types return
// undefined.
function hydrateAssetMeta(
  contentType: string,
  covers: Record<string, unknown>,
  assetFilenames: string[]
): Record<string, Record<string, unknown>> | undefined {
  if (contentType !== 'item_icons') return undefined
  const itemCovers = covers.item_icons as { no_dye?: number[] } | undefined
  const noDyeIds = new Set(itemCovers?.no_dye ?? [])
  if (noDyeIds.size === 0) return undefined
  const meta: Record<string, Record<string, unknown>> = {}
  for (const filename of assetFilenames) {
    const m = filename.match(/^item(\d{5})\.png$/i)
    if (m && noDyeIds.has(parseInt(m[1], 10))) {
      meta[filename] = { noDye: true }
    }
  }
  return Object.keys(meta).length > 0 ? meta : undefined
}

export async function packImport(
  ctx: HandlerContext,
  datfPath: string,
  packDir: string,
  options?: { force?: boolean }
): Promise<PackImportResult> {
  const safeDatf = assertInsideAnyRoot(allRoots(ctx), datfPath)
  const safePackDir = assertInsideAnyRoot(allRoots(ctx), packDir)
  if (!safeDatf.toLowerCase().endsWith('.datf')) {
    throw new Error('pack:import expects a path ending in .datf')
  }

  // Read the entire .datf into a buffer; unzipper.Open.buffer parses the
  // central directory without unpacking the whole archive into memory twice.
  const datfBytes = await fs.readFile(safeDatf)
  const unzipper = (await import('unzipper')).default
  const directory = await unzipper.Open.buffer(datfBytes)

  const manifestEntry = directory.files.find(
    (f: { path: string; type: string }) => f.path === '_manifest.json' && f.type === 'File'
  )
  if (!manifestEntry) {
    throw new Error('Missing _manifest.json in .datf archive')
  }

  let manifestRaw: string
  try {
    manifestRaw = (await manifestEntry.buffer()).toString('utf-8')
  } catch (e) {
    throw new Error(`Failed to read _manifest.json: ${e instanceof Error ? e.message : 'unknown'}`)
  }
  let manifestJson: unknown
  try {
    manifestJson = JSON.parse(manifestRaw)
  } catch (e) {
    throw new Error(
      `_manifest.json is not valid JSON: ${e instanceof Error ? e.message : 'unknown'}`
    )
  }
  const manifest = parseOrLog(ctx, 'pack:import:manifest', packManifestSchema, manifestJson)

  const packId = manifest.pack_id
  const projectFilename = `${packId}.json`
  const projectFilePath = assertInside(safePackDir, projectFilename)
  const packAssetsDir = assertInside(safePackDir, packId)

  // Refuse to overwrite an existing pack project unless caller opts in.
  let projectExists = false
  try {
    await fs.access(projectFilePath)
    projectExists = true
  } catch {
    /* fresh */
  }
  if (projectExists && !options?.force) {
    throw new Error(
      `Pack project '${projectFilename}' already exists in ${safePackDir}; pass { force: true } to overwrite`
    )
  }

  await fs.mkdir(packAssetsDir, { recursive: true })

  // Extract every non-manifest entry. assertInside on each entry name blocks
  // Zip-Slip (../escape.png and friends).
  const warnings: string[] = []
  const assetFilenames: string[] = []
  for (const file of directory.files as {
    path: string
    type: string
    buffer: () => Promise<Buffer>
  }[]) {
    if (file.type !== 'File') continue
    if (file.path === '_manifest.json') continue

    let dest: string
    try {
      dest = assertInside(packAssetsDir, file.path)
    } catch (e) {
      warnings.push(
        `Skipped unsafe entry '${file.path}': ${e instanceof Error ? e.message : 'rejected'}`
      )
      continue
    }
    await fs.mkdir(dirname(dest), { recursive: true })
    const buf = await file.buffer()
    await fs.writeFile(dest, buf)
    assetFilenames.push(file.path)
  }

  const now = new Date().toISOString()
  const project = {
    pack_id: manifest.pack_id,
    pack_version: manifest.pack_version,
    content_type: manifest.content_type,
    priority: manifest.priority ?? 100,
    covers: manifest.covers,
    assets: assetFilenames.map((name) => ({
      filename: name,
      sourcePath: assertInside(packAssetsDir, name)
    })),
    assetMeta: hydrateAssetMeta(manifest.content_type, manifest.covers, assetFilenames),
    createdAt: now,
    updatedAt: now
  }
  // Re-parse via the project schema to catch any mismatch (e.g. the manifest
  // had an unknown content_type that snuck past the manifest schema, or the
  // assetMeta map keys don't match the assets).
  const validated = parseOrLog(ctx, 'pack:import', packProjectSchema, project)

  await fs.writeFile(projectFilePath, JSON.stringify(validated, null, 2), 'utf-8')

  return { projectFilename, warnings }
}

// ── Palettes ─────────────────────────────────────────────────────────────────

const palettesSubdir = (packDir: string) => join(packDir, '_palettes')
const calibrationsSubdir = (packDir: string) => join(packDir, '_calibrations')

export async function paletteScan(ctx: HandlerContext, packDir: string) {
  // Thunk so an out-of-root path fails soft to [] (see scanJsonDir).
  const palettes = await scanJsonDir(
    () => palettesSubdir(assertInsideAnyRoot(allRoots(ctx), packDir)),
    (raw, filename) => {
      const data = raw as { id?: string; name?: string; entries?: unknown[] }
      if (data.id && Array.isArray(data.entries)) {
        return {
          filename,
          id: data.id,
          name: data.name ?? data.id,
          entryCount: data.entries.length
        }
      }
      return null
    }
  )
  return palettes.sort((a, b) => a.id.localeCompare(b.id))
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
  await writeJsonFile(safe, parsed)
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
  return readJsonOr<Record<string, unknown>>(
    assertInside(calibrationsSubdir(safePack), `${paletteId}.json`),
    {}
  )
}

export async function paletteCalibrationSave(
  ctx: HandlerContext,
  packDir: string,
  paletteId: string,
  data: unknown
): Promise<void> {
  const safePack = assertInsideAnyRoot(allRoots(ctx), packDir)
  const parsed = parseOrLog(ctx, 'palette:calibrationSave', calibrationFileSchema, data)
  await writeJsonFile(assertInside(calibrationsSubdir(safePack), `${paletteId}.json`), parsed)
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
  return scanJsonDir(
    join(ctx.settingsPath, 'themes'),
    (raw, filename) => {
      const data = raw as { name?: string }
      return { filename, name: data.name ?? filename.replace(/\.json$/, '') }
    },
    { ensure: true }
  )
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
  await writeJsonFile(assertInside(join(ctx.settingsPath, 'themes'), filename), parsed)
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

  // Renderer signals it has hydrated (settings loaded) → reveal main window and
  // dismiss the splash. Handled in index.ts, which owns the window refs.
  ipcMain.on('app:ready', () => {
    ctx.onAppReady?.()
  })

  // Settings / app
  ipcMain.handle('settings:load', () => loadSettings(ctx))
  ipcMain.handle('settings:save', (_, settings) => saveSettings(ctx, settings))

  // Installed .datf pack consumption (static_tiles / world_maps overrides).
  ipcMain.handle('pack:listActive', () => listActivePacks())
  ipcMain.handle('pack:listImageEntries', () => listImageEntries())
  ipcMain.handle('pack:readEntry', (_, packFile: string, entryPath: string) =>
    readPackEntry(packFile, entryPath)
  )
  ipcMain.handle('pack:listCoveredIds', (_, subtype: string) => listCoveredIds(subtype))
  ipcMain.handle('pack:resolveAsset', (_, subtype: string, id: number | string) =>
    resolveAssetBytes(subtype, id)
  )
  ipcMain.handle('pack:suggestedBrigidAssetsPath', () => suggestedBrigidAssetsPath())
  ipcMain.handle('pack:reload', () => reloadPacks(ctx))
  ipcMain.handle('pack:trackMeta', (_, subtype: string, id: number | string) =>
    packTrackMeta(subtype, id)
  )
  ipcMain.handle('get-user-data-path', () => getUserDataPath(ctx))
  ipcMain.handle('app:launchCompanion', (_, p) => launchCompanion(ctx, p))
  ipcMain.handle('app:getVersion', () => getAppVersion(ctx))
  // Reveal settings.json in the OS file manager. Handled in index.ts, which
  // owns the electron `shell` reference.
  ipcMain.handle('app:revealSettings', () => {
    ctx.revealSettings?.()
  })

  // Dialogs — every successful dialog return is added to ctx.blessedRoots so
  // the renderer can immediately read/write the picked path via Category-A
  // handlers without a separate "set active" round-trip.
  ipcMain.handle(
    'dialog:openFile',
    async (_, filters?: Electron.FileFilter[], defaultPath?: string) => {
      const r = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: filters ?? [{ name: 'All Files', extensions: ['*'] }],
        ...(defaultPath ? { defaultPath } : {})
      })
      const picked = r.filePaths[0] ?? null
      blessRoot(ctx, picked)
      return picked
    }
  )
  ipcMain.handle(
    'dialog:openFiles',
    async (_, filters?: Electron.FileFilter[], defaultPath?: string) => {
      const r = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: filters ?? [{ name: 'All Files', extensions: ['*'] }],
        ...(defaultPath ? { defaultPath } : {})
      })
      for (const p of r.filePaths) blessRoot(ctx, p)
      return r.filePaths
    }
  )
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
  ipcMain.handle('fs:listSection', (_, p, t) => listSection(ctx, p, t))
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
  ipcMain.handle('pack:import', (_, d, p, o) => packImport(ctx, d, p, o))

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
