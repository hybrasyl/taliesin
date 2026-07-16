/**
 * Helpers for the type-relative paths the world index keys files by.
 *
 * `fs:listSection` returns paths relative to the type directory, forward-slashed
 * and `.ignore/`-prefixed when archived: `Abel.xml`, `fire/blast.xml`,
 * `.ignore/old.xml`. Those rel paths *are* the index's `MapDetail.filename`
 * keys, so they are the identity a row carries — these helpers only derive
 * presentation and destination paths from them.
 */

/**
 * The rel path with any `.ignore/` prefix removed: where the file lives, or
 * would live, when active. `.ignore/old.xml` → `old.xml`; `fire/blast.xml` is
 * unchanged. This is what the editor's filename field edits and what
 * unarchive composes its destination from.
 */
export function activeRel(rel: string): string {
  return rel.replace(/^\.ignore\//, '')
}

/**
 * What a file list row shows: `activeRel` minus the `.xml` extension.
 *
 * The subfolder is kept — two maps can share a basename across folders, and
 * dropping it would render them as indistinguishable duplicate rows. The
 * `.ignore/` prefix is dropped because the archived section header already
 * says so and it is constant across every archived row.
 */
export function displayName(rel: string): string {
  return activeRel(rel).replace(/\.xml$/i, '')
}

/**
 * Forward-slash an absolute path and drop any trailing separator.
 *
 * `resolveLibraryPath` builds the library path with `join`, so it carries
 * native separators, while `fs:listSection` returns `dir` forward-slashed.
 * Composing row paths from one and comparing against the other would make
 * `selectedFile.path === file.path` always false and silently drop the file
 * list's selection highlight. Normalizing the library path once keeps both
 * sides byte-identical.
 */
export function toPosix(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '')
}
