import { useEffect, useCallback } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { useWorldIndexStore } from '../store/worldIndexStore'

/**
 * Read the world index for the active library, building it if absent or stale.
 *
 * The index is a rebuildable cache that lives outside the (git) world folder
 * and is shared with Creidhne, so a fresh machine — or a world edited
 * externally — may have no cache or a stale one. Builds are incremental, so an
 * up-to-date cache makes that path cheap.
 *
 * State lives in {@link useWorldIndexStore}, not per-instance `useState`: with
 * six call sites, per-instance state let each mount start its own build off the
 * same stale status. See that module for the details.
 */
export function useWorldIndex() {
  const activeLibrary = useSettingsStore((s) => s.activeLibrary)
  // Select fields individually — a single object selector would return a fresh
  // reference on every call and re-render all six consumers on any store write.
  const index = useWorldIndexStore((s) => s.index)
  const loading = useWorldIndexStore((s) => s.loading)
  const building = useWorldIndexStore((s) => s.building)
  const buildError = useWorldIndexStore((s) => s.buildError)
  const ensure = useWorldIndexStore((s) => s.ensure)
  const doBuild = useWorldIndexStore((s) => s.build)

  useEffect(() => {
    void ensure(activeLibrary)
  }, [activeLibrary, ensure])

  const build = useCallback(() => doBuild(activeLibrary), [activeLibrary, doBuild])

  return { index, loading, building, buildError, build }
}
