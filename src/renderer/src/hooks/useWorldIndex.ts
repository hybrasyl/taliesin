import { useState, useEffect, useCallback } from 'react'
import { useRecoilValue } from 'recoil'
import { activeLibraryState } from '../recoil/atoms'

export function useWorldIndex() {
  const activeLibrary = useRecoilValue(activeLibraryState)
  const [index, setIndex] = useState<WorldIndex | null>(null)
  const [loading, setLoading] = useState(false)
  const [building, setBuilding] = useState(false)
  const [buildError, setBuildError] = useState<string | null>(null)

  // Read existing index whenever the active library changes
  useEffect(() => {
    if (!activeLibrary) {
      setIndex(null)
      return
    }
    setLoading(true)
    window.api
      .indexRead(activeLibrary)
      .then(setIndex)
      .finally(() => setLoading(false))
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
