// The single gate on anything Taliesin hands to the operating system.
//
// Pure -- no electron/node imports -- so main, the renderer and the vitest node
// project all apply exactly the same rule. Ported from `dagda/src/shared/externalUrl.ts`,
// which adapted mabon's `shared/linkResolve.ts` (its WP18 security pass). Four
// siblings now carry a byte-equivalent copy; keep them in agreement rather than
// writing a fifth variant.

/**
 * True for a URL we will actually pass to `shell.openExternal`.
 *
 * `http`/`https`/`mailto` only. Everything else is refused, and the refusals are
 * the point: `file:` and `smb:` make the OS open a local or network path,
 * `javascript:` and `data:` are script carriers, and a custom scheme launches
 * whatever handler happens to be registered on the machine. `shell.openExternal`
 * honours all of them.
 *
 * A malformed URL is refused rather than repaired -- guessing at intent here is
 * how an allowlist becomes a suggestion.
 */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:'
  } catch {
    return false
  }
}
