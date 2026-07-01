// Consumer side of the .datf asset-pack system: detect packs installed on the
// machine (Brigid's per-user assets dir + the DA client dir) and resolve
// static_tiles / world_maps overrides so Taliesin's map + worldmap renderers
// preview exactly what Brigid will draw. Taliesin AUTHORS every content type
// (see src/renderer/src/packKinds/), but only these two are consumed here —
// they're the ones that change map rendering.
//
// Ported from Creidhne's src/main/assetPacks/ (which mirrors Brigid's
// AssetPackRegistry). Highest manifest.priority wins; ties resolve to the first
// source scanned. Validation is deliberately lenient (matches Brigid's
// acceptance, not Taliesin's strict author schema) so any pack the client would
// load also previews here.

import { promises as fs } from 'fs'
import { join } from 'path'

// unzipper ships no types; we import it dynamically (as elsewhere in main) and
// describe only the surface we use. `.buffer()` reads a single entry's bytes.
interface ZipEntry {
  path: string
  type?: string
  buffer(): Promise<Buffer>
}
interface ZipDirectory {
  files: ZipEntry[]
}

export interface PackManifest {
  schema_version: number
  content_type: string
  pack_id: string
  pack_version?: string
  priority?: number
  covers?: Record<string, unknown>
  [key: string]: unknown
}

/** A recognized pack entry: which subtype + id it covers, and its lookup key. */
export interface ParsedEntry {
  subtype: string
  id: number | string
  key: string
}

/** Per-content-type filename convention. Mirrors the authoring PackKind. */
export interface PackHandler {
  contentType: string
  subtypes: string[]
  /** Parse a zip entry path → coverage, or null if it isn't a recognized asset. */
  parseEntry(path: string): ParsedEntry | null
  /** Entry-cache key for a (subtype, id) lookup, or null if not this handler's subtype. */
  keyFor(subtype: string, id: number | string): string | null
}

interface PackInfo {
  filePath: string
  fileName: string
  manifest: PackManifest
  handler: PackHandler
  entries: Map<string, ZipEntry>
  coverage: Map<string, Set<number | string>>
}

interface PackState {
  sources: string[]
  packs: PackInfo[]
}

/** IPC-safe pack summary (no zip-entry refs / handler instance). */
export interface PackSummary {
  fileName: string
  manifest: PackManifest
  coveredSubtypes: string[]
}

// ── Handlers ────────────────────────────────────────────────────────────────

// static_tiles: floor{id:D5}.png / wall{id:D5}.png at the zip root. id is the
// raw MapTile value (no offset). Two subtypes so the map renderer can look up
// background ('floor') and foreground ('wall') independently.
const STATIC_TILES_RE = /^(floor|wall)(\d+)\.png$/i

const staticTilesHandler: PackHandler = {
  contentType: 'static_tiles',
  subtypes: ['floor', 'wall'],
  parseEntry(path) {
    const base = path.split(/[\\/]/).pop() ?? ''
    const m = STATIC_TILES_RE.exec(base)
    if (!m) return null
    const subtype = m[1].toLowerCase()
    const id = parseInt(m[2], 10)
    if (!Number.isFinite(id)) return null
    return { subtype, id, key: `${subtype}:${id}` }
  },
  keyFor(subtype, id) {
    const s = String(subtype).toLowerCase()
    if (s !== 'floor' && s !== 'wall') return null
    return `${s}:${id}`
  }
}

// world_maps: {fieldName}.png at the zip root; the field name is the identity.
// Matched case-insensitively to mirror Brigid's OrdinalIgnoreCase entry index.
const WORLD_MAP_RE = /^([^/\\]+)\.png$/i

const worldMapsHandler: PackHandler = {
  contentType: 'world_maps',
  subtypes: ['world_maps'],
  parseEntry(path) {
    if (/[\\/]/.test(path)) return null // root-level only
    const m = WORLD_MAP_RE.exec(path)
    if (!m) return null
    const field = m[1].toLowerCase()
    return { subtype: 'world_maps', id: field, key: `world:${field}` }
  },
  keyFor(subtype, id) {
    if (String(subtype).toLowerCase() !== 'world_maps') return null
    return `world:${String(id).toLowerCase()}`
  }
}

// music: music_{id}.{ext} at the zip root, id is the integer music id. Consumed
// by the map-editor music picker to preview an installed pack override.
const MUSIC_RE = /^music_(\d+)\.(ogg|mp3|wav|flac|mus)$/i

