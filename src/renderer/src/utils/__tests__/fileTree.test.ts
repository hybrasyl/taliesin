import { describe, it, expect } from 'vitest'
import {
  allFolderPaths,
  buildFileTree,
  flattenTree,
  folderOptions,
  normalizeFolder,
  type TreeFile
} from '../fileTree'

const files = (...rels: string[]): TreeFile[] => rels.map((rel) => ({ rel }))

describe('buildFileTree', () => {
  it('puts root files at the root and nests the rest by folder', () => {
    const root = buildFileTree(files('Abel.xml', 'townmaps/Piet.xml', 'townmaps/deep/Undine.xml'))

    expect(root.files.map((f) => f.rel)).toEqual(['Abel.xml'])
    expect(root.folders.map((f) => f.path)).toEqual(['townmaps'])

    const towns = root.folders[0]
    expect(towns.files.map((f) => f.rel)).toEqual(['townmaps/Piet.xml'])
    expect(towns.folders.map((f) => f.path)).toEqual(['townmaps/deep'])
  })

  it('counts every descendant file, not just direct children', () => {
    const root = buildFileTree(files('a/1.xml', 'a/b/2.xml', 'a/b/3.xml', 'c/4.xml'))
    const a = root.folders.find((f) => f.name === 'a')!
    expect(a.count).toBe(3)
    expect(a.folders[0].count).toBe(2)
    expect(root.count).toBe(4)
  })

  it('groups an archived file under its real folder, not under .ignore', () => {
    // relFolder strips the prefix, so an archived map sits beside its active
    // sibling. The archived list header already says these are archived; a
    // `.ignore` node would be a constant, meaningless extra level.
    const root = buildFileTree(files('.ignore/townmaps/Piet.xml'))
    expect(root.folders.map((f) => f.path)).toEqual(['townmaps'])
    expect(root.folders[0].files[0].rel).toBe('.ignore/townmaps/Piet.xml')
  })

  it('sorts folders before files and both with numeric collation', () => {
    const root = buildFileTree(files('lod10.xml', 'lod2.xml', 'zeta/x.xml', 'alpha/x.xml'))
    expect(root.folders.map((f) => f.name)).toEqual(['alpha', 'zeta'])
    expect(root.files.map((f) => f.rel)).toEqual(['lod2.xml', 'lod10.xml'])
  })

  it('drops folders that filtering emptied, because the tree is rebuilt', () => {
    // The reason filtering runs before the build: nothing has to prune.
    const all = files('townmaps/Piet.xml', 'dungeons/Cave.xml')
    const matches = all.filter((f) => f.rel.includes('Piet'))
    expect(buildFileTree(matches).folders.map((f) => f.name)).toEqual(['townmaps'])
  })
})

describe('flattenTree', () => {
  const root = buildFileTree(files('Abel.xml', 'a/1.xml', 'a/b/2.xml'))

  it('emits only headers for collapsed folders', () => {
    const rows = flattenTree(root, new Set())
    expect(rows.map((r) => (r.kind === 'folder' ? `[${r.name}]` : r.file.rel))).toEqual([
      '[a]',
      'Abel.xml'
    ])
  })

  it('expands one level at a time and carries depth', () => {
    const rows = flattenTree(root, new Set(['a']))
    expect(rows.map((r) => (r.kind === 'folder' ? `[${r.name}]` : r.file.rel))).toEqual([
      '[a]',
      '[b]',
      'a/1.xml',
      'Abel.xml'
    ])
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 1, 0])
  })

  it('shows a nested file once its whole ancestor chain is expanded', () => {
    // Subfolders come before files at every level, so `a`'s own file follows
    // everything inside `a/b`.
    const rows = flattenTree(root, allFolderPaths(root))
    expect(
      rows.filter((r) => r.kind === 'file').map((r) => (r as { file: TreeFile }).file.rel)
    ).toEqual(['a/b/2.xml', 'a/1.xml', 'Abel.xml'])
  })

  it('gives every row a distinct key', () => {
    const rows = flattenTree(root, allFolderPaths(root))
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length)
  })
})

describe('allFolderPaths', () => {
  it('returns every folder including ancestors', () => {
    const root = buildFileTree(files('a/b/c/1.xml', 'd/2.xml'))
    expect([...allFolderPaths(root)].sort()).toEqual(['a', 'a/b', 'a/b/c', 'd'])
  })
})

describe('folderOptions', () => {
  it('lists each ancestor folder once, sorted, without the root', () => {
    const opts = folderOptions(files('a/b/1.xml', 'a/2.xml', 'z/3.xml', 'root.xml'))
    expect(opts).toEqual(['a', 'a/b', 'z'])
  })

  it('offers an archived file’s folder as an active destination', () => {
    expect(folderOptions(files('.ignore/townmaps/Piet.xml'))).toEqual(['townmaps'])
  })
})

describe('normalizeFolder', () => {
  it.each([
    ['  townmaps  ', 'townmaps'],
    ['townmaps\\deep', 'townmaps/deep'],
    ['a//b', 'a/b'],
    ['/a/b/', 'a/b'],
    ['', ''],
    ['/', '']
  ])('%o → %o', (input, expected) => {
    expect(normalizeFolder(input)).toBe(expected)
  })

  it('strips traversal segments rather than handing them to path safety', () => {
    expect(normalizeFolder('../../etc')).toBe('etc')
    expect(normalizeFolder('a/../b')).toBe('a/b')
    expect(normalizeFolder('./a')).toBe('a')
  })
})
