import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// A BrowserWindow double that records the lifecycle the splash controller drives.
// Only the surface splash.ts touches: show/isVisible/destroy/isDestroyed, the
// `once` handlers, loadFile, and the webContents hardenWindow attaches to.
const instances: FakeWindow[] = []

class FakeWindow {
  visible = false
  destroyed = false
  readonly once_: Record<string, (() => void)[]> = {}
  readonly webContents = {
    setWindowOpenHandler: vi.fn(),
    on: vi.fn()
  }

  constructor() {
    instances.push(this)
  }

  show(): void {
    this.visible = true
  }
  isVisible(): boolean {
    return this.visible
  }
  isDestroyed(): boolean {
    return this.destroyed
  }
  destroy(): void {
    this.destroyed = true
    this.visible = false
    this.emit('closed')
  }
  once(event: string, fn: () => void): void {
    ;(this.once_[event] ??= []).push(fn)
  }
  loadFile(): Promise<void> {
    return Promise.resolve()
  }

  /** Fire a `once` handler the way Electron would. */
  emit(event: string): void {
    const fns = this.once_[event] ?? []
    this.once_[event] = []
    fns.forEach((fn) => fn())
  }
}

vi.mock('electron', () => ({ BrowserWindow: FakeWindow }))

const { createSplashWindow } = await import('../splash')

const FALLBACK_SHOW_MS = 150
const MIN_VISIBLE_MS = 600
const SELF_DESTRUCT_MS = 20_000

beforeEach(() => {
  vi.useFakeTimers()
  instances.length = 0
})

afterEach(() => {
  vi.useRealTimers()
})

/** Create a splash and hand back its controller plus the window double. */
function makeSplash() {
  const controller = createSplashWindow()
  return { controller, win: instances[instances.length - 1] }
}

describe('backstop 1 — ready-to-show is unreliable for transparent windows', () => {
  it('shows on ready-to-show when it does fire', () => {
    const { win } = makeSplash()
    expect(win.isVisible()).toBe(false)
    win.emit('ready-to-show')
    expect(win.isVisible()).toBe(true)
  })

  it('shows on the fallback timer when ready-to-show never fires', () => {
    const { win } = makeSplash()
    vi.advanceTimersByTime(FALLBACK_SHOW_MS)
    expect(win.isVisible()).toBe(true)
  })

  it('keeps the fallback SHORT, because a long one is what makes backstop 4 bite', () => {
    // At 500ms the splash only appears at 500ms, so a reveal shortly after is a
    // sub-100ms flash that reads as no splash at all.
    const { win } = makeSplash()
    vi.advanceTimersByTime(200)
    expect(win.isVisible()).toBe(true)
  })

  it('show is idempotent — the fallback firing after ready-to-show is harmless', () => {
    const { win } = makeSplash()
    win.emit('ready-to-show')
    const showSpy = vi.spyOn(win, 'show')
    vi.advanceTimersByTime(FALLBACK_SHOW_MS)
    expect(showSpy).not.toHaveBeenCalled()
  })
})

describe('backstop 2 — a stranded alwaysOnTop + skipTaskbar window', () => {
  it('self-destructs if nothing ever dismisses it', () => {
    const { win } = makeSplash()
    win.emit('ready-to-show')
    vi.advanceTimersByTime(SELF_DESTRUCT_MS)
    expect(win.isDestroyed()).toBe(true)
  })

  it('waits longer than the caller reveal backstop, so it only fires if that failed too', () => {
    const { win } = makeSplash()
    win.emit('ready-to-show')
    vi.advanceTimersByTime(15_000) // index.ts's reveal backstop
    expect(win.isDestroyed()).toBe(false)
  })

  it('clears its timers on close, so nothing fires against a dead window', () => {
    const { win } = makeSplash()
    win.destroy()
    expect(() => vi.advanceTimersByTime(SELF_DESTRUCT_MS * 2)).not.toThrow()
  })
})

describe('backstop 3 — the main window can die first', () => {
  it('destroy() tears down immediately', () => {
    const { controller, win } = makeSplash()
    win.emit('ready-to-show')
    controller.destroy()
    expect(win.isDestroyed()).toBe(true)
  })

  it('destroy() releases a pending dismiss, so a boot is never stranded', () => {
    const { controller, win } = makeSplash()
    win.emit('ready-to-show')
    const onDone = vi.fn()
    controller.dismiss(onDone)
    controller.destroy()
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})

describe('backstop 4 — the reveal can destroy a splash that was never shown', () => {
  it('shows the splash first when app:ready lands before its first paint', () => {
    // The packaged-build case: one prebuilt bundle over file:// and app:ready is
    // just a settings read, so the reveal can beat ready-to-show. A naive
    // reveal destroys an unshown window and the user sees no splash at all.
    const { controller, win } = makeSplash()
    expect(win.isVisible()).toBe(false)

    controller.dismiss(vi.fn())
    expect(win.isVisible()).toBe(true)
    expect(win.isDestroyed()).toBe(false)
  })

  it('holds it for the minimum-visible floor before swapping', () => {
    const { controller, win } = makeSplash()
    const onDone = vi.fn()
    controller.dismiss(onDone)

    vi.advanceTimersByTime(MIN_VISIBLE_MS - 1)
    expect(win.isDestroyed()).toBe(false)
    expect(onDone).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(win.isDestroyed()).toBe(true)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('does not re-hold a splash that has already been visible long enough', () => {
    const { controller, win } = makeSplash()
    win.emit('ready-to-show')
    vi.advanceTimersByTime(MIN_VISIBLE_MS + 100)

    const onDone = vi.fn()
    controller.dismiss(onDone)
    vi.advanceTimersByTime(0)
    expect(win.isDestroyed()).toBe(true)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('runs onDone AFTER the splash is destroyed, so the two swap cleanly', () => {
    // If the reveal ran first, the alwaysOnTop splash would hover over a live
    // main window.
    const { controller, win } = makeSplash()
    win.emit('ready-to-show')
    let destroyedWhenCalled: boolean | null = null
    controller.dismiss(() => {
      destroyedWhenCalled = win.isDestroyed()
    })
    vi.advanceTimersByTime(MIN_VISIBLE_MS)
    expect(destroyedWhenCalled).toBe(true)
  })

  it('calls onDone immediately if the splash is already gone', () => {
    const { controller, win } = makeSplash()
    win.destroy()
    const onDone = vi.fn()
    controller.dismiss(onDone)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('ignores a second dismiss rather than double-revealing', () => {
    const { controller, win } = makeSplash()
    win.emit('ready-to-show')
    const first = vi.fn()
    const second = vi.fn()
    controller.dismiss(first)
    controller.dismiss(second)
    vi.advanceTimersByTime(MIN_VISIBLE_MS)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })
})

describe('window configuration', () => {
  it('hardens the splash: no child windows, no navigation, nothing opened externally', () => {
    const { win } = makeSplash()
    expect(win.webContents.setWindowOpenHandler).toHaveBeenCalled()
    expect(win.webContents.on).toHaveBeenCalledWith('will-navigate', expect.any(Function))

    // allowExternal: false -- a child-window request is denied and nothing is
    // handed to the OS.
    const handler = win.webContents.setWindowOpenHandler.mock.calls[0][0]
    expect(handler({ url: 'https://www.hybrasyl.com' })).toEqual({ action: 'deny' })
  })
})
