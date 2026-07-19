import { create } from 'zustand'

export type Page =
  | 'dashboard'
  | 'catalog'
  | 'mapeditor'
  | 'worldmap'
  | 'archive'
  | 'mapmaker'
  | 'prefabs'
  | 'assetpacks'
  | 'statictiles'
  | 'uiforge'
  | 'palettes'
  | 'fonteditor'
  | 'music'
  | 'sfx'
  | 'settings'

export interface DirtyEditor {
  label: string
  onSave: () => Promise<void>
}

interface UiState {
  /** Active top-level page (no react-router — a view-name switch). */
  currentPage: Page
  /** Set by the active editor when it has unsaved changes; drives the
   *  nav/close confirmation dialog. Null when clean. */
  dirtyEditor: DirtyEditor | null
  /** Selected palette id within the current asset-pack working directory. */
  activePaletteId: string | null
  /** Selected colorize source image. */
  activeColorizeSource: string | null
  /** Whether the Report Issue dialog is open (transient; never persisted). */
  reportIssueOpen: boolean

  setCurrentPage: (page: Page) => void
  setDirtyEditor: (editor: DirtyEditor | null) => void
  setActivePaletteId: (id: string | null) => void
  setActiveColorizeSource: (src: string | null) => void
  setReportIssueOpen: (open: boolean) => void
}

/** Ephemeral, session-only UI state (never persisted to disk). */
export const useUiStore = create<UiState>((set) => ({
  currentPage: 'dashboard',
  dirtyEditor: null,
  activePaletteId: null,
  activeColorizeSource: null,
  reportIssueOpen: false,

  setCurrentPage: (currentPage) => set({ currentPage }),
  setDirtyEditor: (dirtyEditor) => set({ dirtyEditor }),
  setActivePaletteId: (activePaletteId) => set({ activePaletteId }),
  setActiveColorizeSource: (activeColorizeSource) => set({ activeColorizeSource }),
  setReportIssueOpen: (reportIssueOpen) => set({ reportIssueOpen })
}))
