import { test, expect } from '@playwright/test'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { launchApp, getMainWindow } from './helpers.js'

// Stage and Release move a map XML between `xml/maps/` and `.staging/maps/` on
// disk (HTOO-634). Stage first lists the live maps that warp to it. A rename
// then repairs the warp in a staged map too (HTOO-635).

const XMLNS = 'http://www.hybrasyl.com/XML/Hybrasyl/2020-02'

function mapXml(id, name, targets = []) {
  const warps = targets
    .map((t) => `    <Warp X="1" Y="1"><MapTarget X="2" Y="2">${t}</MapTarget></Warp>`)
    .join('\n')
  return `<?xml version="1.0"?>\n<Map Id="${id}" X="20" Y="20" xmlns="${XMLNS}">\n  <Name>${name}</Name>\n  <Warps>\n${warps}\n  </Warps>\n</Map>\n`
}

function put(path, text) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

test.describe('map staging', () => {
  let electronApp

  test.afterEach(async () => {
    await electronApp?.close().catch(() => {})
  })

  test('stages a map, repairs a staged warp on rename, and releases the map', async () => {
    const world = mkdtempSync(join(tmpdir(), 'taliesin-e2e-staging-'))
    const lib = join(world, 'xml')
    const live = (rel) => join(lib, 'maps', rel)
    const staged = (rel) => join(world, '.staging', 'maps', rel)
    put(live('Abel.xml'), mapXml(1, 'Abel'))
    put(live('Inn.xml'), mapXml(2, 'Abel Inn', ['Abel']))
    put(staged('Docks.xml'), mapXml(3, 'Abel Docks', ['Abel']))
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
    const toolbar = page.getByRole('toolbar', { name: 'Maps toolbar' })

    // The row's Id line comes from the world index, which Stage reads the name from.
    await expect(maps.getByText('lod1', { exact: true })).toBeVisible({ timeout: 15000 })
    await maps.getByText('Abel', { exact: true }).first().click()
    await expect(maps.getByRole('textbox', { name: 'Filename' })).toBeVisible()

    // Stage: the live Inn warps to Abel, so the dialog lists it. The staged
    // Docks does too, and is not listed.
    await toolbar.getByRole('button', { name: 'Stage', exact: true }).click()
    const ask = page.getByRole('dialog')
    await expect(ask.getByText('maps/Inn.xml')).toBeVisible()
    await expect(ask.getByText(/Docks/)).toHaveCount(0)
    await ask.getByRole('button', { name: 'Stage', exact: true }).click()

    await expect.poll(() => existsSync(staged('Abel.xml'))).toBe(true)
    expect(existsSync(live('Abel.xml'))).toBe(false)
    await expect(toolbar.getByRole('button', { name: 'Release', exact: true })).toBeEnabled()
    await expect(toolbar.getByRole('button', { name: 'Staged (2)' })).toBeVisible()

    // Rename the staged map: the scan finds the live Inn and the staged Docks,
    // and the dialog marks Docks as staged.
    const name = maps.getByRole('textbox', { name: 'Name', exact: true })
    await name.fill('Abel Town')
    await maps.getByRole('button', { name: 'Save', exact: true }).click()
    const rename = page.getByRole('dialog')
    await expect(rename.getByText('Docks.xml')).toBeVisible()
    await expect(rename.getByText('1 warp · staged')).toBeVisible()
    await rename.getByRole('button', { name: /^Update/ }).click()
    await expect
      .poll(() => readFileSync(staged('Docks.xml'), 'utf8'))
      .toContain('>Abel Town</MapTarget>')
    expect(readFileSync(live('Inn.xml'), 'utf8')).toContain('>Abel Town</MapTarget>')
    expect(readFileSync(staged('Abel.xml'), 'utf8')).toContain('<Name>Abel Town</Name>')

    // Release: Abel Town warps nowhere staged, so it moves at once.
    await toolbar.getByRole('button', { name: 'Release', exact: true }).click()
    await expect.poll(() => existsSync(live('Abel.xml'))).toBe(true)
    expect(existsSync(staged('Abel.xml'))).toBe(false)
    expect(existsSync(staged('Docks.xml'))).toBe(true)
    await expect(toolbar.getByRole('button', { name: 'Stage', exact: true })).toBeEnabled()
  })
})
