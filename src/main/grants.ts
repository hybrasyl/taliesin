/**
 * Filesystem and executable authority that main owns (HTOO-673, HTOO-674).
 *
 * The renderer writes settings.json, so settings.json cannot be the record of
 * what the renderer may touch. This module keeps that record in `grants.json`,
 * beside settings.json, in a folder that no IPC root covers. Only main writes
 * it, and only from three sources:
 *
 * 1. A native dialog result (the user chose the path).
 * 2. A path that main computes itself (for example the suggested Brigid
 *    assets folder).
 * 3. The one-time migration, which accepts the paths in an existing
 *    settings.json once, when grants.json does not exist yet.
 *
 * A path in settings becomes an IPC root only when it is inside a grant. A
 * settings save cannot add authority. It can only keep or drop it.
 *
 * Executables (ffmpeg, the companion) are recorded with their size, mtime and
 * SHA-256. Main checks the file again before each run, so a file that changed
 * after the user chose it does not run.
 */
import { createHash } from 'crypto'
import { createReadStream, promises as fs } from 'fs'
import { dirname, join } from 'path'
import { z } from 'zod'
import { isInsideAnyRoot } from './pathSafety'
import type { TaliesinSettings } from './settingsManager'

export const GRANTS_FILENAME = 'grants.json'
export const GRANTS_VERSION = 1

export const EXEC_KINDS = ['ffmpeg', 'companion'] as const
export type ExecKind = (typeof EXEC_KINDS)[number]

export interface ExecGrant {
  path: string
  size: number
  mtimeMs: number
  /** Null for a directory (a macOS `.app` bundle): main checks only that it exists. */
  sha256: string | null
  isDirectory: boolean
}

export interface GrantsData {
  version: typeof GRANTS_VERSION
  dirs: string[]
  executables: Partial<Record<ExecKind, ExecGrant>>
}

/** The live grant state on the handler context. */
export interface GrantState {
  dirs: Set<string>
  executables: Partial<Record<ExecKind, ExecGrant>>
  /** Writes the state to disk. Absent in tests that do not persist. */
  persist?: (data: GrantsData) => Promise<void>
}

const execGrantSchema = z.object({
  path: z.string().min(1),
  size: z.number(),
  mtimeMs: z.number(),
  sha256: z.string().nullable(),
  isDirectory: z.boolean()
})

const grantsFileSchema = z.object({
  version: z.literal(GRANTS_VERSION),
  dirs: z.array(z.string().min(1)),
  executables: z
    .object({ ffmpeg: execGrantSchema.optional(), companion: execGrantSchema.optional() })
    .default({})
})

export function emptyGrants(): GrantState {
  return { dirs: new Set<string>(), executables: {} }
}

export function snapshotGrants(g: GrantState): GrantsData {
  return { version: GRANTS_VERSION, dirs: [...g.dirs].sort(), executables: { ...g.executables } }
}

/** Every directory path in a settings snapshot. Executables are not here: see `EXEC_KINDS`. */
export function settingsDirPaths(s: Partial<TaliesinSettings>): string[] {
  const out = new Set<string>()
  const add = (p: string | null | undefined): void => {
    if (typeof p === 'string' && p.length > 0) out.add(p)
  }
  add(s.clientPath)
  add(s.brigidAssetsPath)
  for (const l of s.libraries ?? []) add(l)
  add(s.activeLibrary)
  for (const d of s.mapDirectories ?? []) add(d.path)
  add(s.activeMapDirectory)
  add(s.musicLibraryPath)
  for (const d of s.musicWorkingDirs ?? []) add(d)
  add(s.activeMusicWorkingDir)
  add(s.packDir)
  return [...out]
}

/**
 * True when `p` is inside a persisted grant or a path the user chose in a
 * dialog this session. Lexical only: the real-path check happens at I/O.
 */
export function isGranted(g: GrantState, sessionRoots: Iterable<string>, p: string): boolean {
  return isInsideAnyRoot(g.dirs, p) || isInsideAnyRoot(sessionRoots, p)
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve())
  })
  return hash.digest('hex')
}

/** Measure an executable for a grant. Throws when the path does not exist. */
export async function measureExecutable(path: string): Promise<ExecGrant> {
  const st = await fs.stat(path)
  const isDirectory = st.isDirectory()
  return {
    path,
    size: isDirectory ? 0 : st.size,
    mtimeMs: st.mtimeMs,
    sha256: isDirectory ? null : await sha256File(path),
    isDirectory
  }
}

/**
 * Check an executable grant against the disk before it runs.
 *
 * The file is hashed again only when its size or mtime changed. When the hash
 * still matches, the grant takes the new size and mtime and `changed` is true,
 * so the caller can persist it. Throws when the file is gone or its content
 * changed.
 */
export async function verifyExecutable(
  grant: ExecGrant
): Promise<{ grant: ExecGrant; changed: boolean }> {
  let st: Awaited<ReturnType<typeof fs.stat>>
  try {
    st = await fs.stat(grant.path)
  } catch {
    throw new Error(`The program you chose is missing: ${grant.path}. Choose it again in Settings.`)
  }
  if (grant.isDirectory) {
    if (!st.isDirectory()) throw new Error(`The program you chose changed: ${grant.path}.`)
    return { grant, changed: false }
  }
  if (st.size === grant.size && st.mtimeMs === grant.mtimeMs) return { grant, changed: false }
  const sha = await sha256File(grant.path)
  if (sha !== grant.sha256) {
    throw new Error(
      `The program at ${grant.path} changed after you chose it. Choose it again in Settings.`
    )
  }
  return { grant: { ...grant, size: st.size, mtimeMs: st.mtimeMs }, changed: true }
}

/**
 * Load grants.json, or run the one-time migration when it does not exist.
 *
 * A file that exists but does not parse gives an empty state (fail closed):
 * the user chooses the folders again. Only main writes the file, through a
 * temporary file and a rename, so a damaged file is not an ordinary event.
 */
export async function loadOrMigrateGrants(
  settingsDir: string,
  settings: Partial<TaliesinSettings>,
  log: (msg: string) => void = () => undefined
): Promise<GrantState> {
  const path = join(settingsDir, GRANTS_FILENAME)
  const persist = (data: GrantsData): Promise<void> => writeGrantsFile(path, data)
  let raw: string | null = null
  try {
    raw = await fs.readFile(path, 'utf-8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  if (raw !== null) {
    try {
      const data = grantsFileSchema.parse(JSON.parse(raw))
      return { dirs: new Set(data.dirs), executables: data.executables, persist }
    } catch (e) {
      log(`grants.json is not valid and was ignored: ${e instanceof Error ? e.message : e}`)
      return { ...emptyGrants(), persist }
    }
  }

  // Migration: accept what settings.json already names, once.
  const state: GrantState = { dirs: new Set(settingsDirPaths(settings)), executables: {}, persist }
  const execFromSettings: Record<ExecKind, string | null | undefined> = {
    ffmpeg: settings.ffmpegPath,
    companion: settings.companionPath
  }
  for (const kind of EXEC_KINDS) {
    const p = execFromSettings[kind]
    if (!p) continue
    try {
      state.executables[kind] = await measureExecutable(p)
    } catch {
      log(`${kind} path from settings.json is missing and was not accepted: ${p}`)
    }
  }
  await persist(snapshotGrants(state))
  return state
}

async function writeGrantsFile(path: string, data: GrantsData): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
  await fs.rename(tmp, path)
}
