import { join } from 'path'
import { promises as fs } from 'fs'

export interface MapDirectory {
  path: string
  name: string
}

export interface TaliesinSettings {
  clientPath?: string
  /** Where installed Brigid .datf packs live; scanned to preview overrides in
   *  the map/worldmap editors. Defaults suggested to %LOCALAPPDATA%\erisco\Brigid\assets. */
  brigidAssetsPath?: string
  libraries: string[]
  activeLibrary: string | null
  mapDirectories: MapDirectory[]
  activeMapDirectory: string | null
  theme?: string
  lastOpenedArchive?: string
  musicLibraryPath?: string
  musicWorkingDirs: string[]
  activeMusicWorkingDir?: string
  ffmpegPath?: string
  musEncodeKbps: number
  musEncodeSampleRate: number
  packDir?: string
  companionPath?: string
  /** File-list grouping preference for the map / world map editors. */
  fileListViewMode?: 'flat' | 'folder'
}

const DEFAULTS: TaliesinSettings = {
  libraries: [],
  activeLibrary: null,
  mapDirectories: [],
  activeMapDirectory: null,
  musicWorkingDirs: [],
  musEncodeKbps: 64,
  musEncodeSampleRate: 22050
}

function validate(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  if (!Array.isArray(d.libraries)) return false
  if (!Array.isArray(d.mapDirectories)) return false
  return true
}

function withDefaults(data: Partial<TaliesinSettings>): TaliesinSettings {
  return {
    clientPath: typeof data.clientPath === 'string' ? data.clientPath : undefined,
    brigidAssetsPath: typeof data.brigidAssetsPath === 'string' ? data.brigidAssetsPath : undefined,
    libraries: Array.isArray(data.libraries) ? data.libraries : [],
    activeLibrary: data.activeLibrary ?? null,
    mapDirectories: Array.isArray(data.mapDirectories)
      ? (data.mapDirectories as MapDirectory[]).filter(
          (d) => d && typeof d.path === 'string' && typeof d.name === 'string'
        )
      : [],
    activeMapDirectory: data.activeMapDirectory ?? null,
    theme: typeof data.theme === 'string' ? data.theme : undefined,
    lastOpenedArchive:
      typeof data.lastOpenedArchive === 'string' ? data.lastOpenedArchive : undefined,
    musicLibraryPath: typeof data.musicLibraryPath === 'string' ? data.musicLibraryPath : undefined,
    musicWorkingDirs: Array.isArray(data.musicWorkingDirs)
      ? (data.musicWorkingDirs as string[]).filter((d) => typeof d === 'string')
      : [],
    activeMusicWorkingDir:
      typeof data.activeMusicWorkingDir === 'string' ? data.activeMusicWorkingDir : undefined,
    ffmpegPath: typeof data.ffmpegPath === 'string' ? data.ffmpegPath : undefined,
    musEncodeKbps: typeof data.musEncodeKbps === 'number' ? data.musEncodeKbps : 64,
    musEncodeSampleRate:
      typeof data.musEncodeSampleRate === 'number' ? data.musEncodeSampleRate : 22050,
    packDir: typeof data.packDir === 'string' ? data.packDir : undefined,
    companionPath: typeof data.companionPath === 'string' ? data.companionPath : undefined,
    fileListViewMode:
      data.fileListViewMode === 'flat' || data.fileListViewMode === 'folder'
        ? data.fileListViewMode
        : undefined
  }
}

async function tryReadJson(filePath: string): Promise<Partial<TaliesinSettings> | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (!validate(parsed)) return null
    return parsed as Partial<TaliesinSettings>
  } catch {
    return null
  }
}

// Windows occasionally returns EPERM/EACCES on rename when AV scanners or
// file watchers briefly hold the destination open. Back off a few times
// before falling back to unlink+rename. Lifted from creidhne's
// settingsManager.js. Without this, atomic settings saves silently fail
// under common Windows configurations.
async function renameWithRetry(src: string, dest: string, retries = 3, delay = 50): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.rename(src, dest)
      return
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e.code !== 'EPERM' && e.code !== 'EACCES') throw err
      await new Promise((r) => setTimeout(r, delay * (i + 1)))
    }
  }
  try {
    await fs.unlink(dest)
  } catch {
    /* dest may not exist */
  }
  await fs.rename(src, dest)
}

export function createSettingsManager(userDataPath: string) {
  const primary = join(userDataPath, 'settings.json')
  const backup = join(userDataPath, 'settings.bak.json')
  const tmp = join(userDataPath, 'settings.tmp.json')

  async function load(): Promise<TaliesinSettings> {
    let data = await tryReadJson(primary)
    if (data) return withDefaults(data)

    console.warn('settings.json unreadable, trying backup')
    data = await tryReadJson(backup)
    if (data) {
      console.warn('Recovered settings from backup')
      await save(withDefaults(data))
      return withDefaults(data)
    }

    console.warn('No valid settings found, using defaults')
    return { ...DEFAULTS }
  }

  async function doSave(settings: TaliesinSettings): Promise<void> {
    const content = JSON.stringify(settings, null, 2)
    await fs.mkdir(userDataPath, { recursive: true })
    await fs.writeFile(tmp, content, 'utf-8')
    try {
      await fs.copyFile(primary, backup)
    } catch {
      /* primary may not exist yet */
    }
    await renameWithRetry(tmp, primary)
  }

  let saveQueue: Promise<void> = Promise.resolve()

  function save(settings: TaliesinSettings): Promise<void> {
    // Two-arg .then() so a failed save doesn't poison the queue. Lifted from
    // epona's settingsManager.js. Under the previous one-arg .then(async fn)
    // pattern, a single rejection would short-circuit every subsequent
    // save through the rejected chain — every later save would silently
    // no-op forever. The two-arg form runs doSave on both branches.
    const op = saveQueue.then(
      () => doSave(settings),
      () => doSave(settings)
    )
    op.catch((err) => console.error('[settings] save failed:', err))
    saveQueue = op.catch(() => {})
    return op
  }

  return { load, save }
}
