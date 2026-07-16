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
 * Just the filename part of a rel path — what the editor's filename field
 * edits. The field's semantics are a bare name: it is compared against, and
 * replaced by, `computeMapFilename(id)` (`lod00001.xml`). Handing it a path
 * would make the "computed name" hint fire on every subfoldered map and let the
 * regenerate button silently relocate one to the type root.
 */
export function baseName(rel: string): string {
  const a = activeRel(rel)
  return a.slice(a.lastIndexOf('/') + 1)
}

/**
 * The folder a rel path lives in, relative to the type directory — `''` at the
 * root. Paired with {@link baseName} to put an edited filename back where its
 * map already lived.
 */
export function relFolder(rel: string): string {
  const a = activeRel(rel)
  const cut = a.lastIndexOf('/')
  return cut === -1 ? '' : a.slice(0, cut)
}

/** Recombine a {@link relFolder} and a filename into a rel path. */
export function joinRel(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name
}
