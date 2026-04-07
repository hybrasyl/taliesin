import { atom, selector } from 'recoil'

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
// activeLibrary is already resolved to the xml directory, e.g. <root>/world/xml
// Maps XML:      <activeLibrary>/maps
// WorldMaps XML: <activeLibrary>/worldmaps
export const activeLibraryState = atom<string | null>({
  key: 'activeLibraryState',
  default: null
})

// Derived: binary .map files live at <world>/mapfiles, sibling to <world>/xml.
// Used by the Map Editor and WarpDialog mini-canvas for tile rendering.
// The Map Catalog has its own independently-configured directory (below).
export const mapFilesDirectoryState = selector<string | null>({
  key: 'mapFilesDirectoryState',
  get: ({ get }) => {
    const lib = get(activeLibraryState)
    if (!lib) return null
    const norm    = lib.replace(/\\/g, '/').replace(/\/+$/, '')
    const lastSep = norm.lastIndexOf('/')
    if (lastSep <= 0) return null
    return norm.slice(0, lastSep) + '/mapfiles'
  },
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
