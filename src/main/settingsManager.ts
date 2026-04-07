import { join } from 'path'
import { promises as fs } from 'fs'

export interface TaliesinSettings {
  clientPath?: string
  lastOpenedArchive?: string
}

export function createSettingsManager(userDataPath: string) {
  const settingsPath = join(userDataPath, 'settings.json')

  async function load(): Promise<TaliesinSettings> {
    try {
      const raw = await fs.readFile(settingsPath, 'utf-8')
      return JSON.parse(raw) as TaliesinSettings
    } catch {
      return {}
    }
  }

  async function save(settings: TaliesinSettings): Promise<void> {
    await fs.mkdir(userDataPath, { recursive: true })
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  }

  return { load, save }
}
