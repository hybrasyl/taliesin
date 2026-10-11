import { vi, type Mock } from 'vitest'

/**
 * Typed factory that builds a `window.api` stub with every channel mocked
 * via vi.fn(). Tests can override individual channels via `mockResolvedValue`,
 * `mockImplementation`, etc. Call `installMockApi()` in beforeEach.
 *
 * Channel list mirrors src/preload/index.ts. Keep in sync.
 */
/** The members that are not channels: a value and a nested object (HTOO-569). */
type NonChannel = 'platform' | 'menu'
type Channel = Exclude<keyof TaliesinAPI, NonChannel>

export type MockApi = {
  [K in Channel]: Mock
} & {
  /** `'win32'` unless a test sets it, so the macOS-only paths stay off by default. */
  platform: string
  menu: { onCommand: Mock; setState: Mock }
}

export function createMockApi(): MockApi {
  const channels: Channel[] = [
    // Window controls
    'minimizeWindow',
    'maximizeWindow',
    'closeWindow',
    'onCloseRequested',
    'confirmClose',
    'setUnsaved',
    // App
    'getAppVersion',
    'getChangelog',
    'getUserDataPath',
    'appReady',
    'launchCompanion',
    'companionStatus',
    'companionPickerFilters',
    // Report Issue / diagnostics
    'reportRendererError',
    'buildDiagnostics',
    'openIssue',
    'copyReport',
    'revealLogs',
    // Settings
    'loadSettings',
    'saveSettings',
    // Dialogs
    'openFile',
    'openDirectory',
    'saveFile',
    // File system
    'readFile',
    'listDir',
    'listSection',
    'copyFile',
    'moveFile',
    'writeFile',
    'writeBytes',
    'exists',
    'ensureDir',
    'deleteFile',
    'listArchive',
    // Catalog
    'catalogLoad',
    'catalogSave',
    'catalogScan',
    // Music
    'musicReadFileMeta',
    'musicScan',
    'musicMetadataLoad',
    'musicMetadataSave',
    'musicPacksLoad',
    'musicPacksSave',
    'musicDeployPack',
    'musicClientScan',
    // SFX
    'sfxList',
    'sfxReadEntry',
    'sfxIndexLoad',
    'sfxIndexSave',
    // BIK
    'bikConvert',
    // World index
    'indexRead',
    'indexBuild',
    'indexStatus',
    'indexDelete',
    'libraryResolve',
    // Prefabs
    'prefabList',
    'prefabLoad',
    'prefabSave',
    'prefabDelete',
    'prefabRename',
    // Tile scanner
    'tileScanAnalyze',
    // Themes
    'themeList',
    'themeLoad',
    'themeSave',
    'themeDelete',
    // Asset packs
    'packScan',
    'packLoad',
    'packSave',
    'packDelete',
    'packAddAsset',
    'packRemoveAsset',
    'packRenameAsset',
    'packCompile',
    'packImport',
    'packListActive',
    'packListImageEntries',
    'packReadEntry',
    'packListCoveredIds',
    'packResolveAsset',
    'packSuggestedBrigidAssetsPath',
    'packReload',
    'packTrackMeta',
    // Palettes
    'paletteScan',
    'paletteLoad',
    'paletteSave',
    'paletteDelete',
    'paletteCalibrationLoad',
    'paletteCalibrationSave',
    'frameScan'
  ]

  const api = {} as MockApi
  for (const ch of channels) {
    api[ch] = vi.fn()
  }
  api.platform = 'win32'
  api.menu = { onCommand: vi.fn(() => () => {}), setState: vi.fn() }
  return api
}

export function installMockApi(): MockApi {
  const api = createMockApi()
  // In jsdom we already have a window; in node we don't.
  // Only assign the `api` slot — never replace the whole window, that wipes
  // out HTMLIFrameElement / HTMLElement / etc. that React touches.
  if (typeof window !== 'undefined') {
    ;(window as unknown as { api: MockApi }).api = api
  } else {
    ;(globalThis as unknown as { window: { api: MockApi } }).window = { api }
  }
  return api
}
