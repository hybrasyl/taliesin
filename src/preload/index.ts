import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

export interface DirEntry {
  name: string
  isDirectory: boolean
}

export interface MapScanEntry {
  filename: string
  sizeBytes: number
}

export interface MusicScanEntry {
  filename: string
  sizeBytes: number
}

export interface MusicPackTrack {
  musicId: number
  sourceFile: string
}

export interface MusicPack {
  id: string
  name: string
  description?: string
  tracks: MusicPackTrack[]
  createdAt: string
  updatedAt: string
}

const api = {
  // Window controls
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),

  // App
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  getUserDataPath: (): Promise<string> => ipcRenderer.invoke('get-user-data-path'),

  // Settings
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),

  // Dialogs
  openFile: (filters?: Electron.FileFilter[]): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFile', filters),
  openDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:openDirectory'),

  // File system — returns raw bytes for dalib-ts to parse in the renderer
  readFile: (filePath: string): Promise<Buffer> => ipcRenderer.invoke('fs:readFile', filePath),
  listDir: (dirPath: string): Promise<DirEntry[]> => ipcRenderer.invoke('fs:listDir', dirPath),
  copyFile: (src: string, dst: string): Promise<void> => ipcRenderer.invoke('fs:copyFile', src, dst),
  writeFile: (filePath: string, content: string): Promise<void> => ipcRenderer.invoke('fs:writeFile', filePath, content),
  exists: (filePath: string): Promise<boolean> => ipcRenderer.invoke('fs:exists', filePath),
  ensureDir: (dirPath: string): Promise<void> => ipcRenderer.invoke('fs:ensureDir', dirPath),
  listArchive: (filePath: string): Promise<string[]> => ipcRenderer.invoke('fs:listArchive', filePath),

  // Catalog
  catalogLoad: (dirPath: string): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('catalog:load', dirPath),
  catalogSave: (dirPath: string, data: unknown): Promise<void> =>
    ipcRenderer.invoke('catalog:save', dirPath, data),
  catalogScan: (dirPath: string): Promise<MapScanEntry[]> =>
    ipcRenderer.invoke('catalog:scan', dirPath),

  // Music Manager
  musicReadFileMeta: (filePath: string): Promise<{ title: string | null; artist: string | null; genre: string | null; album: string | null } | null> =>
    ipcRenderer.invoke('music:readFileMeta', filePath),
  musicScan: (dirPath: string): Promise<MusicScanEntry[]> =>
    ipcRenderer.invoke('music:scan', dirPath),
  musicMetadataLoad: (dirPath: string): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('music:metadata:load', dirPath),
  musicMetadataSave: (dirPath: string, data: unknown): Promise<void> =>
    ipcRenderer.invoke('music:metadata:save', dirPath, data),
  musicPacksLoad: (dirPath: string): Promise<MusicPack[]> =>
    ipcRenderer.invoke('music:packs:load', dirPath),
  musicPacksSave: (dirPath: string, packs: MusicPack[]): Promise<void> =>
    ipcRenderer.invoke('music:packs:save', dirPath, packs),
  musicDeployPack: (srcLibDir: string, pack: MusicPack, destDir: string, ffmpegPath: string | null, kbps: number, sampleRate: number): Promise<void> =>
    ipcRenderer.invoke('music:deploy-pack', srcLibDir, pack, destDir, ffmpegPath, kbps, sampleRate),
  musicClientScan: (clientPath: string): Promise<MusicScanEntry[]> =>
    ipcRenderer.invoke('music:client:scan', clientPath),

  // World index (shared with Creidhne via <library>/world/.creidhne/index.json)
  indexRead: (libraryRoot: string): Promise<unknown | null> =>
    ipcRenderer.invoke('index:read', libraryRoot),
  indexBuild: (libraryRoot: string): Promise<unknown> =>
    ipcRenderer.invoke('index:build', libraryRoot),
  indexStatus: (libraryRoot: string): Promise<{ exists: boolean; builtAt?: string }> =>
    ipcRenderer.invoke('index:status', libraryRoot),
  indexDelete: (libraryRoot: string): Promise<void> =>
    ipcRenderer.invoke('index:delete', libraryRoot),
  libraryResolve: (selectedPath: string): Promise<string | null> =>
    ipcRenderer.invoke('library:resolve', selectedPath),
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('api', api)
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
