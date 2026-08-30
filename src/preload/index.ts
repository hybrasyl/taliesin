import { contextBridge, ipcRenderer } from 'electron'
// TYPE-ONLY, and it has to stay that way. This file may import `electron` and
// nothing else at run time -- a value import from main breaks `sandbox: true` in
// the PACKAGED app only, where it builds and lints clean. `import type` is
// erased before the bundle exists, so the built preload still emits exactly one
// `require`, which `e2e/preload-sandbox.spec.js` pins.
import type { CompanionLaunchResult, CompanionStatus } from '../main/companion'
import type { UpdateInfo } from '../main/updateCheck'
import type { WarpReferrer } from '../main/handlers'

export interface DirEntry {
  name: string
  isDirectory: boolean
}

/** One world type's `.xml` files, recursive, split by archived state. */
export interface SectionListing {
  /** Absolute path to `<libraryPath>/<type>`, forward-slashed. */
  dir: string
  /** Type-relative, forward-slashed, sorted. e.g. `fire/blast.xml` */
  active: string[]
  /** Type-relative, forward-slashed, sorted. e.g. `.ignore/old.xml` */
  archived: string[]
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
  /**
   * Main asks before the window closes (`app:closeRequested`); the renderer
   * answers with `confirmClose` once nothing is dirty or the user has decided.
   * Returns the unsubscribe.
   */
  onCloseRequested: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('app:closeRequested', handler)
    return () => {
      ipcRenderer.removeListener('app:closeRequested', handler)
    }
  },
  confirmClose: () => ipcRenderer.send('app:confirmClose'),
  /** Running report: does any editor hold unsaved work? Main asks before a close only when true. */
  setUnsaved: (dirty: boolean) => ipcRenderer.send('app:unsaved', dirty),

  // App
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  /** The bundled CHANGELOG.md for the "What's new" dialog; null if not shipped. */
  getChangelog: (): Promise<string | null> => ipcRenderer.invoke('app:changelog'),
  getUserDataPath: (): Promise<string> => ipcRenderer.invoke('get-user-data-path'),
  // Opens the OS file manager with settings.json highlighted.
  revealSettings: (): Promise<void> => ipcRenderer.invoke('app:revealSettings'),
  // Signals the main process that the renderer has hydrated (settings loaded),
  // so it can reveal the main window and dismiss the startup splash.
  appReady: (): void => ipcRenderer.send('app:ready'),

  // Report Issue / diagnostics (see src/main/report/). Flat, per the house
  // window.api contract.
  reportRendererError: (payload: {
    source: string
    message: string
    stack?: string
  }): Promise<void> => ipcRenderer.invoke('diagnostics:reportRendererError', payload),
  buildDiagnostics: (): Promise<string> => ipcRenderer.invoke('diagnostics:build'),
  openIssue: (payload: {
    title: string
    body: string
  }): Promise<{ ok: true; truncated: boolean }> =>
    ipcRenderer.invoke('diagnostics:openIssue', payload),
  copyReport: (payload: { body: string }): Promise<{ ok: true }> =>
    ipcRenderer.invoke('diagnostics:copyReport', payload),
  revealLogs: (): Promise<void> => ipcRenderer.invoke('diagnostics:revealLogs'),

  // Settings
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),

  // Companion app. The renderer names no path: it asks for the companion, and
  // main decides what may be launched (HTOO-292).
  launchCompanion: (): Promise<CompanionLaunchResult> => ipcRenderer.invoke('app:launchCompanion'),
  companionStatus: (): Promise<CompanionStatus> => ipcRenderer.invoke('app:companionStatus'),
  companionPickerFilters: (): Promise<{ name: string; extensions: string[] }[]> =>
    ipcRenderer.invoke('app:companionPickerFilters'),

  // Update notification (HTOO-65). Null when current, offline, or anything else
  // went wrong -- the check is best-effort by design.
  checkForUpdate: (): Promise<UpdateInfo | null> => ipcRenderer.invoke('app:checkForUpdate'),

  // Dialogs
  openFile: (filters?: Electron.FileFilter[], defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFile', filters, defaultPath),
  openFiles: (filters?: Electron.FileFilter[], defaultPath?: string): Promise<string[]> =>
    ipcRenderer.invoke('dialog:openFiles', filters, defaultPath),
  openDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:openDirectory'),
  saveFile: (filters?: Electron.FileFilter[], defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveFile', filters, defaultPath),

  // File system — returns raw bytes for dalib-ts to parse in the renderer
  readFile: (filePath: string): Promise<Buffer> => ipcRenderer.invoke('fs:readFile', filePath),
  listDir: (dirPath: string): Promise<DirEntry[]> => ipcRenderer.invoke('fs:listDir', dirPath),
  listSection: (libraryPath: string, type: string): Promise<SectionListing> =>
    ipcRenderer.invoke('fs:listSection', libraryPath, type),
  /** Which active map XMLs have warps pointing at `mapName`. */
  scanWarpReferrers: (libraryPath: string, mapName: string): Promise<WarpReferrer[]> =>
    ipcRenderer.invoke('maps:scanWarpReferrers', libraryPath, mapName),
  /** Repoint every warp from `oldName` to `newName`; reports what changed. */
  updateWarpTargets: (
    libraryPath: string,
    oldName: string,
    newName: string
  ): Promise<{ updated: WarpReferrer[]; failed: string[] }> =>
    ipcRenderer.invoke('maps:updateWarpTargets', libraryPath, oldName, newName),
  copyFile: (src: string, dst: string): Promise<void> =>
    ipcRenderer.invoke('fs:copyFile', src, dst),
  moveFile: (src: string, dst: string): Promise<void> =>
    ipcRenderer.invoke('fs:moveFile', src, dst),
  writeFile: (filePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),
  writeBytes: (filePath: string, data: Uint8Array): Promise<void> =>
    ipcRenderer.invoke('fs:writeBytes', filePath, data),
  exists: (filePath: string): Promise<boolean> => ipcRenderer.invoke('fs:exists', filePath),
  stat: (filePath: string): Promise<{ mtimeMs: number; sizeBytes: number } | null> =>
    ipcRenderer.invoke('fs:stat', filePath),
  ensureDir: (dirPath: string): Promise<void> => ipcRenderer.invoke('fs:ensureDir', dirPath),
  deleteFile: (filePath: string): Promise<void> => ipcRenderer.invoke('fs:deleteFile', filePath),
  listArchive: (filePath: string): Promise<string[]> =>
    ipcRenderer.invoke('fs:listArchive', filePath),

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
  musicDeployPack: (
    srcLibDir: string,
    pack: MusicPack,
    destDir: string,
    ffmpegPath: string | null,
    kbps: number,
    sampleRate: number
  ): Promise<void> =>
    ipcRenderer.invoke('music:deploy-pack', srcLibDir, pack, destDir, ffmpegPath, kbps, sampleRate),
  musicClientScan: (clientPath: string): Promise<MusicScanEntry[]> =>
    ipcRenderer.invoke('music:client:scan', clientPath),

  // Sound Effects
  sfxList: (clientPath: string): Promise<{ entryName: string; sizeBytes: number }[]> =>
    ipcRenderer.invoke('sfx:list', clientPath),
  sfxReadEntry: (clientPath: string, entryName: string): Promise<Buffer> =>
    ipcRenderer.invoke('sfx:readEntry', clientPath, entryName),
  sfxIndexLoad: (
    activeLibrary: string
  ): Promise<Record<string, { name?: string; comment?: string }>> =>
    ipcRenderer.invoke('sfx:index:load', activeLibrary),
  sfxIndexSave: (
    activeLibrary: string,
    data: Record<string, { name?: string; comment?: string }>
  ) => ipcRenderer.invoke('sfx:index:save', activeLibrary, data),

  // BIK → MP4 conversion (cached by content hash under cacheDir)
  bikConvert: (bytes: Uint8Array, ffmpegPath: string | null, cacheDir: string): Promise<string> =>
    ipcRenderer.invoke('bik:convert', bytes, ffmpegPath, cacheDir),

  // World index — a derived, rebuildable cache in per-machine local storage
  // (%LOCALAPPDATA%\Erisco\hybindex\v<N>\<worldKey>\), never in the git-tracked
  // world folder. Shared with Creidhne because the key is derived from the
  // world's path, so both apps resolve the same cache directory.
  indexRead: (libraryRoot: string): Promise<unknown | null> =>
    ipcRenderer.invoke('index:read', libraryRoot),
  indexBuild: (libraryRoot: string): Promise<unknown> =>
    ipcRenderer.invoke('index:build', libraryRoot),
  indexStatus: (
    libraryRoot: string
  ): Promise<{
    exists: boolean
    builtAt?: string
    stale?: boolean
  }> => ipcRenderer.invoke('index:status', libraryRoot),
  indexDelete: (libraryRoot: string): Promise<void> =>
    ipcRenderer.invoke('index:delete', libraryRoot),
  libraryResolve: (selectedPath: string): Promise<string | null> =>
    ipcRenderer.invoke('library:resolve', selectedPath),

  // Prefabs
  prefabList: (
    libraryPath: string
  ): Promise<
    {
      filename: string
      name: string
      width: number
      height: number
      createdAt: string
      updatedAt: string
    }[]
  > => ipcRenderer.invoke('prefab:list', libraryPath),
  prefabLoad: (libraryPath: string, filename: string): Promise<unknown> =>
    ipcRenderer.invoke('prefab:load', libraryPath, filename),
  prefabSave: (libraryPath: string, filename: string, data: unknown): Promise<void> =>
    ipcRenderer.invoke('prefab:save', libraryPath, filename, data),
  prefabDelete: (libraryPath: string, filename: string): Promise<void> =>
    ipcRenderer.invoke('prefab:delete', libraryPath, filename),
  prefabRename: (libraryPath: string, oldName: string, newName: string): Promise<void> =>
    ipcRenderer.invoke('prefab:rename', libraryPath, oldName, newName),

  // Tile Frequency Scanner
  tileScanAnalyze: (
    dirPaths: string[]
  ): Promise<{
    background: [number, number][]
    leftForeground: [number, number][]
    rightForeground: [number, number][]
    fileCount: number
    tileCount: number
  }> => ipcRenderer.invoke('tileScan:analyze', dirPaths),

  // Tile Themes
  themeList: (): Promise<{ filename: string; name: string }[]> => ipcRenderer.invoke('theme:list'),
  themeLoad: (filename: string): Promise<unknown> => ipcRenderer.invoke('theme:load', filename),
  themeSave: (filename: string, data: unknown): Promise<void> =>
    ipcRenderer.invoke('theme:save', filename, data),
  themeDelete: (filename: string): Promise<void> => ipcRenderer.invoke('theme:delete', filename),

  // Asset Packs (.datf)
  packScan: (dirPath: string): Promise<unknown[]> => ipcRenderer.invoke('pack:scan', dirPath),
  packLoad: (filePath: string): Promise<unknown> => ipcRenderer.invoke('pack:load', filePath),
  packSave: (filePath: string, data: unknown): Promise<void> =>
    ipcRenderer.invoke('pack:save', filePath, data),
  packDelete: (filePath: string): Promise<void> => ipcRenderer.invoke('pack:delete', filePath),
  packAddAsset: (packDir: string, sourcePath: string, targetFilename: string): Promise<void> =>
    ipcRenderer.invoke('pack:addAsset', packDir, sourcePath, targetFilename),
  packRemoveAsset: (packDir: string, filename: string): Promise<void> =>
    ipcRenderer.invoke('pack:removeAsset', packDir, filename),
  packRenameAsset: (packDir: string, oldFilename: string, newFilename: string): Promise<void> =>
    ipcRenderer.invoke('pack:renameAsset', packDir, oldFilename, newFilename),
  packCompile: (
    packDir: string,
    manifest: unknown,
    assetFilenames: string[],
    outputPath: string
  ): Promise<void> =>
    ipcRenderer.invoke('pack:compile', packDir, manifest, assetFilenames, outputPath),
  packImport: (
    datfPath: string,
    packDir: string,
    options?: { force?: boolean }
  ): Promise<{ projectFilename: string; warnings: string[] }> =>
    ipcRenderer.invoke('pack:import', datfPath, packDir, options),

  // Installed .datf pack consumption (static_tiles / world_maps overrides used
  // by the map + worldmap renderers).
  packListActive: (): Promise<unknown[]> => ipcRenderer.invoke('pack:listActive'),
  packListImageEntries: (): Promise<
    {
      packFile: string
      packFileName: string
      packId: string
      contentType: string
      schemaVersion: number
      entryPath: string
    }[]
  > => ipcRenderer.invoke('pack:listImageEntries'),
  packReadEntry: (packFile: string, entryPath: string): Promise<Uint8Array | null> =>
    ipcRenderer.invoke('pack:readEntry', packFile, entryPath),
  packListCoveredIds: (subtype: string): Promise<(number | string)[]> =>
    ipcRenderer.invoke('pack:listCoveredIds', subtype),
  packResolveAsset: (
    subtype: string,
    id: number | string
  ): Promise<{ bytes: Uint8Array; mime: string } | null> =>
    ipcRenderer.invoke('pack:resolveAsset', subtype, id),
  packSuggestedBrigidAssetsPath: (): Promise<string | null> =>
    ipcRenderer.invoke('pack:suggestedBrigidAssetsPath'),
  packReload: (): Promise<void> => ipcRenderer.invoke('pack:reload'),
  packTrackMeta: (
    subtype: string,
    id: number | string
  ): Promise<{ title: string | null; artist: string | null; album: string | null } | null> =>
    ipcRenderer.invoke('pack:trackMeta', subtype, id),

  // Palettes & Duotone (stored under the active asset-pack working directory)
  paletteScan: (
    packDir: string
  ): Promise<{ filename: string; id: string; name: string; entryCount: number }[]> =>
    ipcRenderer.invoke('palette:scan', packDir),
  paletteLoad: (filePath: string): Promise<unknown> => ipcRenderer.invoke('palette:load', filePath),
  paletteSave: (filePath: string, data: unknown): Promise<void> =>
    ipcRenderer.invoke('palette:save', filePath, data),
  paletteDelete: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('palette:delete', filePath),
  paletteCalibrationLoad: (
    packDir: string,
    paletteId: string
  ): Promise<Record<string, Record<string, unknown>>> =>
    ipcRenderer.invoke('palette:calibrationLoad', packDir, paletteId),
  paletteCalibrationSave: (packDir: string, paletteId: string, data: unknown): Promise<void> =>
    ipcRenderer.invoke('palette:calibrationSave', packDir, paletteId, data),
  frameScan: (packDir: string): Promise<string[]> => ipcRenderer.invoke('frame:scan', packDir)
}

// contextIsolation is Electron's default and `sandbox: true` keeps it on, so the
// contextBridge path is the only one -- the old `else` branch assigned straight
// onto `window`, which is the insecure path, and is dropped rather than kept for
// a configuration we do not ship.
//
// The `window.electron` toolkit bridge is gone too. Nothing read it: env.d.ts
// never declared it, and the renderer has no reference. Its package import was
// what blocked `sandbox: true` -- a sandboxed preload's loader resolves
// `electron` and a handful of Node built-ins and nothing else, and
// externalizeDepsPlugin leaves a bare `require('<pkg>')` in the built preload
// for anything in `dependencies`. So a package import breaks the sandbox even
// when nothing about it needs Node. Do not re-add one here without checking
// `out/preload/index.js` still requires only `electron`.
contextBridge.exposeInMainWorld('api', api)
