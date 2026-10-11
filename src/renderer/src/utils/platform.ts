/**
 * The main process's `process.platform`, from the preload (HTOO-569). Read when
 * called, not at import, so a test can set `window.api.platform` per case.
 */
export function currentPlatform(): string | undefined {
  return typeof window === 'undefined' ? undefined : window.api?.platform
}

export function isMac(): boolean {
  return currentPlatform() === 'darwin'
}
