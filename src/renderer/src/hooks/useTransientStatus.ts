import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Transient status/toast message that auto-clears after `durationMs`. Returns
 * `[message, show]`. Guards against overlapping timers (a new message resets the
 * clear timer instead of leaving a stale one running) and clears on unmount —
 * three of the four page copies this replaced leaked the timeout.
 */
export function useTransientStatus(durationMs = 2500): [string | null, (msg: string) => void] {
  const [message, setMessage] = useState<string | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback(
    (msg: string) => {
      setMessage(msg)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setMessage(null), durationMs)
    },
    [durationMs]
  )

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    []
  )

  return [message, show]
}
