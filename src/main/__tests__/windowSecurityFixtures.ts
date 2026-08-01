// Shared fakes for the renderer-boundary guard.
//
// Not a `.test.ts`, so vitest's `src/main/**/__tests__/**/*.test.ts` glob does
// not collect it as a suite.
//
// This exists because the shape of a "trusted sender" is a real contract that
// `isSenderAllowed` enforces, and it was previously encoded three separate ways
// across two files. The non-obvious part is that **`event.senderFrame` must be
// the SAME OBJECT as `event.sender.mainFrame`** — the guard compares them with
// `!==` to reject subframes, so a fake that merely gives them equal `url`s is
// rejected for the wrong reason and passes for the wrong reason once the check
// changes. Encoding that once, next to nothing else, is the point.

import { vi } from 'vitest'
import { registerTrustedWindow, isSenderAllowed } from '../windowSecurity'

/** A fake webContents plus the event shape `ipcMain` hands a listener. */
export function makeSender(
  opts: { id?: number; url?: string; destroyed?: boolean; withSend?: boolean } = {}
) {
  const url = opts.url ?? 'file:///test/out/renderer/index.html'
  const mainFrame = { url }
  const contents = {
    id: opts.id ?? 1,
    mainFrame,
    isDestroyed: () => opts.destroyed ?? false,
    // registerTrustedWindow subscribes to 'destroyed' to forget the id.
    once: vi.fn(),
    ...(opts.withSend ? { send: vi.fn() } : {})
  }
  return { contents, mainFrame, event: { sender: contents, senderFrame: mainFrame } }
}

/** `registerTrustedWindow` wants a BrowserWindow; the fakes are structural. */
export function trust(contents: unknown): void {
  registerTrustedWindow({ webContents: contents } as never)
}

/** `isSenderAllowed` against a structural fake, without a cast at every call. */
export function allowed(event: unknown): boolean {
  return isSenderAllowed(event as Parameters<typeof isSenderAllowed>[0])
}
