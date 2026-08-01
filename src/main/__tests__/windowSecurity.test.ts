import { describe, it, expect, beforeEach, vi } from 'vitest'
import { pathToFileURL } from 'url'
import {
  initWindowSecurity,
  hardenWindow,
  guardIpc,
  __resetWindowSecurityForTests
} from '../windowSecurity'
import { makeSender, trust, allowed } from './windowSecurityFixtures'

// Both variants carry a SPACE, so the percent-encoding round-trip through
// pathToFileURL is exercised on Windows and on a Linux CI runner alike. A
// trusted location built by string concatenation would not match this, and the
// failure mode is a lockout rather than a hole -- which is why it is pinned.
const PROD_HTML =
  process.platform === 'win32'
    ? 'C:\\Users\\a b\\AppData\\Local\\Programs\\Taliesin\\resources\\app.asar\\out\\renderer\\index.html'
    : '/opt/Taliesin App/resources/app.asar/out/renderer/index.html'
const PROD_URL = pathToFileURL(PROD_HTML).href
const DEV_URL = 'http://127.0.0.1:5173/'

type HardenTarget = Parameters<typeof hardenWindow>[0]

/** Every isSenderAllowed case wants a sender at our own prod location. */
function prodSender(opts: { id?: number; url?: string; destroyed?: boolean } = {}) {
  return makeSender({ url: PROD_URL, ...opts })
}

/** A fake BrowserWindow that records the handlers hardenWindow installs. */
function makeWindow(id = 1) {
  let openHandler: ((d: { url: string }) => unknown) | undefined
  let navHandler: ((e: { preventDefault: () => void }, url: string) => void) | undefined
  const webContents = {
    id,
    mainFrame: { url: PROD_URL },
    isDestroyed: () => false,
    once: vi.fn(),
    setWindowOpenHandler: (fn: typeof openHandler) => {
      openHandler = fn
    },
    on: (event: string, fn: typeof navHandler) => {
      if (event === 'will-navigate') navHandler = fn
    }
  }
  return {
    win: { webContents } as unknown as HardenTarget,
    webContents,
    open: (url: string) => openHandler!({ url }),
    navigate: (url: string) => {
      const event = { preventDefault: vi.fn() }
      navHandler!(event, url)
      return event
    }
  }
}

beforeEach(() => {
  __resetWindowSecurityForTests()
})

