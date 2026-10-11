import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// HTOO-478. React 19.2's dev build walks a prop that changes kind (null → object)
// with `for...in`, three levels deep. A DataArchive holds the raw `.dat` buffer,
// whose byte indices are enumerable, so one such prop emits a row per byte and
// `npm run dev` dies with an out-of-memory error. A DataArchiveEntry reaches the
// same buffer through `entry.archive`. Production is unaffected, so nothing but
// the dev build ever shows it.
//
// The two components ArchivePage renders stay mounted across selections and
// archive switches, so their props must not hold either type: indices and names
// only, with the objects read from archiveStore. The fix is 6d3f3d8; the
// write-up is docs/plans/complete/archive-preview-dev-oom.md.
//
// Reads the source, because the failure is a dev-only memory blow-up that no
// unit test renders. The sub-previews inside ArchivePreview.tsx may take the
// objects: that subtree remounts on every archive change (see its Props note).

const ARCHIVE_DIR = join(__dirname, '..')

/** The body of `interface Props { ... }` in a file. */
function propsBlock(file: string): string {
  const src = readFileSync(join(ARCHIVE_DIR, file), 'utf8')
  const start = src.indexOf('interface Props {')
  expect(start, `${file} has no \`interface Props\``).toBeGreaterThan(-1)
  return src.slice(start, src.indexOf('\n}', start))
}

describe('Archive page props carry no archive objects', () => {
  it.each(['ArchiveEntryList.tsx', 'ArchivePreview.tsx'])('%s', (file) => {
    const block = propsBlock(file)
    // Guard the guard: the block was found and has at least one prop in it.
    expect(block).toMatch(/\w+\??:/)
    // Comment lines may name the types; only declarations count.
    const declarations = block
      .split('\n')
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join('\n')
    expect(declarations).not.toMatch(/\bDataArchive(Entry)?\b/)
  })
})
