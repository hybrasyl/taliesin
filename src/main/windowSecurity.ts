// Renderer-boundary hardening. Ported from `epona/src/main/windowSecurity.js`
// (the smallest single-window version) with dagda's TypeScript annotations;
// both descend from mabon's WP18 pass, which answered a real static audit.
// Tracked house-wide as R-006.
//
// Three protections, kept in ONE place so the policy is single-sourced and
// auditable rather than scattered across window constructors:
//
//   1. hardenWindow()  -- deny top-level navigation away from our own content,
//      and deny every child window. The main window still hands *validated*
//      external URLs to the OS; the splash opens nothing.
//   2. guardIpc()      -- wrap ipcMain so every handler rejects an IPC whose
//      sender is not the top frame of a known Taliesin window at our own
//      location.
//   3. initWindowSecurity()/registerTrustedWindow() -- the fail-closed trust
//      set both of the above consult.
//
// Taliesin has exactly one window that can send IPC. The splash has no preload,
// so it has no bridge and cannot reach ipcMain at all -- which is why mabon's
// per-window role model and channel allowlists are deliberately absent here.
// There is no <webview> and no `webviewTag`, so dagda's hardenWebviews is absent
// for the same reason. Add either back only alongside the window that needs it.
//
// This is a SECOND gate, independent of the ones already here. `pathSafety.ts`
// (`assertInside*`) still contains every path that arrives, and the Zod schemas
// in `schemas/` still validate every payload. Nothing here replaces them.

