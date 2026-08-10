import { describe, it, expect } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import config from '../vitest.config.mjs'

/**
 * Every test file on disk must be collected by one of the vitest projects.
 *
 * Adding a `__tests__` directory that matches no include glob does not error:
 * vitest collects nothing and still reports success, so the suite goes green
 * while the tests never run. That has now happened three times in this repo —
 * `src/shared`, `src/renderer/src/themes`, and `src/renderer/src/data`, whose
 * tests were written for HTOO-344 and first executed under HTOO-356.
 *
 * The config carries a warning comment at each of those globs. A comment is
 * advice; this is the check.
 */

const ROOT = join(import.meta.dirname, '..')
const SEARCH_DIRS = ['src', 'scripts']
const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', 'coverage', '.git'])

/** Every `*.test.*` file under `dir`, repo-relative with forward slashes. */
function findTests(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) findTests(path, found)
    else if (/\.test\.(ts|tsx|mjs|js)$/.test(entry)) {
      found.push(relative(ROOT, path).split(sep).join('/'))
    }
  }
  return found
}

const escape = (s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&')

/**
 * The subset of glob syntax the config actually uses: `**`, `*`, `{a,b}`.
 *
 * Written out rather than pulled from a matcher library, so this check has no
 * opinion beyond the config's own and cannot drift with a dependency bump.
 */
function globToRegExp(glob) {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*' && glob[i + 2] === '/') {
        out += '(?:[^/]*/)*' // `**/` — any number of directories, including none
        i += 2
      } else if (glob[i + 1] === '*') {
        out += '.*'
        i += 1
      } else {
        out += '[^/]*'
      }
    } else if (c === '{') {
      const end = glob.indexOf('}', i)
      out += `(?:${glob
        .slice(i + 1, end)
        .split(',')
        .map(escape)
        .join('|')})`
      i = end
    } else {
      out += escape(c)
    }
  }
  return new RegExp(`^${out}$`)
}

/** `{ name, include: RegExp[], exclude: RegExp[] }` per project. */
const projects = config.test.projects.map((p) => ({
  name: p.test.name,
  include: (p.test.include ?? []).map(globToRegExp),
  exclude: (p.test.exclude ?? []).map(globToRegExp)
}))

function collectedBy(file) {
  return projects
    .filter((p) => p.include.some((re) => re.test(file)) && !p.exclude.some((re) => re.test(file)))
    .map((p) => p.name)
}

describe('test collection', () => {
  const files = SEARCH_DIRS.flatMap((d) => findTests(join(ROOT, d)))

  it('finds the test files at all', () => {
    // Guards the guard: a broken walk would make every assertion below vacuous.
    expect(files.length).toBeGreaterThan(50)
  })

  it('collects every test file into a project', () => {
    const orphans = files.filter((f) => collectedBy(f).length === 0)
    expect(orphans).toEqual([])
  })

  // A file in two projects runs twice — usually harmless, but it means one of
  // the two is running in the wrong environment.
  it('collects each test file exactly once', () => {
    const duplicated = files.map((f) => [f, collectedBy(f)]).filter(([, p]) => p.length > 1)
    expect(duplicated).toEqual([])
  })
})
