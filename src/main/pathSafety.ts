import { isAbsolute, join, normalize, sep } from 'path'

/**
 * Reject path-traversal attempts on a filename component supplied by the
 * renderer. Resolves `candidate` against `parent` using `join` + `normalize`
 * (no cwd dependency, so the helper is safe to use in tests where paths are
 * synthetic). If `candidate` is itself absolute, it is normalized as-is.
 *
 * Returns the normalized absolute path on success so callers don't have to
 * re-normalize.
 *
 * Why a trailing-separator check: a naive `startsWith(parent)` accepts
 * "/parent-evil/x" because it starts with "/parent". Comparing against
 * `parent + sep` blocks that.
 */
export function assertInside(parent: string, candidate: string): string {
  const absParent = normalize(parent).replace(/[\\/]+$/, '')
  const absCandidate = isAbsolute(candidate)
    ? normalize(candidate)
    : normalize(join(absParent, candidate))
  const parentWithSep = absParent + sep
  if (absCandidate !== absParent && !absCandidate.startsWith(parentWithSep)) {
    throw new Error(`Path traversal rejected: "${candidate}" escapes "${parent}"`)
  }
  return absCandidate
}