describe('isSenderAllowed', () => {
  it('accepts the top frame of a registered window at our own location', () => {
    initWindowSecurity(undefined, PROD_HTML)
    const { contents, event } = prodSender()
    trust(contents)
    expect(allowed(event)).toBe(true)
  })

  it('fails closed before init -- nothing is trusted until initWindowSecurity runs', () => {
    const { contents, event } = prodSender()
    trust(contents)
    expect(allowed(event)).toBe(false)
  })

  it('rejects a window that was never registered', () => {
    initWindowSecurity(undefined, PROD_HTML)
    const { event } = prodSender()
    expect(allowed(event)).toBe(false)
  })

  it('rejects a subframe even at our own URL', () => {
    initWindowSecurity(undefined, PROD_HTML)
    const { contents, event } = prodSender()
    trust(contents)
    // Same URL, different frame object -- an iframe inheriting the preload.
    const subframe = { url: PROD_URL }
    expect(allowed({ ...event, senderFrame: subframe })).toBe(false)
  })

  it('rejects a null senderFrame', () => {
    initWindowSecurity(undefined, PROD_HTML)
    const { contents, event } = prodSender()
    trust(contents)
    expect(allowed({ ...event, senderFrame: null })).toBe(false)
  })

  it.each(['https://attacker.example/', 'about:blank'])(
    'rejects a registered window that navigated to %s',
    (url) => {
      initWindowSecurity(undefined, PROD_HTML)
      const { contents, event } = prodSender({ url })
      trust(contents)
      expect(allowed(event)).toBe(false)
    }
  )

  it('rejects a destroyed sender', () => {
    initWindowSecurity(undefined, PROD_HTML)
    const { contents, event } = prodSender({ destroyed: true })
    trust(contents)
    expect(allowed(event)).toBe(false)
  })

  it('forgets a window when its webContents is destroyed', () => {
    initWindowSecurity(undefined, PROD_HTML)
    const { contents, event } = prodSender()
    trust(contents)
    expect(allowed(event)).toBe(true)

    // Fire the 'destroyed' listener registerTrustedWindow installed.
    const [, onDestroyed] = contents.once.mock.calls[0]
    ;(onDestroyed as () => void)()
    expect(allowed(event)).toBe(false)
  })

  it('matches a production path containing a space', () => {
    // The lockout case. If this ever fails, the app boots to a window in which
    // every single IPC is refused.
    expect(PROD_URL).toContain('%20')
    initWindowSecurity(undefined, PROD_HTML)
    const { contents, event } = prodSender({ url: PROD_URL })
    trust(contents)
    expect(allowed(event)).toBe(true)
  })

  it('rejects a remote file:// host whose path mirrors our own', () => {
    // A file: URL has the opaque origin "null", so an origin-based key carries
    // NO host information and every file:// host compares equal. Without the
    // host in the key, a page loaded from an attacker's SMB share at a matching
    // path is accepted as our own content -- with our preload attached. The
    // POSIX-style path is the one that matters: on Windows the trusted path
    // starts with a drive letter and `C:` cannot be a UNC share name, so only
    // the Linux/macOS builds are actually reachable this way.
    initWindowSecurity(undefined, PROD_HTML)

    // Build the adversary from the trusted URL's OWN pathname, so the two differ
    // in host and nothing else. Spelling a path literal here instead would make
    // the test pass for the wrong reason: on win32 `pathToFileURL('/opt/x')`
    // resolves against the current drive and yields `/E:/opt/x`, which would
    // never have matched regardless of the key.
    const trustedUrl = new URL(PROD_URL)
    const remote = `file://attacker.example${trustedUrl.pathname}`
    expect(trustedUrl.origin).toBe('null') // the reason this is a trap
    expect(new URL(remote).origin).toBe('null') // ...and why the two compared equal
    expect(new URL(remote).pathname).toBe(trustedUrl.pathname) // differ only in host

    const { contents, event } = makeSender({ url: remote })
    trust(contents)
    expect(allowed(event)).toBe(false)

    // ...and the genuine local path still matches, so the fix did not overshoot.
    const local = makeSender({ id: 2, url: PROD_URL })
    trust(local.contents)
    expect(allowed(local.event)).toBe(true)
  })

  it('ignores query and hash when matching', () => {
    initWindowSecurity(DEV_URL, PROD_HTML)
    const { contents, event } = prodSender({ url: `${DEV_URL}?v=2#/packs` })
    trust(contents)
    expect(allowed(event)).toBe(true)
  })

  it('trusts the dev URL when one is given', () => {
    initWindowSecurity(DEV_URL, PROD_HTML)
    const { contents, event } = prodSender({ url: DEV_URL })
    trust(contents)
    expect(allowed(event)).toBe(true)
  })

  it('drops a malformed dev URL instead of trusting everything', () => {
    initWindowSecurity('not a url', PROD_HTML)
    const { contents, event } = prodSender({ url: 'http://127.0.0.1:5173/' })
    trust(contents)
    expect(allowed(event)).toBe(false)

    // ...and the prod location still works, so the malformed entry was skipped
    // rather than poisoning the whole list.
    const prod = prodSender({ id: 2, url: PROD_URL })
    trust(prod.contents)
    expect(allowed(prod.event)).toBe(true)
  })
})

