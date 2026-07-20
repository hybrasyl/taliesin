/**
 * Folder grouping for the editor file lists.
 *
 * Folders are not a data model here — there is no folder record and no way to
 * create an empty one. A world's subdirectories are authored in git and these
 * helpers only *derive* a tree from the rel paths `fs:listSection` returns, so
 * a folder holding no files simply does not exist as far as the UI is
 * concerned.
 *
 * Everything keys off {@link relFolder}, which strips the `.ignore/` prefix —
 * an archived `.ignore/townmaps/Piet.xml` groups under `townmaps` alongside its
 * active sibling rather than under a redundant `.ignore` node, because the
 * archived list already says so.
 */

import { baseName, relFolder } from './mapFileRel'

/** The minimum a row must carry to be placed in the tree: its rel path. */
export interface TreeFile {
  rel: string
}

export interface FolderNode<T extends TreeFile> {
  /** Last segment — what the header row shows. `''` for the root. */
  name: string
  /** Full folder path from the type root, `''` for the root. Expansion key. */
  path: string
  folders: FolderNode<T>[]
  files: T[]
  /** Files at or below this node — the count shown on the header row. */
  count: number
}

export type TreeRow<T extends TreeFile> =
  | { kind: 'folder'; key: string; path: string; name: string; depth: number; count: number }
  | { kind: 'file'; key: string; depth: number; file: T }

const byName = (a: string, b: string): number => a.localeCompare(b, undefined, { numeric: true })

function emptyNode<T extends TreeFile>(name: string, path: string): FolderNode<T> {
  return { name, path, folders: [], files: [], count: 0 }
}

/**
 * Group files into a folder tree by their {@link relFolder}.
 *
 * Filter *before* calling this, never prune after: rebuilding from the
 * surviving files drops now-empty folders and keeps each match's ancestors for
 * free, where a post-hoc prune has to walk back up looking for them.
 */
export function buildFileTree<T extends TreeFile>(files: readonly T[]): FolderNode<T> {
  const root = emptyNode<T>('', '')

  for (const file of files) {
    const folder = relFolder(file.rel)
    let node = root
    node.count++
    if (folder) {
      let path = ''
      for (const segment of folder.split('/')) {
        path = path ? `${path}/${segment}` : segment
        let child = node.folders.find((f) => f.name === segment)
        if (!child) {
          child = emptyNode<T>(segment, path)
          node.folders.push(child)
        }
        child.count++
        node = child
      }
    }
    node.files.push(file)
  }

  const sortNode = (node: FolderNode<T>): void => {
    node.folders.sort((a, b) => byName(a.name, b.name))
    node.files.sort((a, b) => byName(baseName(a.rel), baseName(b.rel)))
    node.folders.forEach(sortNode)
  }
  sortNode(root)

  return root
}

/**
 * Flatten a tree into rows for a single scrollable list — folders before files
 * at each level, a collapsed folder contributing only its own header row.
 *
 * The list stays flat rather than nesting `<Collapse>`s so row height and
 * scroll position stay predictable (and so it can be virtualized later without
 * restructuring).
 */
export function flattenTree<T extends TreeFile>(
  root: FolderNode<T>,
  expanded: ReadonlySet<string>,
  keyOf: (file: T) => string = (f) => f.rel
): TreeRow<T>[] {
  const rows: TreeRow<T>[] = []

  const walk = (node: FolderNode<T>, depth: number): void => {
    for (const folder of node.folders) {
      rows.push({
        kind: 'folder',
        key: `folder:${folder.path}`,
        path: folder.path,
        name: folder.name,
        depth,
        count: folder.count
      })
      if (expanded.has(folder.path)) walk(folder, depth + 1)
    }
    for (const file of node.files) {
      rows.push({ kind: 'file', key: keyOf(file), depth, file })
    }
  }
  walk(root, 0)

  return rows
}

/** Every folder path in the tree, ancestors included — the expand-all set. */
export function allFolderPaths<T extends TreeFile>(root: FolderNode<T>): Set<string> {
  const paths = new Set<string>()
  const walk = (node: FolderNode<T>): void => {
    for (const folder of node.folders) {
      paths.add(folder.path)
      walk(folder)
    }
  }
  walk(root)
  return paths
}

/**
 * The distinct folders a set of files occupies, ancestors included and sorted —
 * the suggestions offered when picking a save destination. The type root (`''`)
 * is not included; callers present it themselves.
 */
export function folderOptions(files: readonly TreeFile[]): string[] {
  const paths = new Set<string>()
  for (const file of files) {
    const folder = relFolder(file.rel)
    if (!folder) continue
    let path = ''
    for (const segment of folder.split('/')) {
      path = path ? `${path}/${segment}` : segment
      paths.add(path)
    }
  }
  return [...paths].sort(byName)
}

/**
 * Normalize a typed folder path: trims, forward-slashes, collapses repeats and
 * drops `.`/`..` segments. A renderer path still gets validated in main, but a
 * picker that hands `..` to `assertInsideAnyRoot` fails as an error dialog
 * rather than as an unavailable option, so clean it here too.
 */
export function normalizeFolder(input: string): string {
  return input
    .replace(/\\/g, '/')
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s && s !== '.' && s !== '..')
    .join('/')
}
