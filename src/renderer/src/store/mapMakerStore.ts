import { create } from 'zustand'
import type { MapFile } from '@eriscorp/dalib-ts'
import type { Clipboard, Selection } from '../components/mapmaker/MapEditorCanvas'
import type { TileChange } from '../utils/mapEditorTools'
import { filenameFromPath } from '../utils/format'

/** One undoable operation: every tile it touched, with before/after values. */
export type UndoGroup = TileChange[]

export interface MapTab {
  id: string
  mapFile: MapFile | null
  filePath: string | null
  dirty: boolean
  undoStack: UndoGroup[]
  redoStack: UndoGroup[]
  selection: Selection | null
  clipboard: Clipboard | null
  pasteMode: boolean
  canvasKey: number
  renderVersion: number
}

interface MapMakerState {
  tabs: MapTab[]
  activeTabId: string | null

  addTab: (tab: MapTab) => void
  updateTab: (id: string, patch: Partial<MapTab>) => void
  removeTab: (id: string) => void
  setActiveTabId: (id: string | null) => void
  /** Drop every tab — the explicit way to release the maps this store pins. */
  closeAllTabs: () => void
}

let nextCanvasKey = 0

export function createTab(
  mapFile: MapFile | null = null,
  filePath: string | null = null,
  dirty = false
): MapTab {
  return {
    id: crypto.randomUUID(),
    mapFile,
    filePath,
    dirty,
    undoStack: [],
    redoStack: [],
    selection: null,
    clipboard: null,
    pasteMode: false,
    canvasKey: ++nextCanvasKey,
    renderVersion: 0
  }
}

export function tabLabel(tab: MapTab): string {
  if (tab.filePath) return filenameFromPath(tab.filePath)
  return tab.mapFile ? 'Untitled' : 'Empty'
}

/**
 * The Map Maker's open documents, hoisted out of the page.
 *
 * Pages are unmounted on navigation (`PageRenderer` is a switch, not a router),
 * so as page state these tabs were destroyed by a single toolbar click — taking
 * unsaved edits, every undo stack, and any map that only ever existed in memory
 * (new, generated, split, joined) with them. Even a saved tab cost a second trip
 * through the dimension picker to reopen, since `.map` files carry no
 * dimensions. `worldIndexStore` is the precedent for the same move.
 *
 * The trade is that open maps are now pinned for the session — a 512×512 map is
 * a ~262k-entry tile array, plus its undo history — where navigating away used
 * to free them by accident. Closing a tab is the deliberate release, and
 * `closeAllTabs` releases the lot.
 *
 * Session-only, like the rest of the ephemeral UI state: nothing here is
 * written to disk, so an app restart still starts empty.
 */
export const useMapMakerStore = create<MapMakerState>((set) => ({
  tabs: [],
  activeTabId: null,

  addTab: (tab) => set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id })),

  updateTab: (id, patch) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

  // Selecting the neighbour happens in the same set() as the removal: as two
  // updates, a render could land between them with activeTabId pointing at a
  // tab that is already gone.
  removeTab: (id) =>
    set((s) => {
      const index = s.tabs.findIndex((t) => t.id === id)
      const tabs = s.tabs.filter((t) => t.id !== id)
      if (id !== s.activeTabId) return { tabs, activeTabId: s.activeTabId }
      if (tabs.length === 0) return { tabs, activeTabId: null }
      return { tabs, activeTabId: tabs[Math.min(index, tabs.length - 1)].id }
    }),

  setActiveTabId: (activeTabId) => set({ activeTabId }),

  closeAllTabs: () => set({ tabs: [], activeTabId: null })
}))

/** Test seam — drops all tabs so specs don't leak state into each other. */
export function resetMapMakerStore(): void {
  useMapMakerStore.setState({ tabs: [], activeTabId: null })
}