import type { BrowserWindow, IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { pathToFileURL } from 'url'
import { isSafeExternalUrl } from '../shared/externalUrl'

/**
 * Locations we consider "our own content", each keyed as `origin + pathname` --
 * query and hash deliberately excluded, so a cache-busting or HMR query string
 * still matches.
 *
 * Set once at boot by `initWindowSecurity`. Empty until then, which fails
 * closed: before init, nothing is trusted.
 */
let trustedLocations = new Set<string>()

/** The key form above. One place, so init and lookup cannot disagree. */
function locationKey(url: URL): string {
  return url.origin + url.pathname
}

/** webContents.id for windows we constructed. An IPC from a webContents absent
 *  from this set -- a rogue window, a devtools extension, anything unexpected --
 *  is rejected outright. */
const trustedWindows = new Set<number>()

/**
 * Record the renderer locations we trust. Call once at boot, before any window
 * loads. `devUrl` is `ELECTRON_RENDERER_URL` in dev (undefined in production);
 * `prodIndexHtml` is the absolute path to the built `renderer/index.html`.
 */
export function initWindowSecurity(devUrl: string | undefined, prodIndexHtml: string): void {
  const locations = new Set<string>()
  if (devUrl) {
    try {
      locations.add(locationKey(new URL(devUrl)))
    } catch {
      /* malformed dev URL -- leave it out and fail closed */
    }
  }
  // pathToFileURL, never string concatenation: Taliesin installs under a path
  // containing the user's name, which can hold a space or `#`, and the naive
  // form produces a different file URL. A trusted location that never matches
  // is a LOCKOUT -- every IPC rejected and the app dead on arrival -- not a
  // safety margin.
  locations.add(locationKey(pathToFileURL(prodIndexHtml)))
  trustedLocations = locations
}

/** True when `rawUrl` points at our own renderer content. Remote pages,
 *  `about:blank` and malformed URLs are all untrusted. */
function isTrustedLocation(rawUrl: string): boolean {
  try {
    return trustedLocations.has(locationKey(new URL(rawUrl)))
  } catch {
    return false // unparseable -- untrusted, never repaired
  }
}

/**
 * Register a window we created, so its IPC is accepted. Forgotten when its
 * webContents is destroyed, so a stale id cannot authorize a future one that
 * Electron happens to reuse.
 *
 * Call this BEFORE the window loads: the guard fails closed, so registering
 * afterwards rejects whatever the renderer sends during hydration.
 */
export function registerTrustedWindow(win: BrowserWindow): void {
  const id = win.webContents.id
  trustedWindows.add(id)
  win.webContents.once('destroyed', () => trustedWindows.delete(id))
}

/**
 * Deny top-level navigation and every child window.
 *
 * `openExternal` is supplied only for the main window, where a link with
 * `target="_blank"` (About and Settings render four) is meant to reach the
 * user's browser. Omit it -- as the splash does -- and the window opens nothing.
 * One knob, so there is no "may open, but has no opener" state to reason about.
 *
 * `will-navigate` fires only for renderer-initiated navigation, never for a
 * main-process `loadFile`/`loadURL` -- so this does not block a window from
 * loading its own initial content, including the splash's deliberately
 * untrusted `resources/splash.html`.
 */
export function hardenWindow(win: BrowserWindow, openExternal?: (url: string) => void): void {
  win.webContents.setWindowOpenHandler((details) => {
    if (openExternal && isSafeExternalUrl(details.url)) openExternal(details.url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (isTrustedLocation(url)) return // our own content -- e.g. a dev HMR full reload
    event.preventDefault()
    if (openExternal && isSafeExternalUrl(url)) openExternal(url)
  })
}

/**
 * The authority check: accept an IPC only from the top frame of a known
 * Taliesin window, at one of our own locations. Exported for direct unit testing.
 */
export function isSenderAllowed(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  const contents = event.sender
  if (contents.isDestroyed()) return false
  if (!trustedWindows.has(contents.id)) return false
  // Must be the window's own top frame: a subframe inheriting the preload must
  // not reach a privileged channel.
  const frame = event.senderFrame
  if (!frame || frame !== contents.mainFrame) return false
  return isTrustedLocation(frame.url)
}

/**
 * Wrap `ipcMain` so `.handle` / `.on` reject an untrusted sender before the real
 * handler runs. An `invoke` rejection surfaces as an error in the renderer; a
 * fire-and-forget `.on` is dropped silently.
 *
 * Installed at the single `registerHandlers` call site, so every handler is
 * covered by construction -- a new one cannot forget to opt in. The corollary:
 * a handler registered on the raw `ipcMain` instead silently opts OUT.
 */
export function guardIpc(ipcMain: IpcMain): IpcMain {
  // Keyed by `object` rather than a function type: functions are objects, so
  // this typechecks with no casts at the set/get sites.
  const wrappers = new WeakMap<object, (event: IpcMainEvent, ...args: unknown[]) => void>()

  return new Proxy(ipcMain, {
    get(target, prop, receiver) {
      if (prop === 'handle') {
        return (
          channel: string,
          listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
        ): void => {
          target.handle(channel, (event, ...args) => {
            if (!isSenderAllowed(event)) {
              throw new Error(`IPC "${channel}" rejected: untrusted sender`)
            }
            return listener(event, ...args)
          })
        }
      }
      if (prop === 'on') {
        return (
          channel: string,
          listener: (event: IpcMainEvent, ...args: unknown[]) => void
        ): IpcMain => {
          const wrapped = (event: IpcMainEvent, ...args: unknown[]): void => {
            if (!isSenderAllowed(event)) return
            listener(event, ...args)
          }
          wrappers.set(listener, wrapped)
          target.on(channel, wrapped)
          return receiver as IpcMain
        }
      }
      // `.on` registers a wrapper, so removal has to be remapped or it silently
      // removes nothing.
      if (prop === 'off' || prop === 'removeListener') {
        return (channel: string, listener: (...args: never[]) => void): IpcMain => {
          const wrapped = wrappers.get(listener) ?? listener
          target.removeListener(channel, wrapped as (...args: unknown[]) => void)
          return receiver as IpcMain
        }
      }
      // Bind the passthrough: an unbound method off Reflect.get loses `this`,
      // and `ipcMain.removeHandler(...)` then throws.
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
}

/** Test-only reset, so suites do not leak trusted windows or locations between
 *  cases. */
export function __resetWindowSecurityForTests(): void {
  trustedLocations = new Set()
  trustedWindows.clear()
}
