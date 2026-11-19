import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { launchApp, getMainWindow, isMac } from './helpers.js'

// Undo and redo in the map XML editor (requested by Dalta). The unit tests
// cover the history. This spec shows that the undo and redo chords reach the
// page in the built app, where an application menu could take the chord first,
// and that the history survives a save.

const XMLNS = 'http://www.hybrasyl.com/XML/Hybrasyl/2020-02'

// The platform's chords (historyChord): Cmd+Z and Shift+Cmd+Z on macOS, where
// Ctrl+Z is not undo and Cmd+Y is not redo; Ctrl+Z and Ctrl+Y elsewhere.
const UNDO = isMac ? 'Meta+z' : 'Control+z'
const REDO = isMac ? 'Meta+Shift+z' : 'Control+y'

function put(path, text) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

test.describe('map XML undo', () => {
  let electronApp

  test.afterEach(async () => {
    await electronApp?.close().catch(() => {})
  })

  test('the undo and redo chords undo and redo an edit, across a save', async () => {
    const world = mkdtempSync(join(tmpdir(), 'taliesin-e2e-undo-'))
    const lib = join(world, 'xml')
    const file = join(lib, 'maps', 'Abel.xml')
    put(
      file,
      `<?xml version="1.0"?>\n<Map Id="1" X="20" Y="20" xmlns="${XMLNS}">\n  <Name>Abel</Name>\n</Map>\n`
    )
    ;({ electronApp } = await launchApp({
      seedSettings: {
        libraries: [lib],
        activeLibrary: lib,
        mapDirectories: [],
        activeMapDirectory: null,
        musicWorkingDirs: [],
        musEncodeKbps: 64,
        musEncodeSampleRate: 22050,
        theme: 'hybrasyl'
      }
    }))
    const page = await getMainWindow(electronApp)
    await page.getByTestId('nav-mapeditor').click()
    const maps = page.getByTestId('page-mapeditor')

    await expect(maps.getByText('lod1', { exact: true })).toBeVisible({ timeout: 15000 })
    await maps.getByText('Abel', { exact: true }).first().click()
    const name = maps.getByRole('textbox', { name: 'Name', exact: true })
    await expect(name).toHaveValue('Abel')
    const undo = maps.getByRole('button', { name: 'Undo', exact: true })
    await expect(undo).toBeDisabled()

    await name.fill('Abel Town')
    // A focused text field keeps Ctrl+Z for itself, so leave the field first.
    await name.evaluate((el) => el.blur())
    await expect(undo).toBeEnabled()

    await page.keyboard.press(UNDO)
    await expect(name).toHaveValue('Abel')
    await page.keyboard.press(REDO)
    await expect(name).toHaveValue('Abel Town')

    await maps.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(() => readFileSync(file, 'utf8')).toContain('<Name>Abel Town</Name>')

    // The save keeps the history.
    await page.keyboard.press(UNDO)
    await expect(name).toHaveValue('Abel')
    // A redo goes back to the saved map, which is clean. A dirty map would
    // hold the close in afterEach for the unsaved-changes prompt.
    await page.keyboard.press(REDO)
    await expect(name).toHaveValue('Abel Town')
  })
})
