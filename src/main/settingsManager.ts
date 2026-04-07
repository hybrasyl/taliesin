import { join } from 'path'
import { promises as fs } from 'fs'

export interface TaliesinSettings {
  clientPath?: string
  libraries: string[]
  activeLibrary: string | null
  mapDirectories: string[]
  theme?: string
  lastOpenedArchive?: string
}

const DEFAULTS: TaliesinSettings = {
  libraries: [],
  activeLibrary: null,
  mapDirectories: [],
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
    libraries: Array.isArray(data.libraries) ? data.libraries : [],
    activeLibrary: data.activeLibrary ?? null,
    mapDirectories: Array.isArray(data.mapDirectories) ? data.mapDirectories : [],
    theme: typeof data.theme === 'string' ? data.theme : undefined,
    lastOpenedArchive: typeof data.lastOpenedArchive === 'string' ? data.lastOpenedArchive : undefined,
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

export function createSettingsManager(userDataPath: string) {
  const primary = join(userDataPath, 'settings.json')
  const backup  = join(userDataPath, 'settings.bak.json')
  const tmp     = join(userDataPath, 'settings.tmp.json')

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

  let saveQueue = Promise.resolve()

  function save(settings: TaliesinSettings): Promise<void> {
    saveQueue = saveQueue.then(async () => {
      const content = JSON.stringify(settings, null, 2)
      await fs.mkdir(userDataPath, { recursive: true })
      await fs.writeFile(tmp, content, 'utf-8')
      try { await fs.copyFile(primary, backup) } catch { /* primary may not exist yet */ }
      await fs.rename(tmp, primary)
    })
    return saveQueue
  }

  return { load, save }
}
