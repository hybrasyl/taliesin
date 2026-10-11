import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { launchApp, getMainWindow, repoRoot } from './helpers.js'

// Every nav page renders in the built app (HTOO-393).
//
// The unit and jsdom suites run in Node, where Node's globals exist. A component
// that reads one passes all of them, and throws the first time a person opens
// its page in the sandboxed renderer. Balor shipped exactly that: every gate was
// green, and the tab went to the error boundary on its first click. Each other
// spec drives the page its own work added, so nothing else opens every page.
//
// For each page this spec clicks `nav-<page>` and asserts three things: the
// `page-<page>` marker from PageRenderer is there, the error boundary's fallback
// is not, and no page error was thrown. A failure names the page.
//
// The list is read from PAGES in uiStore.ts, so a new page is covered with no
// edit here. A page with no nav button fails on its click.
//
// The profile is empty, so most pages render their "nothing set" state. A fault
// at a component's top or in its hooks runs on that path and fails here. A
// fault in code that runs only with a client path or a library loaded does not:
// see "What automation cannot reach" in e2e/README.md.
//
// src/renderer/src/__tests__/rendererNodeGlobals.test.ts is the source half.

function readPages() {
  const source = readFileSync(join(repoRoot, 'src/renderer/src/store/uiStore.ts'), 'utf8')
  const block = /export const PAGES = \[([\s\S]*?)\] as const/.exec(source)
  if (!block) throw new Error('src/renderer/src/store/uiStore.ts has no `PAGES` list')
  return [...block[1].matchAll(/'(\w+)'/g)].map((m) => m[1])
}

const PAGES = readPages()

test.describe('Nav pages', () => {
  let electronApp

  test.afterEach(async () => {
    await electronApp?.close().catch(() => {})
  })

  test('every page renders without reaching the error boundary', async () => {
    // A parse that found nothing would pass for the wrong reason.
    expect(PAGES.length, 'pages read from uiStore.ts').toBeGreaterThan(10)
    ;({ electronApp } = await launchApp())
    const win = await getMainWindow(electronApp)
    const errors = []
    win.on('pageerror', (error) => errors.push(error.message))

    for (const page of PAGES) {
      await test.step(page, async () => {
        await win.getByTestId(`nav-${page}`).click({ timeout: 5_000 })
        await expect(win.getByTestId(`page-${page}`), `${page}: page marker`).toBeAttached()
        await expect(
          win.getByTestId('error-boundary-fallback'),
          `${page}: error boundary`
        ).toHaveCount(0)
        expect(errors, `${page}: page error`).toEqual([])
      })
    }
  })
})