const musicHandler: PackHandler = {
  contentType: 'music',
  subtypes: ['music'],
  parseEntry(path) {
    const base = path.split(/[\\/]/).pop() ?? ''
    const m = MUSIC_RE.exec(base)
    if (!m) return null
    const id = parseInt(m[1], 10)
    if (!Number.isFinite(id)) return null
    return { subtype: 'music', id, key: `music:${id}` }
  },
  keyFor(subtype, id) {
    if (String(subtype).toLowerCase() !== 'music') return null
    return `music:${id}`
  }
}

const HANDLERS = new Map<string, PackHandler>([
  [staticTilesHandler.contentType, staticTilesHandler],
  [worldMapsHandler.contentType, worldMapsHandler],
  [musicHandler.contentType, musicHandler]
])

// ── Manifest validation (lenient, matches Brigid) ─────────────────────────────

const SUPPORTED_SCHEMA_VERSIONS = new Set([1])

function validateManifest(
  raw: unknown
): { ok: true; manifest: PackManifest } | { ok: false; reason: string } {
  if (raw == null || typeof raw !== 'object') return { ok: false, reason: 'manifest is not an object' }
  const m = raw as Record<string, unknown>
  if (!SUPPORTED_SCHEMA_VERSIONS.has(m.schema_version as number)) {
    return { ok: false, reason: `unsupported schema_version ${String(m.schema_version)}` }
  }
  if (!m.content_type || typeof m.content_type !== 'string') {
    return { ok: false, reason: 'missing or non-string content_type' }
  }
  if (!m.pack_id || typeof m.pack_id !== 'string') {
    return { ok: false, reason: 'missing or non-string pack_id' }
  }
  return { ok: true, manifest: m as PackManifest }
}

// ── State ─────────────────────────────────────────────────────────────────────

let state: PackState = { sources: [], packs: [] }

// In-flight load so IPC getters can await it — otherwise the renderer's first
// listCoveredIds() races main's startup load and sees an empty set.
let pendingLoad: Promise<void> = Promise.resolve()

async function openZip(filePath: string): Promise<ZipDirectory | null> {
  try {
    const unzipper = (await import('unzipper')).default as unknown as {
      Open: { file(p: string): Promise<ZipDirectory> }
    }
    return await unzipper.Open.file(filePath)
  } catch (err) {
    console.warn(`[assetPacks] cannot open ${filePath}: ${(err as Error).message}`)
    return null
  }
}

async function loadPack(filePath: string): Promise<PackInfo | null> {
  const directory = await openZip(filePath)
  if (!directory) return null

  const manifestEntry = directory.files.find((f) => f.path === '_manifest.json')
  if (!manifestEntry) {
    console.warn(`[assetPacks] no _manifest.json in ${filePath}`)
    return null
  }

  let raw: unknown
  try {
    const buf = await manifestEntry.buffer()
    raw = JSON.parse(buf.toString('utf8'))
  } catch (err) {
    console.warn(`[assetPacks] malformed manifest in ${filePath}: ${(err as Error).message}`)
    return null
  }

  const validation = validateManifest(raw)
  if (!validation.ok) {
    console.warn(`[assetPacks] ${validation.reason} in ${filePath}`)
    return null
  }
  const manifest = validation.manifest

  const handler = HANDLERS.get(manifest.content_type)
  // Only static_tiles / world_maps affect map rendering; every other valid
  // content type is a silent skip (Taliesin authors them but doesn't consume
  // them here) — not an "unknown content_type" warning.
  if (!handler) return null

  const entries = new Map<string, ZipEntry>()
  const coverage = new Map<string, Set<number | string>>()
  for (const zipEntry of directory.files) {
    if (zipEntry.path === '_manifest.json') continue
    if (zipEntry.type && zipEntry.type !== 'File') continue
    const parsed = handler.parseEntry(zipEntry.path)
    if (!parsed) continue
    entries.set(parsed.key, zipEntry)
    if (!coverage.has(parsed.subtype)) coverage.set(parsed.subtype, new Set())
    coverage.get(parsed.subtype)!.add(parsed.id)
  }

  return {
    filePath,
    fileName: filePath.split(/[\\/]/).pop() ?? filePath,
    manifest,
    handler,
    entries,
    coverage
  }
}

// Scan one directory (top level only, mirroring Brigid's TopDirectoryOnly) for
// *.datf and load each. Missing/unreadable dirs yield [].
async function loadPacksFromDir(dir: string | null): Promise<PackInfo[]> {
  if (!dir) return []
  let files: string[] = []
  try {
    files = await fs.readdir(dir)
  } catch {
    return []
  }
  const packs: PackInfo[] = []
  for (const f of files.filter((f) => f.toLowerCase().endsWith('.datf'))) {
    const pack = await loadPack(join(dir, f))
    if (pack) packs.push(pack)
  }
  return packs
}

