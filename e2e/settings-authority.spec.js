import { test, expect } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { launchApp, getMainWindow, USERDATA_SUBPATH } from './helpers.js'

// The authority boundary in the built app (HTOO-673, HTOO-674). The unit tests
// in src/main/__tests__/authority.test.ts drive the handlers; this spec checks
// the two things only a real launch shows:
//
//   1. The first start of this version migrates the folders in an existing
//      settings.json into grants.json, once, and they still work.
//   2. A settings path field cannot be typed into. It shows the path, and the
//      only ways to change it are Browse (a native dialog) and Clear.

function seed(overrides) {
  return { libraries: [], mapDirectories: [], activeLibrary: null, ...overrides }
}

test.describe('Settings authority', () => {
  let electronApp

  test.afterEach(async () => {
    await electronApp?.close()
  })

  test('the first start grants the folders settings.json names, and only once', async () => {
    const packDir = mkdtempSync(join(tmpdir(), 'taliesin-e2e-grant-'))
    writeFileSync(join(packDir, 'probe.txt'), 'PROBE')
    let localAppData
    ;({ electronApp, localAppData } = await launchApp({ seedSettings: seed({ packDir }) }))
    let page = await getMainWindow(electronApp)

    const grantsFile = join(localAppData, ...USERDATA_SUBPATH, 'grants.json')
    await expect.poll(() => existsSync(grantsFile)).toBe(true)
    expect(JSON.parse(readFileSync(grantsFile, 'utf-8')).dirs).toEqual([packDir])
    const read = (p) => page.evaluate((path) => window.api.readFile(path).then(() => 'ok'), p)
    expect(await read(join(packDir, 'probe.txt'))).toBe('ok')
    await electronApp.close()

    // settings.json now names a second folder. The migration does not run again.
    const other = mkdtempSync(join(tmpdir(), 'taliesin-e2e-nogrant-'))
    writeFileSync(join(other, 'secret.txt'), 'SECRET')
    const settingsFile = join(localAppData, ...USERDATA_SUBPATH, 'settings.json')
    const s = JSON.parse(readFileSync(settingsFile, 'utf-8'))
    writeFileSync(settingsFile, JSON.stringify({ ...s, musicLibraryPath: other }, null, 2))
    ;({ electronApp } = await launchApp({ localAppData }))
    page = await getMainWindow(electronApp)
    await expect(
      page.evaluate((p) => window.api.readFile(p).then(() => 'ok'), join(other, 'secret.txt'))
    ).rejects.toThrow(/not inside any allowed root/)
    expect(await read(join(packDir, 'probe.txt'))).toBe('ok')
  })

  test('a settings path field cannot be typed into', async () => {
    const packDir = mkdtempSync(join(tmpdir(), 'taliesin-e2e-grant-'))
    ;({ electronApp } = await launchApp({ seedSettings: seed({ packDir }) }))
    const page = await getMainWindow(electronApp)
    await page.getByTestId('nav-settings').click()
    await expect(page.getByTestId('settings-page')).toBeVisible()

    const fields = page.getByTestId('path-input')
    const count = await fields.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      await expect(fields.nth(i)).toHaveAttribute('readonly', '')
    }
    // The pack folder field shows the seeded path, and typing does not change it.
    const values = await fields.evaluateAll((els) => els.map((e) => e.value))
    const index = values.indexOf(packDir)
    expect(index).toBeGreaterThanOrEqual(0)
    await fields.nth(index).click()
    await page.keyboard.type('C:\\elsewhere')
    await expect(fields.nth(index)).toHaveValue(packDir)
  })
})
