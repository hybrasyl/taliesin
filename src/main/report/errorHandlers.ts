// Wire the main-process global error nets to a capture callback. Kept separate from
// index.ts so it's drop-in and trivially unit-testable. We only LOG — we do not
// swallow the process's own crash behavior beyond what capturing implies; an
// uncaughtException still leaves the app in whatever state Electron decides.

import type { ErrorEntry } from './diagnosticsBlock'

type Capture = (entry: ErrorEntry) => void

export function installGlobalErrorHandlers(capture: Capture): void {
  process.on('uncaughtException', (err: Error) => {
    capture({
      source: 'uncaughtException',
      origin: 'main',
      message: err?.message ? `${err.name || 'Error'}: ${err.message}` : String(err),
      stack: err?.stack
    })
  })

  process.on('unhandledRejection', (reason: unknown) => {
    const err = reason instanceof Error ? reason : null
    capture({
      source: 'unhandledRejection',
      origin: 'main',
      message: err ? `${err.name || 'Error'}: ${err.message}` : String(reason),
      stack: err?.stack
    })
  })
}
