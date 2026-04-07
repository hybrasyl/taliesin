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

// Path to the Hybrasyl world/xml directory (shared with creidhne)
export const libraryPathState = atom<string | null>({
  key: 'libraryPathState',
  default: null
})
