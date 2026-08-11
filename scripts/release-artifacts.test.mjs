import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

/**
 * Every packaging target electron-builder.yml declares must reach the published
 * release, and this file is the only thing that can say so on a commit.
 *
 * **It exists because the answer was no, and nothing noticed for months.**
 * `electron-builder.yml` has declared both `nsis` and `portable` since WP14,
 * `build-windows` ran `--win portable`, and the release job had no glob for an
 * installer — so every release published four assets where five were configured,
 * and Taliesin has never shipped an installer. Every gate in the repository
 * passed the whole time: the config was right, the workflow was valid YAML, and
 * `fail_on_unmatched_files: true` says nothing at all about a file **nobody
 * asked for**. **A requirement expressed only as a list of globs cannot report
 * the entry that is missing from the list.**
 *
 * Ported from balor's `release-artifacts.test.mjs`, where the same defect was
 * found on a release candidate (HTOO-244). Copied rather than re-derived: the
 * two repositories have the same five targets and the same workflow shape, and
 * the comment-stripping below is a trap balor hit on this file's first run.
 *
 * Read as raw text rather than parsed, for the reason `verify-fuses.test.mjs`
 * gives about the fuse block: there is no YAML dependency in this repository,
 * these are files it owns, and the job here is to catch a human edit rather than
 * to be a general parser.
 */

const REPO_ROOT = join(import.meta.dirname, '..')
const builder = readFileSync(join(REPO_ROOT, 'electron-builder.yml'), 'utf8')
const workflowRaw = readFileSync(join(REPO_ROOT, '.github/workflows/release.yml'), 'utf8')

/**
 * Comments out before any anchored pattern is matched.
 *
 * The comment explaining why the packaging step must not name a target
 * necessarily contains the form it is forbidding, so an assertion that reads the
 * raw file fails against a correct workflow. Describe the pattern; never write
 * it.
 */
const workflow = workflowRaw.replace(/^\s*#.*$/gm, '')

/** The `files:` block of the Create GitHub Release step, comments stripped. */
const releaseGlobs = (() => {
  const start = workflow.indexOf('          files: |')
  expect(start).toBeGreaterThan(-1)
  const rest = workflow.slice(start).split('\n').slice(1)
  const globs = []
  for (const line of rest) {
    if (!/^ {12}\S/.test(line)) break // the block ends at the next shallower key
    if (!line.trim().startsWith('#')) globs.push(line.trim())
  }
  return globs
})()

describe('every configured target reaches the release', () => {
  // suffix → the glob that must publish it. Keyed on what the artifact is
  // CALLED, because that is what both halves have to agree about: the left is
  // derived from electron-builder.yml's artifactName templates, the right is
  // what the workflow asks GitHub to upload.
  const EXPECTED = [
    { target: 'nsis', suffix: '-setup.exe' },
    { target: 'portable', suffix: '-portable.exe' },
    { target: 'AppImage', suffix: '.AppImage' },
    { target: 'deb', suffix: '.deb' },
    { target: 'dmg', suffix: '.dmg' }
  ]

  it.each(EXPECTED)('$target is declared, and has a release glob', ({ target, suffix }) => {
    expect(builder).toMatch(new RegExp(`^\\s*(- )?(target: )?${target}\\s*$`, 'm'))
    expect(releaseGlobs.some((g) => g.endsWith(suffix))).toBe(true)
  })

  it('publishes nothing the configuration does not declare', () => {
    // The other direction, and it is not symmetry for its own sake. A glob with
    // no target behind it makes `fail_on_unmatched_files: true` red every
    // release until somebody deletes the glob — a failure that arrives on a tag,
    // which is the most expensive moment to find one.
    const known = EXPECTED.map((e) => e.suffix)
    for (const glob of releaseGlobs) {
      expect(known.some((suffix) => glob.endsWith(suffix))).toBe(true)
    }
    expect(releaseGlobs).toHaveLength(EXPECTED.length)
  })

  it('leaves the Windows target list in electron-builder.yml alone', () => {
    // `--win` with no targets after it. Naming them here as well would put the
    // list in two files, which is the shape the missing installer came from:
    // the config said two and the workflow said one, and the config is the half
    // a reader checks.
    expect(workflow).toMatch(/npx electron-builder --win --publish never/)
    expect(workflow).not.toMatch(/--win \w/)
  })

  it('signs every Windows artifact it publishes, or none of them', () => {
    // Signing one of the two would be worse than signing neither: a user handed
    // a signed installer beside an unsigned portable cannot read that as
    // "credentials are configured for one artifact".
    const signSteps = workflow.match(/uses: sslcom\/esigner-codesign@/g) ?? []
    const windowsArtifacts = EXPECTED.filter((e) => e.suffix.endsWith('.exe'))
    expect(signSteps).toHaveLength(windowsArtifacts.length)
    for (const { suffix } of windowsArtifacts) {
      expect(workflow).toContain(`${suffix}\n          override: true`)
    }
  })

  it('uploads every Windows artifact out of the build job', () => {
    // The step between packaging and publishing, and the one the release job's
    // globs cannot speak for: `artifacts/**` can only match what was uploaded.
    // `if-no-files-found: error` then covers both names, so a rename in
    // electron-builder.yml fails the build rather than shipping one artifact.
    for (const { suffix } of EXPECTED.filter((e) => e.suffix.endsWith('.exe'))) {
      expect(workflow).toContain(`dist/*${suffix}`)
    }
  })

  it('installs per-user, assisted, with a directory page', () => {
    // Pinned because changing perMachine after a release is the expensive one:
    // an existing per-user installation is not upgraded by a per-machine
    // installer, and the user ends up with two. allowToChangeInstallationDirectory
    // only takes effect while oneClick is false, so the three are asserted
    // together rather than separately.
    expect(builder).toMatch(/^ {2}oneClick: false$/m)
    expect(builder).toMatch(/^ {2}perMachine: false$/m)
    expect(builder).toMatch(/^ {2}allowToChangeInstallationDirectory: true$/m)
  })
})
