/**
 * Resolve a Dark Ages client filename to the casing it actually has on disk.
 *
 * HTOO-287, renderer side. The same rule as `src/main/fsCase.ts` — ask the
 * directory rather than guess at the casings seen in the wild — over
 * `window.api.listDir` instead of `fs`. Two implementations because the two
 * processes reach the filesystem differently, not because the rule differs.
 * Change one, look at the other.
 *
 * Why it is needed: the official installer writes `Legend.dat`, while everything
 * that reads client archives names them as lowercase literals. Windows folds case
 * on lookup, so the mismatch is invisible there. On Linux and macOS the read
 * throws, and it usually throws into a `catch` that means "not present" — so the
 * feature degrades silently instead of failing.
 */

/**
 * Pick `wanted` out of `names`, ignoring case. `null` when nothing matches.
 *
 * An exact match wins outright, so a directory holding both `Legend.dat` and
 * `legend.dat` — possible on a case-sensitive filesystem — resolves to the one
 * actually asked for rather than to whichever entry came back first.
 */
export function matchNameIgnoringCase(names: readonly string[], wanted: string): string | null {
  if (names.includes(wanted)) return wanted
  const lower = wanted.toLowerCase()
  return names.find((n) => n.toLowerCase() === lower) ?? null
}

/**
 * The path to `name` inside `dir`, under the casing the directory really uses,
 * joined with `sep`.
 *
 * **Falls back to `name` unchanged** when the directory cannot be listed or holds
 * no match, so this stays a resolution step rather than an existence check: the
 * caller's own error handling still runs, and its message still names the file
 * the caller asked for.
 */
export async function resolveClientFile(dir: string, name: string, sep = '/'): Promise<string> {
  try {
    const entries = await window.api.listDir(dir)
    const names = entries.filter((e) => !e.isDirectory).map((e) => e.name)
    return `${dir}${sep}${matchNameIgnoringCase(names, name) ?? name}`
  } catch {
    return `${dir}${sep}${name}`
  }
}
