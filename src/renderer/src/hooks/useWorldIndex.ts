import { useState, useEffect, useCallback } from 'react'
import { useSettingsStore } from '../store/settingsStore'

export function useWorldIndex() {
  const activeLibrary = useSettingsStore((s) => s.activeLibrary)
  const [index, setIndex] = useState<WorldIndex | null>(null)
  const [loading, setLoading] = useState(false)
  const [building, setBuilding] = useState(false)
  const [buildError, setBuildError] = useState<string | null>(null)

  // Load the index whenever the active library changes. The index is now a
  // rebuildable cache that lives outside the (git) world folder and is shared
  // with Creidhne, so a fresh machine — or a world edited externally — may have
  // no cache or a stale one. Auto-build in that case, then use the result;
  // otherwise read the existing cache. buildIndex is incremental, so an
  // up-to-date cache makes the build path cheap.
  useEffect(() => {
    if (!activeLibrary) {
      setIndex(null)
      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const status = await window.api.indexStatus(activeLibrary)
        if (!status?.exists || status?.stale) {
          if (cancelled) return
          setBuilding(true)
          setBuildError(null)
          try {
            const built = await window.api.indexBuild(activeLibrary)
            if (!cancelled) setIndex(built)
          } catch (e) {
            if (!cancelled) {
              setBuildError(e instanceof Error ? e.message : 'Index build failed')
            }
          } finally {
            if (!cancelled) setBuilding(false)
          }
        } else {
          const existing = await window.api.indexRead(activeLibrary)
          if (!cancelled) setIndex(existing)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeLibrary])

  // Trigger a full rebuild (writes to disk, then updates state)
  const build = useCallback(async () => {
    if (!activeLibrary) return
    setBuilding(true)
    setBuildError(null)
    try {
      const result = await window.api.indexBuild(activeLibrary)
      setIndex(result)
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : 'Index build failed')
    } finally {
      setBuilding(false)
    }
  }, [activeLibrary])

  return { index, loading, building, buildError, build }
}