/**
 * Reload the merged pack set from the configured sources. Called on startup and
 * whenever `brigidAssetsPath` / `clientPath` change. Sources are scanned in
 * order (Brigid assets first, then the DA client dir); higher priority wins,
 * ties resolve to the first source scanned.
 */
export function loadPacks({
  brigidAssetsPath = null,
  clientPath = null
}: { brigidAssetsPath?: string | null; clientPath?: string | null } = {}): Promise<void> {
  pendingLoad = (async () => {
    const sources = [brigidAssetsPath, clientPath].filter((s): s is string => Boolean(s))
    const next: PackState = { sources, packs: [] }
    for (const dir of sources) {
      next.packs.push(...(await loadPacksFromDir(dir)))
    }
    // Higher priority resolves first; stable sort keeps source order for ties.
    // Absent priority defaults to 100 (Brigid's default).
    next.packs.sort((a, b) => (b.manifest.priority ?? 100) - (a.manifest.priority ?? 100))
    state = next
  })()
  return pendingLoad
}

/** IPC-safe summaries of the active packs. Awaits any in-flight load. */
export async function listActivePacks(): Promise<PackSummary[]> {
  await pendingLoad
  return state.packs.map((p) => ({
    fileName: p.fileName,
    manifest: p.manifest,
    coveredSubtypes: Array.from(p.coverage.keys())
  }))
}

/** IDs covered by any active pack for a subtype ('floor' | 'wall' | 'world_maps'). */
export async function listCoveredIds(subtype: string): Promise<(number | string)[]> {
  await pendingLoad
  const merged = new Set<number | string>()
  for (const pack of state.packs) {
    const set = pack.coverage.get(subtype)
    if (set) for (const id of set) merged.add(id)
  }
  const ids = Array.from(merged)
  return ids.every((x) => typeof x === 'number')
    ? (ids as number[]).sort((a, b) => a - b)
    : ids.sort((a, b) => String(a).localeCompare(String(b)))
}

// MIME by entry extension — image packs (static_tiles/world_maps) are PNG;
// music packs carry the source audio format.
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  mus: 'audio/mpeg'
}

// Read the highest-priority covering entry as { buffer, ext }, or null.
async function resolveEntry(
  subtype: string,
  id: number | string
): Promise<{ buffer: Buffer; ext: string } | null> {
  await pendingLoad
  for (const pack of state.packs) {
    const key = pack.handler.keyFor(subtype, id)
    if (!key) continue
    const entry = pack.entries.get(key)
    if (!entry) continue
    try {
      const buffer = await entry.buffer()
      const ext = (String(entry.path).split('.').pop() ?? '').toLowerCase()
      return { buffer, ext }
    } catch (err) {
      console.warn(`[assetPacks] failed reading ${subtype}:${id} from ${pack.fileName}: ${(err as Error).message}`)
    }
  }
  return null
}

/** Raw asset buffer from the highest-priority pack covering (subtype, id), or null. */
export async function resolveAsset(subtype: string, id: number | string): Promise<Buffer | null> {
  const r = await resolveEntry(subtype, id)
  return r ? r.buffer : null
}

/** A ready-to-use `data:<mime>;base64,…` URL (MIME inferred from the covering
 *  entry's extension — PNG for tiles, the source format for music), or null. */
export async function resolveAssetUrl(subtype: string, id: number | string): Promise<string | null> {
  const r = await resolveEntry(subtype, id)
  if (!r) return null
  const mime = MIME_BY_EXT[r.ext] ?? 'application/octet-stream'
  return `data:${mime};base64,${r.buffer.toString('base64')}`
}

/**
 * Suggested default for the Brigid assets dir on Windows —
 * `%LOCALAPPDATA%\erisco\Brigid\assets` (matches Brigid's AppPaths.AssetsDir).
 * Null when LOCALAPPDATA is absent (non-Windows); the user sets it manually.
 */
export function suggestedBrigidAssetsPath(): string | null {
  const localAppData = process.env.LOCALAPPDATA
  return localAppData ? join(localAppData, 'erisco', 'Brigid', 'assets') : null
}

/** Test hook — reset module state between tests. */
export function _resetForTests(): void {
  state = { sources: [], packs: [] }
  pendingLoad = Promise.resolve()
}

// Exposed for unit tests that exercise the filename conventions directly.
export const _handlers = { staticTilesHandler, worldMapsHandler, musicHandler }
