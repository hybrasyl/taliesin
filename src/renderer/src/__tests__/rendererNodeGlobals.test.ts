// A sandboxed renderer has no Node globals (HTOO-393). Taliesin runs its window
// with `sandbox: true`, so a renderer that reads `process`, `Buffer`, `require`,
// `__dirname` or `__filename` throws `ReferenceError` when the page renders.
//
// Balor shipped that fault. `Releases.tsx` read `process.platform` for one
// sentence. Typecheck, lint, 2430 unit and jsdom assertions and 30 e2e specs
// passed, and the tab went to the error boundary on its first click.
//
// **vitest runs in Node, so the unit suites cannot see it.** The jsdom project
// gives a component a DOM, not a renderer, and Node's globals are present in it.
// The environment cannot be fixed either: react-dom's development build reads
// `NODE_ENV` off the global that would have to be removed. So this test reads
// the SOURCE. `e2e/nav-pages.spec.js` is the other half: it opens every page in
// the built app.
//
// The renderer only. `src/main` is Node and uses these freely. Copied from
// hyb-electron-template, which took it from balor.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

// Resolved from `process.cwd()` rather than `import.meta.url` — vitest runs
// with the repository root as the working directory, and the alias-resolved
// form does not survive to a path.
const RENDERER_SRC = join(process.cwd(), 'src/renderer/src')

/**
 * The globals a bundler leaves alone and a sandboxed renderer does not have.
 *
 * **Two groups, because the false-positive risk differs.** `process`, `Buffer`
 * and `require` are ordinary English words, so a bare match reds on prose — and
 * stripping comments does not save it, because the prose that matters is JSX
 * TEXT. Porting this check to `epona` found exactly that: `Epona cannot reach
 * its background process.` matched, on the full stop ending the sentence. So
 * these three must be followed by a real USE — a property access, a call or an
 * index — and a trailing `.` with nothing after it is not one.
 *
 * `__dirname` and `__filename` are not words, and their ordinary use is BARE
 * (`join(__dirname, x)`), so requiring an access there would miss every real
 * case. They are matched as identifiers.
 */
const WORD_LIKE = ['process', 'Buffer', 'require']
const BARE = ['__dirname', '__filename']
const NODE_GLOBALS = [...WORD_LIKE, ...BARE]

/** A property access, a call or an index. **No whitespace is allowed after the
 *  dot**, which is what separates `process.platform` from `cannot reach the
 *  process. Restart it.` — the second sentence puts a capital letter two
 *  characters after the full stop and matched until this was tightened. The
 *  cost is a chained `process` split across lines, which no formatter here
 *  produces for a global.
 *
 *  A property access, a call or an index — and for `.`, something must follow
 *  it. `\\.[A-Za-z_$]` is what separates `process.platform` from a sentence
 *  that happens to end in the word. */
function useOf(name: string): RegExp {
  return WORD_LIKE.includes(name)
    ? new RegExp(`\\b${name}\\s*(?:\\.[A-Za-z_$]|\\(|\\[)`)
    : new RegExp(`\\b${name}\\b`)
}

/** Comments first. A sentence in a comment may legitimately name any of these —
 *  this file's own header does — and the rule is to describe the pattern rather
 *  than reproduce it. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** A hand-rolled walk rather than `fs.globSync`, which is still marked
 *  experimental on the Node this project builds against. */
function rendererSources(dir: string = RENDERER_SRC): string[] {
  const found: string[] = []
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (item.isDirectory()) {
      if (item.name !== '__tests__') found.push(...rendererSources(join(dir, item.name)))
    } else if (/\.tsx?$/.test(item.name)) {
      found.push(join(dir, item.name))
    }
  }
  return found
}

describe('the renderer never touches a Node global', () => {
  // The assertion that would have caught WP33 before it reached a click.
  it.each(NODE_GLOBALS)('never reads `%s`', (name) => {
    const pattern = useOf(name)
    const offenders = rendererSources()
      .filter((file) => pattern.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => file.slice(RENDERER_SRC.length + 1))

    // Named in the failure, so the message is the fix rather than a boolean.
    expect(offenders).toEqual([])
  })

  // Without this the suite above passes on an empty list. A glob that silently
  // matches nothing reads as coverage — the zero-wire pass, one suite over.
  it('actually read the renderer', () => {
    const files = rendererSources()
    expect(files.length).toBeGreaterThan(5)
    expect(files.some((f) => f.endsWith('App.tsx'))).toBe(true)
  })

  // And that the matcher can fail at all. A regex that matches nothing anywhere
  // would pass every case above for the wrong reason.
  it('matches a use, and not a mention', () => {
    const pattern = useOf('process')
    expect(pattern.test('const p = process' + '.platform')).toBe(true)
    expect(pattern.test('the build process is slow')).toBe(false)
  })

  // The regression this check earned by being ported. A sentence in JSX TEXT
  // ending in the word matched, because the full stop looked like a property
  // access. Comment-stripping cannot help — it is not a comment. Found in
  // `epona`: "Epona cannot reach its background process." Port a check by
  // RUNNING it, and treat its first false positive as part of the design.
  it('does not match a sentence that merely ENDS in the word', () => {
    const pattern = useOf('process')
    expect(pattern.test('Taliesin cannot reach its background process.')).toBe(false)
    expect(pattern.test('cannot reach the process. Restart it.')).toBe(false)
  })

  // And the bare pair still match the way they are really written — requiring
  // an access there would miss `join(__dirname, x)`, which is every real use.
  it('matches __dirname bare, because that is how it is used', () => {
    expect(useOf('__dirname').test('join(__dirname, x)')).toBe(true)
    expect(useOf('__filename').test('const f = __filename')).toBe(true)
  })
})
