/**
 * Resolve a Dark Ages client filename to the casing it actually has on disk.
 *
 * HTOO-287. Client archives are named in mixed case — the official installer
 * writes `Legend.dat` — while everything that reads them names them as lowercase
 * literals, because that is how the formats and the palette-resolution rules
 * spell them. Windows folds case on lookup, so the mismatch is invisible there
 * and the app has always worked. On Linux and macOS the read throws, and the
 * failure is usually silent: these reads sit behind a `catch` that means
 * "the file is not present", which is exactly what a wrong-cased name looks like.
 *
 * The rule is: **ask the directory rather than guess at the casings seen in the
 * wild.** A list of candidate spellings (`Legend.dat`, `LEGEND.DAT`, …) covers
 * whatever has been observed and nothing else; one `readdir` covers every case
 * including ones nobody has met yet.
 *
 * `src/renderer/src/utils/fsCase.ts` is the same rule over `window.api.listDir`,
 * for the renderer-side reads. Two implementations because the two processes
 * reach the filesystem differently — main has `fs`, the renderer has an IPC —
 * not because the rule differs. Change one, look at the other.
 */
import { promises as fs } from 'fs'
import { join } from 'path'

/**
 * Pick `wanted` out of `names`, ignoring case. Returns `null` when nothing
 * matches.
 *
 * An exact match wins outright, so a directory holding both `Legend.dat` and
 * `legend.dat` — possible on a case-sensitive filesystem — resolves to the one
 * that was actually asked for rather than to whichever `readdir` happened to
 * return first.
 *
 * Pure, so the interesting cases are testable without a filesystem.
 */
export function matchNameIgnoringCase(names: readonly string[], wanted: string): string | null {
  if (names.includes(wanted)) return wanted
  const lower = wanted.toLowerCase()
  return names.find((n) => n.toLowerCase() === lower) ?? null
}

/**
 * The absolute path to `name` inside `dir`, under whatever casing the directory
 * really uses.
 *
 * **Falls back to `name` unchanged** when the directory cannot be read or holds
 * no match. That keeps this a resolution step rather than an existence check:
 * the caller's own error handling still runs, and its error message still names
 * the file the caller asked for rather than one this function invented.
 */
export async function resolveClientFile(dir: string, name: string): Promise<string> {
  try {
    const entries = await fs.readdir(dir)
    return join(dir, matchNameIgnoringCase(entries, name) ?? name)
  } catch {
    return join(dir, name)
  }
}
