/**
 * No Dark Ages client file is opened by a name we made up.
 *
 * HTOO-287's rule: the installer writes `Legend.dat`, a third-party unpacker may
 * write `legend.dat`, and everything in this repo names archives as lowercase
 * literals. Windows folds case on lookup so the mismatch is invisible there; on
 * Linux the read throws, and it usually throws into a `catch` that means "not
 * present", so a feature degrades silently instead of failing.
 *
 * `fsCase.ts` exists in both processes to answer this by asking the directory.
 * Two call sites skipped it and were found by eye a year after the helper landed
 * (HTOO-449) — `seo.dat` and `ia.dat`, the two archives the isometric renderer
 * cannot start without. This is that sweep, automated, so it does not have to be
 * done by eye again.
 *
 * It reads the SOURCE, like `ipcSchemaCoverage.test.ts` beside it. A behaviour
 * test would cover the two call sites that exist today; this covers the one
 * somebody adds next year.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const repoRoot = join(__dirname, '..', '..', '..')

/**
 * Client archives, as the reader spells them.
 *
 * From `epona`'s `EXPECTED_CLIENT_ARCHIVES`, which is the house's list of what a
 * complete client tree holds, plus `setoa.dat`. Names only — the point is the
 * name reaching a path, whatever its casing in the source.
 */
const CLIENT_FILES = [
  'legend.dat',
  'setoa.dat',
  'hades.dat',
  'ia.dat',
  'misc.dat',
  'national.dat',
  'roh.dat',
  'seo.dat',
  'cious.dat',
  'khanpal.dat'
]

// String.raw throughout: these are regex sources, and a normal template literal
// eats every backslash in them before RegExp ever sees one.
const NAMES = CLIENT_FILES.map((f) => f.replace('.', String.raw`\.`)).join('|')

/**
 * The two shapes that turn a name we chose into a path.
 *
 * `JOINED_TEMPLATE` — a template literal holding a `${…}` and then a separator
 * and the name: `` `${clientPath}/ia.dat` ``. The separator is what makes it a
 * path and not prose; without it this also matched the error message
 * *"not found in setoa.dat"*, which is correct code and correct English.
 *
 * `JOINED_CALL` — `join(dir, 'ia.dat')`, the main-process form.
 *
 * Neither matches a bare `'ia.dat'` in quotes, because that is a lookup key for
 * `archive.get(...)`, a display string, or the `name` argument handed to
 * `resolveClientFile` — all correct, and all common.
 */
const JOINED_TEMPLATE = new RegExp(String.raw`\`[^\`]*\$\{[^\`]*\}[^\`]*[/\\](${NAMES})`, 'i')
const JOINED_CALL = new RegExp(String.raw`join\([^)]*,\s*['"\`](${NAMES})['"\`]`, 'i')

const SEARCH_DIRS = ['src/main', 'src/renderer/src']
const SKIP_DIRS = new Set(['__tests__', 'node_modules', 'dist', 'out'])

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(full, out)
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

/** Comments stripped, so the paragraph describing the rule does not trip it. */
function code(file: string): string {
  return readFileSync(file, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('client archives are opened under the casing the disk uses', () => {
  const files = SEARCH_DIRS.flatMap((d) => walk(join(repoRoot, d)))

  it('found source to check', () => {
    // A walk that silently matches nothing passes every case for the wrong
    // reason. The repo has hundreds of these files; a handful means a bad path.
    expect(files.length).toBeGreaterThan(100)
  })

  it('no client archive name is joined into a path directly', () => {
    const offenders = files
      .filter((f) => {
        const text = code(f)
        return JOINED_TEMPLATE.test(text) || JOINED_CALL.test(text)
      })
      .map((f) => relative(repoRoot, f).replace(/\\/g, '/'))

    expect(
      offenders,
      'These build a client-file path from a literal name. Use resolveClientFile ' +
        'from fsCase instead, so the casing comes from the directory (HTOO-287).'
    ).toEqual([])
  })

  it('the two files that read client archives import the resolver', () => {
    // Named, rather than derived, so deleting the import is a failure here
    // rather than a silent loss of coverage.
    for (const rel of [
      'src/renderer/src/utils/mapRenderer.ts',
      'src/renderer/src/utils/worldMapRenderer.ts'
    ]) {
      expect(code(join(repoRoot, rel)), `${rel} no longer imports resolveClientFile`).toMatch(
        /resolveClientFile/
      )
    }
  })
})
