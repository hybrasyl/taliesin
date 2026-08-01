import { BrowserWindow } from 'electron'
import { join } from 'path'
import { hardenWindow } from './windowSecurity'

/** Show the splash as soon as `ready-to-show` fires, or this long after
 *  creation if it never does. Kept SHORT deliberately -- see backstop 4. */
const FALLBACK_SHOW_MS = 150

/** Once shown, hold the splash at least this long before the reveal swaps it
 *  out. Below roughly this, a splash reads as a flash rather than a splash. */
const MIN_VISIBLE_MS = 600

/** Abnormal-path self-destruct. Longer than index.ts's 15 s reveal backstop, so
 *  it only fires if that failed too. */
const SELF_DESTRUCT_MS = 20_000

/** What `createSplashWindow` hands back: the window is owned in here, so a
 *  caller cannot destroy a splash that has not been shown yet. */
export interface SplashController {
  /** Normal path. Shows the splash if it has not appeared yet, holds it for the
   *  remainder of the minimum-visible floor, then destroys it and runs
   *  `onDone`. The caller reveals the main window from that callback, so the
   *  two swap cleanly rather than the always-on-top splash hovering over a live
   *  window. */
  dismiss: (onDone: () => void) => void
  /** Abnormal paths (main window died first, boot failed). Tears down
   *  immediately and releases any pending `onDone`, so a boot is never
   *  stranded. */
  destroy: () => void
}

/**
 * Frameless, transparent splash window shown the instant the app boots — before
 * the main window's renderer bundle has evaluated. It stays up until the
 * renderer signals `app:ready` (see the boot sequence in `index.ts`), so the
 * user gets immediate branded feedback instead of a few seconds of nothing.
 *
 * Deliberately dependency-free and self-contained (loads a static
 * `resources/splash.html`) so it ports to a sibling by copying this file +
 * `resources/splash.html` and swapping the logo/title. See
 * `docs/plans/complete/splash-screen.md`.
 *
 * `splash.once('ready-to-show', show)` alone has four silent failure modes, and
 * this factory backstops all of them. Ported from `oghma/src/main/splash.ts`
 * after its 2026-07-19 and 2026-07-29 audits.
 *
 *   1. **`ready-to-show` is unreliable for TRANSPARENT windows on Windows.** If
 *      it never fires, the splash silently never appears. Backed by
 *      `FALLBACK_SHOW_MS` and an idempotent `show()`.
 *   2. **The splash is `alwaysOnTop` + `skipTaskbar`.** A boot that dies before
 *      the reveal strands a floating window the user cannot focus, close, or
 *      find in the taskbar. `SELF_DESTRUCT_MS` covers it; both timers clear on
 *      `closed`.
 *   3. **The main window can die first.** `index.ts` calls `destroy()` from the
 *      main window's `closed` handler, not only on the reveal path.
 *   4. **The reveal can destroy a splash that was never shown.** `show()`
 *      no-ops on a destroyed window, so if `app:ready` lands before the
 *      splash's first paint the user sees NO splash at all. Packaged builds hit
 *      this and dev never does: dev waits on vite serving hundreds of modules,
 *      while packaged loads one prebuilt bundle over `file://` and `app:ready`
 *      is just a settings read. `dismiss()` owns the ordering rather than the
 *      timing.
 *
 * **Backstops 1 and 4 are one change, not two.** A long fallback plus a naive
 * reveal is actively harmful: with a 500 ms fallback the splash only appears at
 * 500 ms, so a reveal at 579 ms yields a 79 ms flash, which reads as no splash
 * at all. That is why `FALLBACK_SHOW_MS` is 150 rather than 500, and why the
 * minimum-visible floor exists.
 */
export function createSplashWindow(): SplashController {
  const splash = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    center: true,
    skipTaskbar: true,
    show: false,
    // The splash has no IPC needs; keep it isolated with no preload. With no
    // preload there is nothing for the sandbox to break, so it is free here --
    // and it is deliberately NOT registered as a trusted window, because a
    // window with no bridge cannot send IPC and registering it would widen the
    // trusted set for nothing.
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Nothing here should ever open a window or navigate away. `will-navigate`
  // fires only for renderer-initiated navigation, never for the loadFile below,
  // so this does not block the splash loading its own HTML -- which is
  // deliberately not a trusted location.
  hardenWindow(splash, { allowExternal: false, openExternal: () => {} })

  // Mirrors the icon path convention in index.ts (`../../resources/...`).
  // resources/** is bundled + asarUnpacked, so this resolves in production too.
  splash.loadFile(join(__dirname, '../../resources/splash.html')).catch((err) => {
    console.error('Failed to load splash:', err)
  })

  /** When the splash actually became visible, or null while it has not. */
  let shownAt: number | null = null
  let fallbackTimer: NodeJS.Timeout | null = null
  let selfDestructTimer: NodeJS.Timeout | null = null
  let holdTimer: NodeJS.Timeout | null = null
  /** Held so `destroy()` on an abnormal path can still release the caller. */
  let pendingDone: (() => void) | null = null

  function clearTimers(): void {
    if (fallbackTimer) clearTimeout(fallbackTimer)
    if (selfDestructTimer) clearTimeout(selfDestructTimer)
    if (holdTimer) clearTimeout(holdTimer)
    fallbackTimer = selfDestructTimer = holdTimer = null
  }

  /** Idempotent, and safe on a destroyed window. Backstop 1. */
  function show(): void {
    if (splash.isDestroyed() || splash.isVisible()) return
    splash.show()
    shownAt = Date.now()
  }

  function teardown(): void {
    clearTimers()
    if (!splash.isDestroyed()) splash.destroy()
    const done = pendingDone
    pendingDone = null
    done?.()
  }

  splash.once('ready-to-show', show)
  fallbackTimer = setTimeout(show, FALLBACK_SHOW_MS)
  selfDestructTimer = setTimeout(teardown, SELF_DESTRUCT_MS)
  splash.once('closed', clearTimers)

  return {
    dismiss(onDone: () => void): void {
      if (splash.isDestroyed()) {
        onDone()
        return
      }
      if (pendingDone) return // already dismissing
      pendingDone = onDone
      // Backstop 4: show it first if it never got the chance, so the reveal
      // cannot destroy a splash the user never saw.
      show()
      const elapsed = shownAt === null ? 0 : Date.now() - shownAt
      const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed)
      holdTimer = setTimeout(teardown, remaining)
    },
    destroy: teardown
  }
}
