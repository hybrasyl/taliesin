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
  /** Bring the in-memory index up to date after a write into `library`. */
  refresh: (library: string | null) => Promise<void>
}

const ensures = new Map<string, Promise<void>>()
const builds = new Map<string, Promise<void>>()

/**
 * Only touch state while `library` is still the active one. The effect that
 * calls `ensure` is keyed on `activeLibrary`, so a slow build for library A must
 * not overwrite state — including clearing a spinner — after the user has
 * switched to B.
 */
const isCurrent = (library: string): boolean =>
  useSettingsStore.getState().activeLibrary === library

/**
 * Run `fn` for `library` at most once concurrently, tracked in `inflight`.
 * Concurrent callers share the first call's promise; the key is dropped once it
 * settles (on rejection too, so a failure never wedges the library).
 */
function once(
  inflight: Map<string, Promise<void>>,
  library: string,
  fn: () => Promise<void>
): Promise<void> {
  const pending = inflight.get(library)
  if (pending) return pending
  const run = fn().finally(() => inflight.delete(library))
  inflight.set(library, run)
  return run
}

/** Record a failed build, but only for the library still on screen. */
function fail(set: (p: Partial<WorldIndexState>) => void, library: string, e: unknown): void {
  if (isCurrent(library)) {
    set({ buildError: e instanceof Error ? e.message : 'Index build failed' })
  }
}

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

    return once(ensures, library, async () => {
      set({ loading: true })
      try {
        const status = await window.api.indexStatus(library)
        if (!status?.exists || status?.stale) {
          set({ building: true, buildError: null })
          try {
            const built = await window.api.indexBuild(library)
            if (isCurrent(library)) set({ index: built, loadedFor: library })
          } catch (e) {
            fail(set, library, e)
          } finally {
            if (isCurrent(library)) set({ building: false })
          }
        } else {
          const existing = await window.api.indexRead(library)
          if (isCurrent(library)) set({ index: existing, loadedFor: library })
        }
      } finally {
        if (isCurrent(library)) set({ loading: false })
      }
    })
  },

  build: async (library) => {
    if (!library) return
    // No `loadedFor` short-circuit — an explicit rebuild must rebuild — but
    // concurrent clicks still collapse onto one build.
    return once(builds, library, async () => {
      set({ building: true, buildError: null })
      try {
        const result = await window.api.indexBuild(library)
        if (isCurrent(library)) set({ index: result, loadedFor: library })
      } catch (e) {
        fail(set, library, e)
      } finally {
        if (isCurrent(library)) set({ building: false })
      }
    })
  },

  /**
   * Bring the index up to date after the app has written into the library.
   *
   * Nothing used to do this. Every renderer write into a world library — a map
   * XML save, an archive or unarchive, a world map save, an XML stub export —
   * left the shared in-memory index untouched, and there is no file watcher, so
   * a map you had just created could not be picked as a warp destination, and
   * its name and id stayed blank in the list (HTOO-335). The only cure was the
   * Dashboard's Rebuild button.
   *
   * Routed through `build`, not `ensure`. `ensure` short-circuits on
   * `loadedFor === library`, so an `ensure`-based refresh is a silent no-op and
   * the failure looks exactly like the bug being unfixed.
   *
   * **Incremental `buildIndex` rather than `saveSection`.** `buildIndex`
   * compares per-section file signatures and copies unchanged sections across,
   * so saving one map XML re-reads the map XMLs and nothing else. It needs no
   * package or IPC change, works on the current `hybindex-ts`, and is the exact
   * path the manual Rebuild button already takes. `saveSection` would be
   * cheaper per call but needs the caller to say which section it touched —
   * true of all five call sites today, and silently wrong the first time
   * somebody adds a sixth.
   *
   * The real cost is `computeFileCache`, which `stat`s every file in the
   * library. That is why the trigger is a save and never an edit.
   *
   * A build already in flight is waited out rather than joined: it may have
   * scanned the tree before this write landed, so joining it would return a
   * result that does not contain the change that prompted the refresh.
   */
  refresh: async (library) => {
    if (!library) return
    const inFlight = builds.get(library)
    // `allSettled`, because how the earlier build ended is not this caller's
    // business — a failed one must not stop the write that prompted this from
    // being indexed. (`build` records its own failures and does not reject, so
    // this is belt and braces rather than a live path.)
    if (inFlight) await Promise.allSettled([inFlight])
    return get().build(library)
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
