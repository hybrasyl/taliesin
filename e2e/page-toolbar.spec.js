import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { launchApp, getMainWindow } from './helpers.js'

// The page toolbar fits the window at its minimum size, and the map canvas keeps
// a usable width beside the list and its side panel (HTOO-633, ported from
// Creidhne's HTOO-628 spec). The fault is a computed layout, so this measures it.

const XMLNS = 'http://www.hybrasyl.com/XML/Hybrasyl/2020-02'

/** The narrowest the map canvas may be at the minimum window. */
const MIN_CANVAS_WIDTH = 400

test.describe('page toolbar', () => {
  let electronApp

  test.afterEach(async () => {
    await electronApp?.close().catch(() => {})
  })

  test('every control is inside the toolbar, and the map canvas keeps its width, at the minimum window size', async () => {
    const lib = join(mkdtempSync(join(tmpdir(), 'taliesin-e2e-world-')), 'xml')
    mkdirSync(join(lib, 'maps'), { recursive: true })
    mkdirSync(join(lib, 'worldmaps'), { recursive: true })
    writeFileSync(
      join(lib, 'maps', 'Abel.xml'),
      `<?xml version="1.0"?>\n<Map Id="1" X="20" Y="20" xmlns="${XMLNS}">\n  <Name>Abel</Name>\n</Map>\n`
    )
    writeFileSync(
      join(lib, 'worldmaps', 'Temuair.xml'),
      `<?xml version="1.0"?>\n<WorldMap ClientMap="field001" xmlns="${XMLNS}">\n  <Name>Temuair</Name>\n</WorldMap>\n`
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
    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => w.isVisible())
      const [w, h] = win.getMinimumSize()
      win.setSize(w, h)
    })
    await expect
      .poll(() => page.evaluate(() => window.innerWidth), { timeout: 5000 })
      .toBeLessThanOrEqual(1024)

    for (const [nav, label, open, wants] of [
      [
        'mapeditor',
        'Maps',
        'Abel',
        ['New Map', 'Archived (0)', 'Active (1)', 'Archive', 'Stage', 'Duplicate', 'Delete']
      ],
      [
        'worldmap',
        'World Maps',
        'Temuair',
        ['New World Map', 'Templates (0)', 'Active (1)', 'Move to Templates', 'Delete']
      ]
    ]) {
      await page.getByTestId(`nav-${nav}`).click()
      const toolbar = page.getByRole('toolbar', { name: `${label} toolbar` })
      await expect(toolbar).toBeVisible()
      // With a file open, so the item actions are in their enabled widths.
      await page.getByTestId(`page-${nav}`).getByText(open, { exact: true }).first().click()
      await expect(
        page.getByTestId(`page-${nav}`).getByRole('textbox', { name: 'Filename' })
      ).toBeVisible()

      const measured = await toolbar.evaluate((el) => {
        const right = el.getBoundingClientRect().right
        const controls = [...el.querySelectorAll('button')]
        return {
          count: controls.length,
          names: controls.map((b) => b.getAttribute('aria-label')),
          outside: controls
            .filter((b) => b.getBoundingClientRect().right > right + 0.5)
            .map((b) => b.getAttribute('aria-label'))
        }
      })
      expect(measured.outside, label).toEqual([])
      // Guards the guard: the measure found the controls it is about.
      expect(measured.count, label).toBeGreaterThanOrEqual(5)
      for (const want of wants) {
        expect(measured.names, `${label}: ${want}`).toContain(want)
      }

      if (nav === 'mapeditor') {
        const canvas = page.getByTestId('map-render-canvas')
        await expect(canvas).toBeVisible()
        const width = await canvas.evaluate((el) => el.getBoundingClientRect().width)
        expect(width, 'map canvas width at the minimum window').toBeGreaterThanOrEqual(
          MIN_CANVAS_WIDTH
        )
      }
    }
  })
})