describe('guardIpc', () => {
  /** Minimal ipcMain double recording what actually got registered. */
  function makeIpcMain() {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const listeners = new Map<string, ((...args: unknown[]) => void)[]>()
    return {
      handlers,
      listeners,
      ipcMain: {
        handle: (c: string, fn: (...args: unknown[]) => unknown) => handlers.set(c, fn),
        on: (c: string, fn: (...args: unknown[]) => void) => {
          listeners.set(c, [...(listeners.get(c) ?? []), fn])
        },
        once: (c: string, fn: (...args: unknown[]) => void) => {
          listeners.set(c, [...(listeners.get(c) ?? []), fn])
        },
        addListener: (c: string, fn: (...args: unknown[]) => void) => {
          listeners.set(c, [...(listeners.get(c) ?? []), fn])
        },
        prependListener: (c: string, fn: (...args: unknown[]) => void) => {
          listeners.set(c, [...(listeners.get(c) ?? []), fn])
        },
        prependOnceListener: (c: string, fn: (...args: unknown[]) => void) => {
          listeners.set(c, [...(listeners.get(c) ?? []), fn])
        },
        removeListener: (c: string, fn: (...args: unknown[]) => void) => {
          listeners.set(
            c,
            (listeners.get(c) ?? []).filter((f) => f !== fn)
          )
        },
        removeHandler: (c: string) => handlers.delete(c),
        eventNames: () => [...handlers.keys()]
      }
    }
  }

  function trustedEvent(id = 1) {
    initWindowSecurity(undefined, PROD_HTML)
    const { contents, event } = prodSender({ id })
    trust(contents)
    return event
  }

  it('runs the real handler for a trusted sender and forwards its args', async () => {
    const { ipcMain, handlers } = makeIpcMain()
    const impl = vi.fn(async () => 'ok')
    guardIpc(ipcMain as unknown as Parameters<typeof guardIpc>[0]).handle('settings:load', impl)

    const event = trustedEvent()
    await expect(handlers.get('settings:load')!(event, 'a', 2)).resolves.toBe('ok')
    expect(impl).toHaveBeenCalledWith(event, 'a', 2)
  })

  it('throws for an untrusted invoke and never reaches the handler', () => {
    const { ipcMain, handlers } = makeIpcMain()
    const impl = vi.fn()
    guardIpc(ipcMain as unknown as Parameters<typeof guardIpc>[0]).handle('settings:load', impl)

    initWindowSecurity(undefined, PROD_HTML)
    const { event } = prodSender() // registered nowhere
    expect(() => handlers.get('settings:load')!(event)).toThrow(/untrusted sender/)
    expect(impl).not.toHaveBeenCalled()
  })

  it('silently drops an untrusted fire-and-forget send', () => {
    const { ipcMain, listeners } = makeIpcMain()
    const impl = vi.fn()
    guardIpc(ipcMain as unknown as Parameters<typeof guardIpc>[0]).on('app:ready', impl)

    initWindowSecurity(undefined, PROD_HTML)
    const { event } = prodSender()
    expect(() => listeners.get('app:ready')![0](event)).not.toThrow()
    expect(impl).not.toHaveBeenCalled()
  })

  it('delivers a trusted fire-and-forget send', () => {
    const { ipcMain, listeners } = makeIpcMain()
    const impl = vi.fn()
    guardIpc(ipcMain as unknown as Parameters<typeof guardIpc>[0]).on('app:ready', impl)

    const event = trustedEvent()
    listeners.get('app:ready')![0](event)
    expect(impl).toHaveBeenCalledWith(event)
  })

  it('remaps removeListener to the wrapper it actually registered', () => {
    // `.on` registers a wrapper, so removing by the original function would
    // silently remove nothing and the listener would keep firing.
    const { ipcMain, listeners } = makeIpcMain()
    const guarded = guardIpc(ipcMain as unknown as Parameters<typeof guardIpc>[0])
    const impl = vi.fn()
    guarded.on('app:ready', impl)
    expect(listeners.get('app:ready')).toHaveLength(1)

    guarded.removeListener('app:ready', impl)
    expect(listeners.get('app:ready')).toHaveLength(0)
  })

  it.each(['once', 'addListener', 'prependListener', 'prependOnceListener'])(
    'guards %s too, not just on',
    (method) => {
      // Any listener-registering method left unwrapped falls through the
      // passthrough branch and reaches the raw ipcMain UNGUARDED -- silently,
      // while the module header still claims full coverage.
      const { ipcMain, listeners } = makeIpcMain()
      const impl = vi.fn()
      const guarded = guardIpc(ipcMain as unknown as Parameters<typeof guardIpc>[0])
      ;(guarded as unknown as Record<string, (c: string, f: unknown) => void>)[method](
        'app:ready',
        impl
      )

      initWindowSecurity(undefined, PROD_HTML)
      const { event } = makeSender({ url: PROD_URL }) // registered nowhere
      listeners.get('app:ready')![0](event)
      expect(impl).not.toHaveBeenCalled()
    }
  )

  it('keeps per-channel wrappers, so removing one listener does not miss', () => {
    // One function registered on two channels produces two wrappers. A map
    // keyed by function alone would keep only the second, and removing the
    // first would silently remove nothing.
    const { ipcMain, listeners } = makeIpcMain()
    const guarded = guardIpc(ipcMain as unknown as Parameters<typeof guardIpc>[0])
    const impl = vi.fn()
    guarded.on('a:one', impl)
    guarded.on('a:two', impl)

    guarded.removeListener('a:one', impl)
    expect(listeners.get('a:one')).toHaveLength(0)
    expect(listeners.get('a:two')).toHaveLength(1)
  })

  it('passes other ipcMain members through, bound', () => {
    const { ipcMain, handlers } = makeIpcMain()
    const guarded = guardIpc(ipcMain as unknown as Parameters<typeof guardIpc>[0])
    guarded.handle('a:b', vi.fn())
    expect(guarded.eventNames()).toEqual(['a:b'])
    guarded.removeHandler('a:b')
    expect(handlers.size).toBe(0)
  })
})

