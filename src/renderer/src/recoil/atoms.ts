import { atom } from 'recoil'

export type ThemeName = 'hybrasyl' | 'chadul' | 'danaan' | 'grinneal'

export type Page = 'catalog' | 'mapeditor' | 'worldmap' | 'archive' | 'sprites' | 'settings'

export interface DirtyEditor {
  label: string
  onSave: () => Promise<void>
}

export const themeState = atom<ThemeName>({
  key: 'themeState',
  default: 'hybrasyl'
})

export const currentPageState = atom<Page>({
  key: 'currentPageState',
  default: 'catalog'
})

export const dirtyEditorState = atom<DirtyEditor | null>({
  key: 'dirtyEditorState',
  default: null
})

// Path to the DA client install directory (used to open .dat archives)
export const clientPathState = atom<string | null>({
  key: 'clientPathState',
  default: null
})

// List of Hybrasyl world library root paths (mirrors creidhne)
export const librariesState = atom<string[]>({
  key: 'librariesState',
  default: []
})

// Which library is currently active — editors derive xml paths from this
// Maps XML:      <activeLibrary>/world/xml/maps
// WorldMaps XML: <activeLibrary>/world/xml/worldmaps
export const activeLibraryState = atom<string | null>({
  key: 'activeLibraryState',
  default: null
})

export interface MapDirectory {
  path: string
  name: string  // user-provided nickname (defaults to folder name)
}

// Directories containing loose binary .map files (for Map Catalog)
export const mapDirectoriesState = atom<MapDirectory[]>({
  key: 'mapDirectoriesState',
  default: []
})

// Active map directory — the one the catalog scans and editors reference
export const activeMapDirectoryState = atom<string | null>({
  key: 'activeMapDirectoryState',
  default: null
})
