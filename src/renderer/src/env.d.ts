/// <reference types="vite/client" />

interface DirEntry {
  name: string
  isDirectory: boolean
}

interface MapScanEntry {
  filename: string
  sizeBytes: number
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
  openFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
  openDirectory: () => Promise<string | null>
  readFile: (filePath: string) => Promise<Buffer>
  listDir: (dirPath: string) => Promise<DirEntry[]>
  copyFile: (src: string, dst: string) => Promise<void>
  writeFile: (filePath: string, content: string) => Promise<void>
  exists: (filePath: string) => Promise<boolean>
  catalogLoad: (dirPath: string) => Promise<Record<string, unknown>>
  catalogSave: (dirPath: string, data: unknown) => Promise<void>
  catalogScan: (dirPath: string) => Promise<MapScanEntry[]>
  indexRead: (libraryRoot: string) => Promise<WorldIndex | null>
  indexBuild: (libraryRoot: string) => Promise<WorldIndex>
  indexStatus: (libraryRoot: string) => Promise<{ exists: boolean; builtAt?: string }>
  indexDelete: (libraryRoot: string) => Promise<void>
  libraryResolve: (selectedPath: string) => Promise<string | null>
}

declare global {
  interface Window {
    api: TaliesinAPI
  }
}
