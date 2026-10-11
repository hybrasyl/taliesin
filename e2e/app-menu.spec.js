import { test, expect } from '@playwright/test'
import { launchApp, getMainWindow } from './helpers.js'

// The macOS application menu, read from main and clicked there (HTOO-569). macOS
// only: on Windows and Linux the window is frameless and Taliesin installs no
// menu. src/main/__tests__/appMenu.test.ts covers the template on every OS; this
// checks what is installed, and the round trip through the renderer. Ported
// from creidhne.

test.skip(process.platform !== 'darwin', 'the application menu is macOS only')

const menuItem = (electronApp, id) =>
  electronApp.evaluate(({ Menu }, itemId) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(itemId)
    return item ? { label: item.label, enabled: item.enabled, checked: item.checked } : null
  }, id)

const clickItem = (electronApp, id) =>
  electronApp.evaluate(({ Menu }, itemId) => {
    Menu.getApplicationMenu().getMenuItemById(itemId).click()
  }, id)

test.describe('Application menu (macOS)', () => {
  let electronApp

  test.afterEach(async () => {
    await electronApp?.close().catch(() => {})
  })

  test('is the app menu, with no Reload', async () => {
    ;({ electronApp } = await launchApp())
    await getMainWindow(electronApp)

    const roles = await electronApp.evaluate(({ Menu }) => {
      const walk = (menu) =>
        menu.items.flatMap((i) => [i.role, ...(i.submenu ? walk(i.submenu) : [])])
      return walk(Menu.getApplicationMenu()).filter(Boolean)
    })
    expect(roles).not.toContain('reload')
    expect(roles).not.toContain('forcereload')
    expect(await menuItem(electronApp, 'about')).toMatchObject({ label: 'About Taliesin' })
    // Nothing is dirty at boot, so Save is greyed out.
    expect(await menuItem(electronApp, 'save')).toMatchObject({ enabled: false })
  })

  test('Go switches the page, and the menu marks it', async () => {
    ;({ electronApp } = await launchApp())
    await getMainWindow(electronApp)
    await expect.poll(async () => (await menuItem(electronApp, 'go:dashboard'))?.checked).toBe(true)

    await clickItem(electronApp, 'go:assetpacks')
    // The tick follows the renderer's report, so it proves the page changed.
    await expect
      .poll(async () => (await menuItem(electronApp, 'go:assetpacks'))?.checked)
      .toBe(true)
    expect((await menuItem(electronApp, 'go:dashboard')).checked).toBe(false)
  })

  test('does nothing over an open dialog', async () => {
    ;({ electronApp } = await launchApp())
    const page = await getMainWindow(electronApp)

    await clickItem(electronApp, 'reportIssue')
    await expect(page.getByRole('dialog')).toBeVisible()
    await clickItem(electronApp, 'go:assetpacks')
    await page.waitForTimeout(300)
    expect((await menuItem(electronApp, 'go:assetpacks')).checked).toBe(false)
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('About opens the About dialog from another page', async () => {
    ;({ electronApp } = await launchApp())
    const page = await getMainWindow(electronApp)
    await clickItem(electronApp, 'about')
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByTestId('settings-page')).toBeVisible()
  })

  test('Quit quits, through the unsaved-changes guard', async () => {
    // The guard cancels the first `close` to ask the renderer, but only after the
    // renderer has reported unsaved work, so the report comes first. A cancelled
    // close cancels app.quit(), and macOS keeps an app running when its last
    // window closes: without the fix, ⌘Q left Taliesin running with no window.
    ;({ electronApp } = await launchApp())
    const page = await getMainWindow(electronApp)
    await page.evaluate(() => window.api.setUnsaved(true))
    await page.waitForTimeout(200)
    const closed = electronApp.waitForEvent('close', { timeout: 15_000 })
    await electronApp.evaluate(({ app }) => {
      setTimeout(() => app.quit(), 0)
    })
    await closed
    electronApp = null
  })
})
