import { promises as fs } from 'fs'
import { basename, dirname, isAbsolute, join, normalize, sep } from 'path'

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

// ── Real-path containment (HTOO-675) ─────────────────────────────────────────
//
// The checks above compare path strings. A junction or a symlink below an
// allowed folder passes them and leads the I/O somewhere else. The checks
// below resolve links on both sides before they compare. Call them at the I/O
// boundary, after the string check, and before any mkdir or write.
//
// A race window stays open: a folder can change into a link between the check
// and the I/O. The check closes every case where the link exists first, which
// is the case the review demonstrated.

/**
 * The real path of `p`. When `p` does not exist, the real path of its nearest
 * existing ancestor, with the missing part added back. A new file is thus
 * judged by the folder it will go into.
 */
export async function realpathAllowMissing(p: string): Promise<string> {
  let cur = normalize(p)
  const tail: string[] = []
  for (;;) {
    try {
      const real = await fs.realpath(cur)
      return tail.length > 0 ? join(real, ...tail.reverse()) : real
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw e
      const parent = dirname(cur)
      if (parent === cur) throw e
      tail.push(basename(cur))
      cur = parent
    }
  }
}

/** Case folds on Windows, where the filesystem does. Both sides are real paths. */
function fold(p: string): string {
  return process.platform === 'win32' ? p.toLowerCase() : p
}

/** True when real path `child` is real path `parent` or below it. */
export function realContains(parent: string, child: string): boolean {
  const a = fold(normalize(parent).replace(/[\\/]+$/, ''))
  const b = fold(normalize(child))
  return b === a || b.startsWith(a + sep) || (a.endsWith(sep) && b.startsWith(a))
}

/**
 * `assertInside`, then the same test on real paths. Returns the lexical path,
 * which is the one to use for the I/O.
 */
export async function assertRealInside(parent: string, candidate: string): Promise<string> {
  const lexical = assertInside(parent, candidate)
  const [realParent, realTarget] = await Promise.all([
    realpathAllowMissing(parent),
    realpathAllowMissing(lexical)
  ])
  if (!realContains(realParent, realTarget)) {
    throw new Error(`Path "${candidate}" leaves "${parent}" through a link`)
  }
  return lexical
}

/**
 * `assertInsideAnyRoot`, then a real-path test: the target's real path must be
 * inside the real path of some allowed root. A link from one allowed root into
 * another allowed root passes. A root that is itself a link is allowed, because
 * the user chose it.
 */
export async function assertRealInsideAnyRoot(
  roots: Iterable<string>,
  candidate: string
): Promise<{ path: string; real: string }> {
  const list = [...roots]
  const lexical = assertInsideAnyRoot(list, candidate)
  const realTarget = await realpathAllowMissing(lexical)
  for (const root of list) {
    if (realContains(await realpathAllowMissing(root), realTarget)) {
      return { path: lexical, real: realTarget }
    }
  }
  throw new Error(`Path "${candidate}" leaves every allowed root through a link`)
}
