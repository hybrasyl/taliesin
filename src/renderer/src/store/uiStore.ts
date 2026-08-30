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
  | 'music'
  | 'sfx'
  | 'settings'

export interface DirtyEditor {
  label: string
  onSave: () => Promise<void>
}

/**
 * An editor's answer to "may the app close?".
 *
 * Distinct from `dirtyEditor`, which is one slot for the one page being
 * navigated away from. Several editors can hold unsaved work at once — a Map
 * Maker tab and a kept-alive XML map — and closing the window has to ask
 * about all of them, so this is a registry keyed by editor. `isDirty` is read
 * at close time rather than stored, so a registration never goes stale.
 */
export interface CloseGuard {
  label: string
  isDirty: () => boolean
  onSave: () => Promise<void>
}

interface UiState {
  /** Active top-level page (no react-router — a view-name switch). */
  currentPage: Page
  /**
   * The page a blocked navigation is waiting to reach, or null.
   *
   * Non-null exactly while the unsaved-changes dialog is up: `setCurrentPage`
   * parks the destination here instead of navigating when an editor is dirty,
   * and the dialog's answer either commits or discards it.
   */
  pendingPage: Page | null
  /** Set by the active editor when it has unsaved changes; drives the
   *  nav/close confirmation dialog. Null when clean. */
  dirtyEditor: DirtyEditor | null
  /** Selected palette id within the current asset-pack working directory. */
  activePaletteId: string | null
  /** Selected colorize source image. */
  activeColorizeSource: string | null
  /** Whether the Report Issue dialog is open (transient; never persisted). */
  reportIssueOpen: boolean
  /** Editors that can hold unsaved work, consulted before the window closes. */
  closeGuards: Record<string, CloseGuard>

  /** Navigate, or park the destination in `pendingPage` if an editor is dirty. */
  setCurrentPage: (page: Page) => void
  /** Go to `pendingPage` regardless — what the dialog's Save/Discard do. */
  commitPendingPage: () => void
  /** Stay put and drop the pending destination — the dialog's Cancel. */
  cancelPendingPage: () => void
  setDirtyEditor: (editor: DirtyEditor | null) => void
  setActivePaletteId: (id: string | null) => void
  setActiveColorizeSource: (src: string | null) => void
  setReportIssueOpen: (open: boolean) => void
  registerCloseGuard: (id: string, guard: CloseGuard) => void
  unregisterCloseGuard: (id: string) => void
}

/** Ephemeral, session-only UI state (never persisted to disk). */
export const useUiStore = create<UiState>((set) => ({
  currentPage: 'dashboard',
  pendingPage: null,
  dirtyEditor: null,
  activePaletteId: null,
  activeColorizeSource: null,
  reportIssueOpen: false,
  closeGuards: {},

  // The guard lives in the setter rather than in a separate `requestPage` the
  // callers have to remember: pages are unmounted on navigation, so an
  // unguarded route out of a dirty editor destroys the edit silently. There are
  // seven call sites today and no way to stop an eighth being added, so the
  // safe path is the only path.
  setCurrentPage: (page) =>
    set((s) => {
      if (page === s.currentPage) return s
      return s.dirtyEditor ? { pendingPage: page } : { currentPage: page }
    }),

  commitPendingPage: () =>
    set((s) =>
      s.pendingPage
        ? // dirtyEditor is cleared here as well as by the editor's own
          // markClean, because Discard never gives the editor a chance to.
          { currentPage: s.pendingPage, pendingPage: null, dirtyEditor: null }
        : s
    ),

  cancelPendingPage: () => set({ pendingPage: null }),

  setDirtyEditor: (dirtyEditor) => set({ dirtyEditor }),
  setActivePaletteId: (activePaletteId) => set({ activePaletteId }),
  setActiveColorizeSource: (activeColorizeSource) => set({ activeColorizeSource }),
  setReportIssueOpen: (reportIssueOpen) => set({ reportIssueOpen }),
  registerCloseGuard: (id, guard) =>
    set((s) => ({ closeGuards: { ...s.closeGuards, [id]: guard } })),
  unregisterCloseGuard: (id) =>
    set((s) => {
      if (!(id in s.closeGuards)) return s
      const next = { ...s.closeGuards }
      delete next[id]
      return { closeGuards: next }
    })
}))
