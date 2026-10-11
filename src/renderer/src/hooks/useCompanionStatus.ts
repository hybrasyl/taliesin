import { useCallback, useEffect, useState } from 'react'
import { useSettingsStore, flushSettings } from '../store/settingsStore'

/**
 * Whether Creidhne (the companion app) was found.
 *
 * Resolved by main, not read from settings: the launch must work before anyone
 * visits Settings, because Creidhne is usually found without being configured
 * (HTOO-292). Re-asked when the override changes, so clearing it is visible, and
 * on `refresh()`. Shared by the nav bar's anvil, the Settings card and the
 * macOS menu's Launch Creidhne item (HTOO-569). `enabled: false` asks nothing.
 * `status` is null until the first answer, and after a failed ask.
 */
export function useCompanionStatus({ enabled = true }: { enabled?: boolean } = {}): {
  status: CompanionStatus | null
  found: boolean
  refresh: () => void
} {
  const companionPath = useSettingsStore((s) => s.companionPath)
  const [status, setStatus] = useState<CompanionStatus | null>(null)
  const [asked, setAsked] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    // Flush first. Main answers from settings on disk, and the store's write is
    // debounced 200 ms, so asking straight after a pick asked about the previous
    // value — which is why a freshly-chosen Creidhne read "Not found".
    void (async () => {
      try {
        await flushSettings()
        const s = await window.api.companionStatus()
        if (!cancelled) setStatus(s)
      } catch {
        if (!cancelled) setStatus(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [companionPath, enabled, asked])

  const refresh = useCallback(() => setAsked((n) => n + 1), [])
  return { status, found: !!status?.resolved, refresh }
}
