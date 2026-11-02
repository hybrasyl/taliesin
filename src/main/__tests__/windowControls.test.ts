import { describe, it, expect, vi } from 'vitest'
import { registerHandlers } from '../handlers'

// The window buttons, from the main side. TitleBar.test.tsx checks that each
// button sends its channel; this checks what main does with it. It replaced a
// check by eye on the Linux box (Sabrael, 2026-11-02): maximise twice
// restores, and close closes the window that sent it.
describe('the window-button channels', () => {
  type Listener = (event: { sender: unknown }) => void

  function wire(): {
    send: (channel: string) => void
    win: { minimize: () => void; maximize: () => void; unmaximize: () => void; close: () => void }
  } {
    const listeners = new Map<string, Listener>()
    let maximized = false
    const win = {
      minimize: vi.fn(),
      maximize: vi.fn(() => (maximized = true)),
      unmaximize: vi.fn(() => (maximized = false)),
      isMaximized: () => maximized,
      close: vi.fn()
    }
    const sender = {}
    registerHandlers(
      {
        ipcMain: {
          handle: vi.fn(),
          on: (channel: string, fn: Listener) => listeners.set(channel, fn)
        } as never,
        BrowserWindow: { fromWebContents: (wc: unknown) => (wc === sender ? win : null) } as never,
        dialog: {} as never
      },
      // Registration only adds listeners; nothing here reads the context.
      {} as never
    )
    return { send: (channel) => listeners.get(channel)!({ sender }), win }
  }

  it('minimise minimises the window that sent it', () => {
    const { send, win } = wire()
    send('minimize-window')
    expect(win.minimize).toHaveBeenCalledOnce()
  })

  it('maximise maximises, and a second press restores', () => {
    const { send, win } = wire()
    send('maximize-window')
    expect(win.maximize).toHaveBeenCalledOnce()
    expect(win.unmaximize).not.toHaveBeenCalled()
    send('maximize-window')
    expect(win.unmaximize).toHaveBeenCalledOnce()
    expect(win.maximize).toHaveBeenCalledOnce()
  })

  it('close closes the window that sent it', () => {
    const { send, win } = wire()
    send('close-window')
    expect(win.close).toHaveBeenCalledOnce()
  })
})
