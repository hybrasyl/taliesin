import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

// The Electron binary cache and the retried install in ci.yml and release.yml
// (HTOO-388), pinned because both of their failures are silent. A `runner.temp`
// expression at workflow or job level expands to an empty string, and the cache
// then restores nothing on every run with a green tick. A plain `npm ci` step
// loses a run to one 503 from github.com/electron/electron/releases. Ported from
// hyb-electron-template, which took it from dagda, with creidhne's job-name
// pattern: the template's `[a-z][a-z-]*` does not match `e2e`, so that job's
// install went unchecked, with a green test.
//
// Like release-artifacts.test.mjs, this checks the REQUEST: no run here proves
// that the cache restores. The run log does (`Cache restored from key:
// electron-...`).

const REPO_ROOT = join(import.meta.dirname, '..')
const PKG = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'))

const CACHE_PATH = '${{ runner.temp }}/electron-cache'

/** A workflow's text, with LF endings and the comments out: the comments that explain the steps name `npm ci`. */
function workflow(file) {
  const raw = readFileSync(join(REPO_ROOT, '.github/workflows', file), 'utf8')
  return raw.replace(/\r\n/g, '\n').replace(/^\s*#.*$/gm, '')
}

/** Each job's name and text, from its two-space header to the next one. */
function jobs(text) {
  const body = text.slice(text.indexOf('\njobs:\n'))
  const heads = [...body.matchAll(/^ {2}([a-z][a-z0-9-]*):\n/gm)]
  return heads.map((m, i) => ({
    name: m[1],
    text: body.slice(m.index, i + 1 < heads.length ? heads[i + 1].index : undefined)
  }))
}

/** The body of one step in one job, from its `- name:` to the next step. */
function step(job, name) {
  const start = job.text.indexOf(`- name: ${name}`)
  expect(start, `${job.name} has no step named "${name}"`).toBeGreaterThan(-1)
  const next = job.text.indexOf('\n      - ', start + 1)
  return job.text.slice(start, next === -1 ? undefined : next)
}

describe.each([
  // A job that stops installing, or a new one, changes these lists on purpose.
  ['ci.yml', ['check', 'e2e']],
  ['release.yml', ['validate', 'build-windows', 'build-linux', 'build-mac']]
])('the Electron binary cache in %s (HTOO-388)', (file, expected) => {
  const text = workflow(file)
  const installers = jobs(text).filter((job) => /\bnpm ci\b/.test(job.text))

  it('finds the jobs that install', () => {
    expect(installers.map((job) => job.name)).toEqual(expected)
  })

  it.each(installers.map((job) => [job.name, job]))(
    '%s caches the binary under runner.temp, keyed on the OS and the lockfile',
    (_, job) => {
      const cache = step(job, 'Cache the Electron binary')
      expect(cache).toMatch(/uses: actions\/cache@v\d+\n/)
      expect(cache).toContain(`path: ${CACHE_PATH}\n`)
      expect(cache).toContain(
        "key: electron-${{ runner.os }}-${{ hashFiles('package-lock.json') }}\n"
      )
    }
  )

  it.each(installers.map((job) => [job.name, job]))(
    '%s restores the cache, then installs with the step-level env var and the retry',
    (_, job) => {
      expect(job.text.indexOf('- name: Cache the Electron binary')).toBeLessThan(
        job.text.indexOf('- name: Install dependencies')
      )
      const install = step(job, 'Install dependencies')
      expect(install).toContain('shell: bash\n')
      expect(install).toMatch(/\n {8}env:\n {10}electron_config_cache: (.*)\n/)
      expect(install.match(/electron_config_cache: (.*)\n/)[1]).toBe(CACHE_PATH)
      expect(install).toContain('for attempt in 1 2 3; do')
      expect(install).toContain('if npm ci; then exit 0; fi')
      // The last attempt's failure is the step's failure.
      expect(install.trimEnd()).toMatch(/\n {10}done\n {10}exit 1$/)
    }
  )

  it('runs npm ci only inside the retry', () => {
    // The retry's own `echo "npm ci failed ..."` is a message, not a call.
    const calls = text.split('\n').filter((l) => !/^\s*echo /.test(l))
    const all = calls.join('\n').match(/\bnpm ci\b/g) ?? []
    const retried = text.match(/if npm ci; then exit 0; fi/g) ?? []
    expect(all.length).toBe(retried.length)
  })

  it('reads runner.* only at step level, where the context exists', () => {
    // Workflow-level keys sit at column 0 and 2, job-level keys at 4 and 6.
    // Step keys start at 8, so a runner expression with less indent is one
    // that expands to an empty string.
    for (const line of text.split('\n').filter((l) => l.includes('${{ runner.'))) {
      expect(line.match(/^ */)[0].length, line).toBeGreaterThanOrEqual(8)
    }
  })
})

it('downloads the binary in the npm ci step, through the project postinstall', () => {
  // Without it the download moves to the first require('electron'), in a
  // later step that has no electron_config_cache.
  expect(PKG.scripts.postinstall).toMatch(/^install-electron\b/)
})
