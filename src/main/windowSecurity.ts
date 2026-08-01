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
 * Locations we consider "our own content", keyed as `protocol//host + pathname`
 * -- query and hash deliberately excluded, so a cache-busting or HMR query
 * string still matches.
 *
 * Set once at boot by `initWindowSecurity`. Empty until then, which fails
 * closed: before init, nothing is trusted.
 */
let trustedLocations = new Set<string>()

/**
 * The key form above. One place, so init and lookup cannot disagree.
 *
 * **`host` explicitly, NOT `origin`.** For a `file:` URL the WHATWG parser
 * returns the opaque origin `"null"`, so an origin-based key carries no host
 * information at all and every `file://` host compares equal. That makes
 * `file://attacker.example/opt/Taliesin App/.../index.html` indistinguishable
 * from the local `file:///opt/Taliesin App/.../index.html` we actually trust --
 * a remote SMB path would satisfy both `will-navigate` and the IPC sender
 * check. Windows happens to be spared because its install path starts with a
 * drive letter and `C:` is not a legal UNC share name, but the Linux AppImage,
 * the deb and the macOS dmg all install under a plain `/opt`- or
 * `/Applications`-style path with no such accident protecting them.
 *
 * For `http`/`https` this is identical to `origin` (the parser normalises the
 * default port away), so nothing is lost on the dev-server path.
 */
function locationKey(url: URL): string {
  return `${url.protocol}//${url.host}${url.pathname}`
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

/** Every `ipcMain` method that registers a request-response handler. */
const HANDLE_METHODS = new Set<string | symbol>(['handle', 'handleOnce'])

/**
 * Every `ipcMain` method that registers a fire-and-forget listener.
 *
 * All of them, not just `on`. `once` and the `addListener`/`prepend*` aliases
 * register real listeners too, and anything left out of this set would fall
 * through the passthrough branch below and reach the raw `ipcMain` UNGUARDED --
 * silently, and while the file header still claimed full coverage. Nothing uses
 * them today; this is what keeps "covered by construction" true when something
 * does.
 */
const LISTEN_METHODS = new Set<string | symbol>([
  'on',
  'once',
  'addListener',
  'prependListener',
  'prependOnceListener'
])

/**
 * Wrap `ipcMain` so every handler- and listener-registering method rejects an
 * untrusted sender before the real handler runs. An `invoke` rejection surfaces
 * as an error in the renderer; a fire-and-forget send is dropped silently.
 *
 * Installed at the single `registerHandlers` call site, so every handler is
 * covered by construction -- a new one cannot forget to opt in. The corollary:
 * a handler registered on the raw `ipcMain` instead silently opts OUT.
 */
export function guardIpc(ipcMain: IpcMain): IpcMain {
  // listener -> channel -> the wrapper actually registered. Keyed by channel as
  // well as by function, because the same listener registered on two channels
  // produces two wrappers, and a single-level map would lose the first -- so a
  // later removeListener would remove nothing.
  const wrappers = new WeakMap<object, Map<string, (...args: never[]) => void>>()

  return new Proxy(ipcMain, {
    get(target, prop, receiver) {
      if (HANDLE_METHODS.has(prop)) {
        return (
          channel: string,
          listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
        ): void => {
          const guarded = (event: IpcMainInvokeEvent, ...args: unknown[]): unknown => {
            if (!isSenderAllowed(event)) {
              throw new Error(`IPC "${channel}" rejected: untrusted sender`)
            }
            return listener(event, ...args)
          }
          ;(target[prop as 'handle'] as IpcMain['handle'])(channel, guarded)
        }
      }
      if (LISTEN_METHODS.has(prop)) {
        return (
          channel: string,
          listener: (event: IpcMainEvent, ...args: unknown[]) => void
        ): IpcMain => {
          const wrapped = (event: IpcMainEvent, ...args: unknown[]): void => {
            if (!isSenderAllowed(event)) return
            listener(event, ...args)
          }
          let byChannel = wrappers.get(listener)
          if (!byChannel) {
            byChannel = new Map()
            wrappers.set(listener, byChannel)
          }
          byChannel.set(channel, wrapped as (...args: never[]) => void)
          ;(target[prop as 'on'] as IpcMain['on'])(channel, wrapped)
          return receiver as IpcMain
        }
      }
      // The listen methods register a wrapper, so removal has to be remapped or
      // it silently removes nothing.
      if (prop === 'off' || prop === 'removeListener') {
        return (channel: string, listener: (...args: never[]) => void): IpcMain => {
          const wrapped = wrappers.get(listener)?.get(channel) ?? listener
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
