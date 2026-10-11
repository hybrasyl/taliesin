import { useCallback, useEffect, useState } from 'react'
import { useSettingsStore, flushSettings } from '../store/settingsStore'

/**
 * Whether Creidhne (the companion app) was found.
 *
 * Resolved by main, not read from settings: the launch must work before anyone
 * visits Settings, because Creidhne is usually found without being configured
 * (HTOO-292). Re-asked when the override changes, so clearing it is visible, and
 * on `refresh()`. Shared by the nav bar's anvil and the macOS menu's Launch
 * Creidhne item (HTOO-569). `enabled: false` asks nothing.
 */
export function useCompanionStatus({ enabled = true }: { enabled?: boolean } = {}): {
  found: boolean
  refresh: () => void
} {
  const companionPath = useSettingsStore((s) => s.companionPath)
  const [found, setFound] = useState(false)
  const [asked, setAsked] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    // Flushed first for the same reason as the Settings card: main reads the
    // override from disk, and the store's write is debounced.
    void (async () => {
      try {
        await flushSettings()
        const s = await window.api.companionStatus()
        if (!cancelled) setFound(!!s.resolved)
      } catch {
        if (!cancelled) setFound(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [companionPath, enabled, asked])

  const refresh = useCallback(() => setAsked((n) => n + 1), [])
  return { found, refresh }
}
