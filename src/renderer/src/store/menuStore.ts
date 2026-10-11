import { create } from 'zustand'

/**
 * The menu commands whose action a component holds in its own state (HTOO-569).
 * About and What's New are dialogs in Settings' `useState`. The menu goes to
 * Settings and leaves a pending request here, and the component takes it with
 * `useMenuRequest`, also when it mounts after the request. No dialog moves out of
 * its component for the menu's sake. Ported from creidhne.
 *
 * A request is a counter, so a repeat is a new value.
 */

let seq = 0

interface MenuStore {
  pending: Record<string, number>
  request: (command: string) => void
  /** Drop a request. True when there was one. */
  take: (command: string) => boolean
  /**
   * Drop every request. A request waits for its page, and the page can be
   * refused: Cancel in the unsaved-changes dialog. A request left behind would
   * open its dialog at the next visit to Settings, which nobody asked for then.
   */
  clear: () => void
}

export const useMenuStore = create<MenuStore>((set, get) => ({
  pending: {},
  request: (command) => set((s) => ({ pending: { ...s.pending, [command]: ++seq } })),
  take: (command) => {
    if (get().pending[command] === undefined) return false
    set((s) => {
      const pending = { ...s.pending }
      delete pending[command]
      return { pending }
    })
    return true
  },
  clear: () => set({ pending: {} })
}))
