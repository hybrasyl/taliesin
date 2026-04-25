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

/**
 * Reject a renderer-supplied path that doesn't fall inside any of the
 * currently-allowed session roots. Used by Category-A handlers that take
 * a full absolute path with no implicit parent (`fs:readFile`, `pack:load`,
 * etc.) — the renderer can't address arbitrary disk locations, only paths
 * the user has authorised this session.
 *
 * Returns the normalized absolute path on success.
 */
export function assertInsideAnyRoot(roots: Iterable<string>, candidate: string): string {
  let firstError: Error | null = null
  let rootCount = 0
  for (const root of roots) {
    rootCount++
    try {
      return assertInside(root, candidate)
    } catch (err) {
      if (!firstError) firstError = err as Error
    }
  }
  if (rootCount === 0) {
    throw new Error(`Path "${candidate}" rejected: no allowed roots configured`)
  }
  throw new Error(`Path "${candidate}" is not inside any allowed root`)
}

/**
 * Predicate variant of `assertInsideAnyRoot` for use in zod refinements
 * and other contexts where throwing is the wrong shape.
 */
export function isInsideAnyRoot(roots: Iterable<string>, candidate: string): boolean {
  for (const root of roots) {
    try {
      assertInside(root, candidate)
      return true
    } catch {
      /* try next */
    }
  }
  return false
}
