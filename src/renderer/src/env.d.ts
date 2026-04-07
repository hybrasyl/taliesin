/// <reference types="vite/client" />

interface DirEntry {
  name: string
  isDirectory: boolean
}

interface TaliesinAPI {
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
  getAppVersion: () => Promise<string>
  getUserDataPath: () => Promise<string>
  loadSettings: () => Promise<Record<string, unknown>>
  saveSettings: (settings: unknown) => Promise<void>
  openFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
  openDirectory: () => Promise<string | null>
  readFile: (filePath: string) => Promise<Buffer>
  listDir: (dirPath: string) => Promise<DirEntry[]>
}

declare global {
  interface Window {
    api: TaliesinAPI
  }
}
