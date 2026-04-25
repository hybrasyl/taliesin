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

export interface MusicFileMeta {
  title: string | null
  artist: string | null
  genre: string | null
  album: string | null
  duration: number | null
  bitrate: number | null
  sampleRate: number | null
  channels: number | null
  prompt: string | null
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

  // Companion app
  launchCompanion: (exePath: string): Promise<boolean> =>
    ipcRenderer.invoke('app:launchCompanion', exePath),

  // Dialogs
  openFile: (filters?: Electron.FileFilter[]): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFile', filters),
  openDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:openDirectory'),
  saveFile: (filters?: Electron.FileFilter[], defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveFile', filters, defaultPath),

  // File system — returns raw bytes for dalib-ts to parse in the renderer
  readFile: (filePath: string): Promise<Buffer> => ipcRenderer.invoke('fs:readFile', filePath),
  listDir: (dirPath: string): Promise<DirEntry[]> => ipcRenderer.invoke('fs:listDir', dirPath),
  copyFile: (src: string, dst: string): Promise<void> => ipcRenderer.invoke('fs:copyFile', src, dst),
  writeFile: (filePath: string, content: string): Promise<void> => ipcRenderer.invoke('fs:writeFile', filePath, content),
  writeBytes: (filePath: string, data: Uint8Array): Promise<void> => ipcRenderer.invoke('fs:writeBytes', filePath, data),
  exists: (filePath: string): Promise<boolean> => ipcRenderer.invoke('fs:exists', filePath),
  ensureDir: (dirPath: string): Promise<void> => ipcRenderer.invoke('fs:ensureDir', dirPath),
  deleteFile: (filePath: string): Promise<void> => ipcRenderer.invoke('fs:deleteFile', filePath),
  listArchive: (filePath: string): Promise<string[]> => ipcRenderer.invoke('fs:listArchive', filePath),

  // Catalog
  catalogLoad: (dirPath: string): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('catalog:load', dirPath),
  catalogSave: (dirPath: string, data: unknown): Promise<void> =>
    ipcRenderer.invoke('catalog:save', dirPath, data),
  catalogScan: (dirPath: string): Promise<MapScanEntry[]> =>
    ipcRenderer.invoke('catalog:scan', dirPath),

  // Music Manager
  musicReadFileMeta: (filePath: string): Promise<MusicFileMeta | null> =>
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

  // Sound Effects
  sfxList: (clientPath: string): Promise<{ entryName: string; sizeBytes: number }[]> =>
    ipcRenderer.invoke('sfx:list', clientPath),
  sfxReadEntry: (clientPath: string, entryName: string): Promise<Buffer> =>
    ipcRenderer.invoke('sfx:readEntry', clientPath, entryName),
  sfxIndexLoad: (activeLibrary: string): Promise<Record<string, { name?: string; comment?: string }>> =>
    ipcRenderer.invoke('sfx:index:load', activeLibrary),
  sfxIndexSave: (activeLibrary: string, data: Record<string, { name?: string; comment?: string }>) =>
    ipcRenderer.invoke('sfx:index:save', activeLibrary, data),

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

  // Prefabs
  prefabList: (libraryPath: string): Promise<{ filename: string; name: string; width: number; height: number; createdAt: string; updatedAt: string }[]> =>
    ipcRenderer.invoke('prefab:list', libraryPath),
  prefabLoad: (libraryPath: string, filename: string): Promise<unknown> =>
    ipcRenderer.invoke('prefab:load', libraryPath, filename),
  prefabSave: (libraryPath: string, filename: string, data: unknown): Promise<void> =>
    ipcRenderer.invoke('prefab:save', libraryPath, filename, data),
  prefabDelete: (libraryPath: string, filename: string): Promise<void> =>
    ipcRenderer.invoke('prefab:delete', libraryPath, filename),
  prefabRename: (libraryPath: string, oldName: string, newName: string): Promise<void> =>
    ipcRenderer.invoke('prefab:rename', libraryPath, oldName, newName),

  // Tile Frequency Scanner
  tileScanAnalyze: (dirPaths: string[]): Promise<{ background: [number, number][]; leftForeground: [number, number][]; rightForeground: [number, number][]; fileCount: number; tileCount: number }> =>
    ipcRenderer.invoke('tileScan:analyze', dirPaths),

  // Tile Themes
  themeList: (): Promise<{ filename: string; name: string }[]> =>
    ipcRenderer.invoke('theme:list'),
  themeLoad: (filename: string): Promise<unknown> =>
    ipcRenderer.invoke('theme:load', filename),
  themeSave: (filename: string, data: unknown): Promise<void> =>
    ipcRenderer.invoke('theme:save', filename, data),
  themeDelete: (filename: string): Promise<void> =>
    ipcRenderer.invoke('theme:delete', filename),

  // Asset Packs (.datf)
  packScan: (dirPath: string): Promise<unknown[]> =>
    ipcRenderer.invoke('pack:scan', dirPath),
  packLoad: (filePath: string): Promise<unknown> =>
    ipcRenderer.invoke('pack:load', filePath),
  packSave: (filePath: string, data: unknown): Promise<void> =>
    ipcRenderer.invoke('pack:save', filePath, data),
  packDelete: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('pack:delete', filePath),
  packAddAsset: (packDir: string, sourcePath: string, targetFilename: string): Promise<void> =>
    ipcRenderer.invoke('pack:addAsset', packDir, sourcePath, targetFilename),
  packRemoveAsset: (packDir: string, filename: string): Promise<void> =>
    ipcRenderer.invoke('pack:removeAsset', packDir, filename),
  packCompile: (packDir: string, manifest: unknown, assetFilenames: string[], outputPath: string): Promise<void> =>
    ipcRenderer.invoke('pack:compile', packDir, manifest, assetFilenames, outputPath),

  // Palettes & Duotone (stored under the active asset-pack working directory)
  paletteScan: (packDir: string): Promise<{ filename: string; id: string; name: string; entryCount: number }[]> =>
    ipcRenderer.invoke('palette:scan', packDir),
  paletteLoad: (filePath: string): Promise<unknown> =>
    ipcRenderer.invoke('palette:load', filePath),
  paletteSave: (filePath: string, data: unknown): Promise<void> =>
    ipcRenderer.invoke('palette:save', filePath, data),
  paletteDelete: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('palette:delete', filePath),
  paletteCalibrationLoad: (packDir: string, paletteId: string): Promise<Record<string, Record<string, unknown>>> =>
    ipcRenderer.invoke('palette:calibrationLoad', packDir, paletteId),
  paletteCalibrationSave: (packDir: string, paletteId: string, data: unknown): Promise<void> =>
    ipcRenderer.invoke('palette:calibrationSave', packDir, paletteId, data),
  frameScan: (packDir: string): Promise<string[]> =>
    ipcRenderer.invoke('frame:scan', packDir),
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