describe('hardenWindow', () => {
  it('denies every child window but hands a safe URL to the browser', () => {
    const openExternal = vi.fn()
    const w = makeWindow()
    hardenWindow(w.win, openExternal)
    expect(w.open('https://www.hybrasyl.com')).toEqual({ action: 'deny' })
    expect(openExternal).toHaveBeenCalledWith('https://www.hybrasyl.com')
  })

  it('denies a child window AND refuses to open a dangerous scheme', () => {
    const openExternal = vi.fn()
    const w = makeWindow()
    hardenWindow(w.win, openExternal)
    expect(w.open('file:///C:/Windows/System32/calc.exe')).toEqual({ action: 'deny' })
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('never opens externally when allowExternal is false', () => {
    const openExternal = vi.fn()
    const w = makeWindow()
    hardenWindow(w.win)
    expect(w.open('https://www.hybrasyl.com')).toEqual({ action: 'deny' })
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('blocks navigation away and hands it to the browser instead', () => {
    initWindowSecurity(undefined, PROD_HTML)
    const openExternal = vi.fn()
    const w = makeWindow()
    hardenWindow(w.win, openExternal)

    const event = w.navigate('https://attacker.example/')
    expect(event.preventDefault).toHaveBeenCalled()
    expect(openExternal).toHaveBeenCalledWith('https://attacker.example/')
  })

  it('blocks a dangerous-scheme navigation without opening it', () => {
    initWindowSecurity(undefined, PROD_HTML)
    const openExternal = vi.fn()
    const w = makeWindow()
    hardenWindow(w.win, openExternal)

    const event = w.navigate('file:///C:/Windows/System32/calc.exe')
    expect(event.preventDefault).toHaveBeenCalled()
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('allows navigation to our own content, so a dev HMR full reload survives', () => {
    initWindowSecurity(DEV_URL, PROD_HTML)
    const openExternal = vi.fn()
    const w = makeWindow()
    hardenWindow(w.win, openExternal)

    const event = w.navigate(DEV_URL)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(openExternal).not.toHaveBeenCalled()
  })
})
