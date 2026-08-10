import { test, expect } from '@playwright/test'
import { mkdtempSync, existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { launchApp, getMainWindow } from './helpers.js'

// A filesystem-effecting IPC flow, end to end, against a temp directory.
//
// The handlers that WRITE are the ones pathSafety protects, and until now none
// of that was covered end to end: the unit suite calls the handler bodies with a
// hand-built context and an in-memory fs, so it tests the check but never the
// wiring -- whether the real app populates its allowed roots at all, and whether
// a renderer path survives the preload bridge unchanged. Both halves are
// asserted here, because a guard that is never reached and a guard that refuses
// everything look identical from a unit test.
//
// The pack flow is the one to use for this. `settings.packDir` becomes an
// allowed root at startup (applySettingsRoots), so seeding it is enough to drive
// creation with no OS dialog in the way -- the flow only touches a native dialog
// when CHANGING the directory, which is not what is under test.

// Chosen explicitly in the dialog rather than taken from its default, so
// registering a new pack kind ahead of this one in PACK_KINDS cannot quietly
// change what this test creates.
const KIND = { label: 'Item Icons', contentType: 'item_icons' }

function seedSettings(packDir) {
  // settingsManager.validate() requires both arrays; without them the file reads
  // as unreadable, load() falls back to defaults, and packDir would never become
  // a root -- the test would then fail for a reason that has nothing to do with
  // the flow.
  return { libraries: [], mapDirectories: [], activeLibrary: null, packDir }
}

test.describe('Pack creation writes to disk through the guarded handlers', () => {
  let electronApp

  test.afterEach(async () => {
    await electronApp?.close()
  })

  test('creating a pack writes the project file and its asset directory', async () => {
    const packDir = mkdtempSync(join(tmpdir(), 'taliesin-e2e-packs-'))
    ;({ electronApp } = await launchApp({ seedSettings: seedSettings(packDir) }))
    const page = await getMainWindow(electronApp)

    await page.getByTestId('nav-assetpacks').click()

    // The page renders an empty state instead of the manager when packDir is
    // unset, so seeing the New Pack button already proves the seeded directory
    // reached the renderer.
    await page.getByRole('button', { name: 'New Pack' }).click()
    await page.getByLabel('Pack ID').fill('e2e-icons')
    // MUI's Select is a listbox-backed combobox, not a labelled <select>, so it
    // answers to getByRole('combobox') and not to getByLabel.
    await page.getByRole('combobox', { name: 'Content Type' }).click()
    await page.getByRole('option', { name: KIND.label, exact: true }).click()
    await page.getByRole('button', { name: 'Create' }).click()

    // The dialog closes itself after handing the values over.
    await expect(page.getByRole('dialog', { name: 'Create Asset Pack' })).toHaveCount(0)

    // The list is re-scanned from disk after the write, so the row appearing is
    // the app reading back what it just wrote -- not local state. Scoped to the
    // list, because the pack id also appears in the editor pane that opens
    // beside it.
    await expect(page.getByRole('list').getByText('e2e-icons', { exact: true })).toBeVisible()

    // And the same thing checked from outside the app entirely.
    const projectFile = join(packDir, 'e2e-icons.json')
    expect(existsSync(projectFile)).toBe(true)
    const project = JSON.parse(readFileSync(projectFile, 'utf-8'))
    expect(project.pack_id).toBe('e2e-icons')
    expect(project.content_type).toBe(KIND.contentType)
    expect(project.assets).toEqual([])

    // Creation is two IPC calls, not one: pack:save writes the project and
    // fs:ensureDir makes the directory its assets will land in. Both go through
    // assertInsideAnyRoot, so checking only the first would leave half the flow
    // unobserved.
    expect(statSync(join(packDir, 'e2e-icons')).isDirectory()).toBe(true)
  })

  test('a write outside every allowed root is refused', async () => {
    const packDir = mkdtempSync(join(tmpdir(), 'taliesin-e2e-packs-'))
    ;({ electronApp } = await launchApp({ seedSettings: seedSettings(packDir) }))
    const page = await getMainWindow(electronApp)

    // The other half of the same guard, driven through the real preload bridge.
    // The target is the temp root itself: a PARENT of the allowed packDir, so it
    // is rejected by containment rather than by being somewhere exotic. That is
    // the case a `startsWith` check gets wrong.
    const outside = join(tmpdir(), 'taliesin-e2e-escaped.json')
    const message = await page.evaluate(
      (p) =>
        window.api
          .packSave(p, {
            pack_id: 'escaped',
            pack_version: '1.0.0',
            content_type: 'item_icons',
            priority: 100,
            covers: {},
            assets: []
          })
          .then(
            () => 'RESOLVED',
            (err) => String(err?.message ?? err)
          ),
      outside
    )

    expect(message, 'packSave outside the roots must reject').not.toBe('RESOLVED')
    expect(message).toMatch(/not inside any allowed root/)
    expect(existsSync(outside)).toBe(false)
  })
})
