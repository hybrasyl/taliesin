import { test, expect } from '@playwright/test'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { launchApp, getMainWindow } from './helpers.js'

// Settings → World indexes (HTOO-583), through the built app and the disk.
// launchApp points HYBINDEX_CACHE_DIR at <localAppData>/Erisco/hybindex, and
// with that variable set hybindex-ts scans no other base, so this never sees
// the real cache. Ported from creidhne's spec of the same name. Taliesin does
// not build an index at launch, so this seeds the current cache too:
//
//   v4/world-old/      a world that exists, built by an older version  → removed
//   v5/moved-world/    a world folder that no longer exists            → removed
//   v5/world-live/     a world that exists, at the current version     → stays

function seedCache(base, version, key, libraryPath) {
  const dir = join(base, version, key)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '_meta.json'), JSON.stringify({ libraryPath, builtAt: '2026-01-01' }))
  writeFileSync(join(dir, 'index.json'), '{}')
  return dir
}

test.describe('World indexes', () => {
  let electronApp

  test.afterEach(async () => {
    await electronApp?.close()
  })

  test('finds the old index caches and removes only those', async () => {
    const world = mkdtempSync(join(tmpdir(), 'taliesin-e2e-world-'))
    const lib = join(world, 'xml')
    mkdirSync(lib, { recursive: true })

    const localAppData = mkdtempSync(join(tmpdir(), 'taliesin-e2e-'))
    const base = join(localAppData, 'Erisco', 'hybindex')
    const oldSchema = seedCache(base, 'v4', 'world-old', lib)
    const moved = seedCache(base, 'v5', 'moved-world', join(world, 'gone', 'xml'))
    const live = seedCache(base, 'v5', 'world-live', lib)

    ;({ electronApp } = await launchApp({ localAppData }))
    const page = await getMainWindow(electronApp)
    await page.getByTestId('nav-settings').click()

    const section = page.getByTestId('index-cache-section')
    await section.getByRole('button', { name: 'Find old indexes' }).click()
    const list = section.getByTestId('old-index-list')
    await expect(list.getByRole('listitem')).toHaveCount(2)
    await expect(list).toContainText('An older index version')
    await expect(list).toContainText('The world folder is gone')
    // Find removes nothing.
    expect(existsSync(oldSchema)).toBe(true)
    expect(existsSync(moved)).toBe(true)

    await section.getByRole('button', { name: /^Remove 2 / }).click()
    await expect(section.getByText(/^Removed 2 old indexes/)).toBeVisible()
    expect(existsSync(oldSchema)).toBe(false)
    // The v4 folder is empty after the removal, so it goes too.
    expect(existsSync(join(base, 'v4'))).toBe(false)
    expect(existsSync(moved)).toBe(false)
    expect(existsSync(live)).toBe(true)

    // A second look finds nothing.
    await section.getByRole('button', { name: 'Find old indexes' }).click()
    await expect(section.getByText('No old indexes.')).toBeVisible()
  })
})
