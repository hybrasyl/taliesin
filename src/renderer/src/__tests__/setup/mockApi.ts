import { vi, type Mock } from 'vitest'

/**
 * Typed factory that builds a `window.api` stub with every channel mocked
 * via vi.fn(). Tests can override individual channels via `mockResolvedValue`,
 * `mockImplementation`, etc. Call `installMockApi()` in beforeEach.
 *
 * Channel list mirrors src/preload/index.ts. Keep in sync.
 */
export type MockApi = {
  [K in keyof TaliesinAPI]: Mock
}

export function createMockApi(): MockApi {
  const channels: (keyof TaliesinAPI)[] = [
    // Window controls
    'minimizeWindow', 'maximizeWindow', 'closeWindow',
    // App
    'getAppVersion', 'getUserDataPath', 'launchCompanion',
    // Settings
    'loadSettings', 'saveSettings',
    // Dialogs
    'openFile', 'openDirectory', 'saveFile',
    // File system
    'readFile', 'listDir', 'copyFile', 'writeFile', 'writeBytes', 'exists',
    'ensureDir', 'deleteFile', 'listArchive',
    // Catalog
    'catalogLoad', 'catalogSave', 'catalogScan',
    // Music
    'musicReadFileMeta', 'musicScan', 'musicMetadataLoad', 'musicMetadataSave',
    'musicPacksLoad', 'musicPacksSave', 'musicDeployPack', 'musicClientScan',
    // SFX
    'sfxList', 'sfxReadEntry', 'sfxIndexLoad', 'sfxIndexSave',
    // BIK
    'bikConvert',
    // World index
    'indexRead', 'indexBuild', 'indexStatus', 'indexDelete', 'libraryResolve',
    // Prefabs
    'prefabList', 'prefabLoad', 'prefabSave', 'prefabDelete', 'prefabRename',
    // Tile scanner
    'tileScanAnalyze',
    // Themes
    'themeList', 'themeLoad', 'themeSave', 'themeDelete',
    // Asset packs
    'packScan', 'packLoad', 'packSave', 'packDelete', 'packAddAsset',
    'packRemoveAsset', 'packCompile',
    // Palettes
    'paletteScan', 'paletteLoad', 'paletteSave', 'paletteDelete',
    'paletteCalibrationLoad', 'paletteCalibrationSave', 'frameScan',
  ]

  const api = {} as MockApi
  for (const ch of channels) {
    api[ch] = vi.fn()
  }
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
