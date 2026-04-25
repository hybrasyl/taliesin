/// <reference types="vite/client" />

interface DirEntry {
  name: string
  isDirectory: boolean
}

interface MapScanEntry {
  filename: string
  sizeBytes: number
}

interface MusicScanEntry {
  filename: string
  sizeBytes: number
}

interface MusicMeta {
  name?: string
  notes?: string
  description?: string
  tags?: string[]
  duration?: number
  bitrate?: number
  sampleRate?: number
  channels?: number
  /** Read-only: generation prompt from ID3 TXXX:PROMPT frame (e.g. Suno). */
  prompt?: string
}

interface MusicFileMeta {
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

interface MusicPackTrack {
  musicId: number
  sourceFile: string
}

interface MusicPack {
  id: string
  name: string
  description?: string
  tracks: MusicPackTrack[]
  createdAt: string
  updatedAt: string
}

// ── World index (shared format with Creidhne) ─────────────────────────────────

interface MapDetail {
  id: number
  name: string
  filename: string
  x: number
  y: number
}

interface CategoryDetail {
  name: string
  count: number
  usedBy: string[]
}

interface NpcStringKey {
  key: string
  message: string
  category: string
}

interface WorldIndex {
  libraryPath: string
  builtAt: string
  castables: string[]
  creatures: string[]
  creaturebehaviorsets: string[]
  elementtables: string[]
  items: string[]
  localizations: string[]
  lootsets: string[]
  maps: string[]
  nations: string[]
  npcs: string[]
  recipes: string[]
  serverconfigs: string[]
  spawngroups: string[]
  statuses: string[]
  variantgroups: string[]
  worldmaps: string[]
  mapDetails: MapDetail[]
  ignoredMapDetails: MapDetail[]
  archivedCastables: string[]
  archivedCreatures: string[]
  archivedCreaturebehaviorsets: string[]
  archivedElementtables: string[]
  archivedItems: string[]
  archivedLootsets: string[]
  archivedNations: string[]
  archivedNpcs: string[]
  archivedRecipes: string[]
  archivedSpawngroups: string[]
  archivedStatuses: string[]
  archivedVariantgroups: string[]
  castableClasses: Record<string, string>
  statusCasters: Record<string, string[]>
  npcResponseCalls: Record<string, string>
  npcStringKeys: NpcStringKey[]
  creatureTypes: string[]
  castableTrainers: Record<string, string[]>
  itemVendors: Record<string, string[]>
  itemLootSets: Record<string, string[]>
  elementnames: string[]
  scripts: string[]
  itemCategories: string[]
  castableCategories: string[]
  statusCategories: string[]
  itemCategoryDetails: CategoryDetail[]
  castableCategoryDetails: CategoryDetail[]
  statusCategoryDetails: CategoryDetail[]
  vendorTabs: string[]
  npcJobs: string[]
  creatureFamilies: string[]
  cookieNames: string[]
}

interface TaliesinAPI {
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
  getAppVersion: () => Promise<string>
  getUserDataPath: () => Promise<string>
  loadSettings: () => Promise<Record<string, unknown>>
  saveSettings: (settings: unknown) => Promise<void>
  launchCompanion: (exePath: string) => Promise<boolean>
  openFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
  openDirectory: () => Promise<string | null>
  saveFile: (filters?: { name: string; extensions: string[] }[], defaultPath?: string) => Promise<string | null>
  readFile: (filePath: string) => Promise<Buffer>
  listDir: (dirPath: string) => Promise<DirEntry[]>
  copyFile: (src: string, dst: string) => Promise<void>
  writeFile: (filePath: string, content: string) => Promise<void>
  writeBytes: (filePath: string, data: Uint8Array) => Promise<void>
  exists: (filePath: string) => Promise<boolean>
  ensureDir: (dirPath: string) => Promise<void>
  deleteFile: (filePath: string) => Promise<void>
  listArchive: (filePath: string) => Promise<string[]>
  catalogLoad: (dirPath: string) => Promise<Record<string, unknown>>
  catalogSave: (dirPath: string, data: unknown) => Promise<void>
  catalogScan: (dirPath: string) => Promise<MapScanEntry[]>
  musicReadFileMeta: (filePath: string) => Promise<MusicFileMeta | null>
  musicScan: (dirPath: string) => Promise<MusicScanEntry[]>
  musicMetadataLoad: (dirPath: string) => Promise<Record<string, MusicMeta>>
  musicMetadataSave: (dirPath: string, data: Record<string, MusicMeta>) => Promise<void>
  musicPacksLoad: (dirPath: string) => Promise<MusicPack[]>
  musicPacksSave: (dirPath: string, packs: MusicPack[]) => Promise<void>
  musicDeployPack: (srcLibDir: string, pack: MusicPack, destDir: string, ffmpegPath: string | null, kbps: number, sampleRate: number) => Promise<void>
  musicClientScan: (clientPath: string) => Promise<MusicScanEntry[]>
  indexRead: (libraryRoot: string) => Promise<WorldIndex | null>
  indexBuild: (libraryRoot: string) => Promise<WorldIndex>
  indexStatus: (libraryRoot: string) => Promise<{ exists: boolean; builtAt?: string }>
  indexDelete: (libraryRoot: string) => Promise<void>
  libraryResolve: (selectedPath: string) => Promise<string | null>
  prefabList: (libraryPath: string) => Promise<{ filename: string; name: string; width: number; height: number; createdAt: string; updatedAt: string }[]>
  prefabLoad: (libraryPath: string, filename: string) => Promise<unknown>
  prefabSave: (libraryPath: string, filename: string, data: unknown) => Promise<void>
  prefabDelete: (libraryPath: string, filename: string) => Promise<void>
  prefabRename: (libraryPath: string, oldName: string, newName: string) => Promise<void>
  packScan: (dirPath: string) => Promise<unknown[]>
  packLoad: (filePath: string) => Promise<unknown>
  packSave: (filePath: string, data: unknown) => Promise<void>
  packDelete: (filePath: string) => Promise<void>
  packAddAsset: (packDir: string, sourcePath: string, targetFilename: string) => Promise<void>
  packRemoveAsset: (packDir: string, filename: string) => Promise<void>
  packCompile: (packDir: string, manifest: unknown, assetFilenames: string[], outputPath: string) => Promise<void>
  sfxList: (clientPath: string) => Promise<{ entryName: string; sizeBytes: number }[]>
  sfxReadEntry: (clientPath: string, entryName: string) => Promise<Buffer>
  sfxIndexLoad: (activeLibrary: string) => Promise<Record<string, { name?: string; comment?: string }>>
  sfxIndexSave: (activeLibrary: string, data: Record<string, { name?: string; comment?: string }>) => Promise<void>
  tileScanAnalyze: (dirPaths: string[]) => Promise<{ background: [number, number][]; leftForeground: [number, number][]; rightForeground: [number, number][]; fileCount: number; tileCount: number }>
  themeList: () => Promise<{ filename: string; name: string }[]>
  themeLoad: (filename: string) => Promise<unknown>
  themeSave: (filename: string, data: unknown) => Promise<void>
  themeDelete: (filename: string) => Promise<void>
  paletteScan: (packDir: string) => Promise<{ filename: string; id: string; name: string; entryCount: number }[]>
  paletteLoad: (filePath: string) => Promise<unknown>
  paletteSave: (filePath: string, data: unknown) => Promise<void>
  paletteDelete: (filePath: string) => Promise<void>
  paletteCalibrationLoad: (packDir: string, paletteId: string) => Promise<Record<string, Record<string, unknown>>>
  paletteCalibrationSave: (packDir: string, paletteId: string, data: unknown) => Promise<void>
  frameScan: (packDir: string) => Promise<string[]>
}

declare global {
  interface Window {
    api: TaliesinAPI
  }
}

export {}
