import { create } from 'zustand'
import { useSettingsStore } from './settingsStore'

/**
 * The world index for the active library, held once for the whole app.
 *
 * This state used to live in `useWorldIndex` as per-instance `useState`, with
 * six call sites. Each mount ran its own status check and, seeing a stale
 * cache, started its own build — the gap between "status says stale" and "build
 * has saved" is a window in which every other mount reaches the same
 * conclusion. In dev, StrictMode's double-invoked effects made that a
 * guaranteed pair of concurrent builds rather than a race. One shared store
 * plus the in-flight maps below collapse all of it onto a single request; the
 * main process keeps its own in-flight cache as a backstop.
 */
interface WorldIndexState {
  index: WorldIndex | null
  loading: boolean
  building: boolean
  buildError: string | null
  /**
   * Which library `index` belongs to. Lets a remount reuse what is already
   * loaded, and is the shared-store replacement for the old per-instance
   * `cancelled` flag.
   */
  loadedFor: string | null
  /** Load the index for `library`, building it only if absent or stale. */
  ensure: (library: string | null) => Promise<void>
  /** Unconditional rebuild — what the Dashboard's "Rebuild" button calls. */
  build: (library: string | null) => Promise<void>
}

const ensures = new Map<string, Promise<void>>()
const builds = new Map<string, Promise<void>>()

/**
 * Only publish a result if its library is still the active one. The effect that
 * calls `ensure` is keyed on `activeLibrary`, so a slow build for library A must
 * not overwrite state after the user has switched to B.
 */
const isCurrent = (library: string): boolean =>
  useSettingsStore.getState().activeLibrary === library

export const useWorldIndexStore = create<WorldIndexState>((set, get) => ({
  index: null,
  loading: false,
  building: false,
  buildError: null,
  loadedFor: null,

  ensure: async (library) => {
    if (!library) {
      set({ index: null, loadedFor: null, loading: false, building: false, buildError: null })
      return
    }
    if (get().loadedFor === library) return
    const pending = ensures.get(library)
    if (pending) return pending

    const run = (async () => {
      set({ loading: true })
      try {
        const status = await window.api.indexStatus(library)
        if (!status?.exists || status?.stale) {
          set({ building: true, buildError: null })
          try {
            const built = await window.api.indexBuild(library)
            if (isCurrent(library)) set({ index: built, loadedFor: library })
          } catch (e) {
            if (isCurrent(library)) {
              set({ buildError: e instanceof Error ? e.message : 'Index build failed' })
            }
          } finally {
            set({ building: false })
          }
        } else {
          const existing = await window.api.indexRead(library)
          if (isCurrent(library)) set({ index: existing, loadedFor: library })
        }
      } finally {
        set({ loading: false })
        ensures.delete(library)
      }
    })()
    ensures.set(library, run)
    return run
  },

  build: async (library) => {
    if (!library) return
    // No `loadedFor` short-circuit — an explicit rebuild must rebuild — but
    // concurrent clicks still collapse onto one build.
    const pending = builds.get(library)
    if (pending) return pending

    const run = (async () => {
      set({ building: true, buildError: null })
      try {
        const result = await window.api.indexBuild(library)
        if (isCurrent(library)) set({ index: result, loadedFor: library })
      } catch (e) {
        if (isCurrent(library)) {
          set({ buildError: e instanceof Error ? e.message : 'Index build failed' })
        }
      } finally {
        set({ building: false })
        builds.delete(library)
      }
    })()
    builds.set(library, run)
    return run
  }
}))

/** Reset store and in-flight state. Call in `beforeEach` — both are module-level. */
export function resetWorldIndexStore(): void {
  ensures.clear()
  builds.clear()
  useWorldIndexStore.setState({
    index: null,
    loading: false,
    building: false,
    buildError: null,
    loadedFor: null
  })
}
