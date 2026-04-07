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
