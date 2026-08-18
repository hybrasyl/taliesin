/**
 * Every editor that saves a file offers rename, and every save path honours it.
 *
 * HTOO-379 asked for this guard and it did not exist. Rename is spread across
 * three places in each editor — a filename field in the panel, a comparison in
 * the page that decides the save is a rename, and a `moveFile` on that branch —
 * and an editor can lose any one of them without a single unit test noticing.
 * `WorldMapPage` is the reason to check rather than assume: it is a second copy
 * of `MapEditorPage`'s save, and a fix applied to one is not applied to the
 * other by anything except somebody remembering.
 *
 * This reads the SOURCE, like `ipcSchemaCoverage.test.ts` beside it and for the
 * same reason: the rule is cheap to break, invisible in a diff, and silent in
 * every other gate. It lives in `src/main/__tests__` because that is where this
 * repo keeps its source-reading guards, not because the files it reads are main
 * process files — they are not.
 *
 * The last assertion is the one with history. The editors used to ask
 * `fs:exists` before the move and refuse a destination that answered yes, which
 * on Windows refused a case-only rename as a collision with itself. That check
 * now lives in `moveFile`, where identity is decided by `realpath`. Bringing it
 * back would reintroduce the fault and break nothing else.
 *
 * It is asserted **only over the rename branch**, not over the whole file.
 * `window.api.exists` is correct in these pages for other things — an archive
 * destination, a restore target — and a blanket ban would be a rule that reads
 * as stricter than it is and gets deleted the first time it is inconvenient.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

/** Editors that save a named file, and so owe a rename. */
const EDITORS = [
  {
    name: 'maps',
    page: 'src/renderer/src/pages/MapEditorPage.tsx',
    panel: 'src/renderer/src/components/mapeditor/MapEditorPanel.tsx'
  },
  {
    name: 'world maps',
    page: 'src/renderer/src/pages/WorldMapPage.tsx',
    panel: 'src/renderer/src/components/worldmapeditor/WorldMapEditorPanel.tsx'
  }
] as const

const repoRoot = join(__dirname, '..', '..', '..')

function source(rel: string): string {
  const path = join(repoRoot, rel)
  // A guard that silently reads nothing passes for the wrong reason.
  expect(existsSync(path), `${rel} is missing — update EDITORS`).toBe(true)
  const text = readFileSync(path, 'utf-8')
  expect(text.length, `${rel} is empty`).toBeGreaterThan(0)
  return text
}

/** Comments stripped, so the paragraph describing a rule does not trip it. */
function code(rel: string): string {
  return source(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('every editor offers rename', () => {
  it('has editors to check', () => {
    // The zero-wire pass, third time in this repo. An empty list is a pass.
    expect(EDITORS.length).toBeGreaterThan(0)
  })

  it.each(EDITORS)('$name: the panel puts a filename field on screen', ({ panel }) => {
    const text = source(panel)
    expect(text, `${panel} renders no EditorHeader`).toContain('<EditorHeader')
    expect(text, `${panel} does not accept a typed filename`).toMatch(/onFileNameChange=/)
  })

  it.each(EDITORS)('$name: the page decides whether the save is a rename', ({ page }) => {
    expect(code(page), `${page} never compares the target name with the current one`).toMatch(
      /const isRename\s*=/
    )
  })

  it.each(EDITORS)('$name: the page honours a rename by moving the file', ({ page }) => {
    expect(code(page), `${page} never calls moveFile, so a rename would leave two files`).toMatch(
      /window\.api\.moveFile\(/
    )
  })

  it.each(EDITORS)('$name: the rename branch does not pre-check with exists', ({ page }) => {
    const text = code(page)
    const start = text.indexOf('const isRename')
    const end = text.indexOf('window.api.moveFile(', start)
    expect(end, `${page}: no moveFile after isRename`).toBeGreaterThan(start)
    const branch = text.slice(start, end)
    expect(
      branch,
      `${page} calls window.api.exists on the rename branch — that check belongs in moveFile, ` +
        'because on Windows exists() answers case-insensitively and refuses a case-only rename'
    ).not.toMatch(/window\.api\.exists\(/)
  })
})
