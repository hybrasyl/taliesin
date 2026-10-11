import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { MenuItemConstructorOptions } from 'electron'
import { buildMenuTemplate, GO_PAGES, INITIAL_MENU_STATE, MENU_COMMAND_CHANNEL } from '../appMenu'
import { menuStateSchema, type MenuState } from '../schemas/menu'

// The macOS application menu (HTOO-569). buildMenuTemplate is pure, so the whole
// menu is asserted here on any OS; e2e/app-menu.spec.js checks the installed menu
// on a Mac. Ported from creidhne.

type Item = MenuItemConstructorOptions

const build = (
  state: MenuState = INITIAL_MENU_STATE,
  opts: { isDev?: boolean; send?: (msg: { command: string }) => void } = {}
): Item[] => buildMenuTemplate(state, { appName: 'Taliesin', isDev: false, send: vi.fn(), ...opts })

/** Every item at every depth. */
function flatten(items: Item[]): Item[] {
  return items.flatMap((i) => [
    i,
    ...(Array.isArray(i.submenu) ? flatten(i.submenu as Item[]) : [])
  ])
}

const byId = (template: Item[], id: string): Item => {
  const found = flatten(template).find((i) => i.id === id)
  if (!found) throw new Error(`no menu item ${id}`)
  return found
}
const submenu = (template: Item[], label: string): Item[] =>
  template.find((m) => m.label === label)!.submenu as Item[]

/** The Go menu's page ids, separators dropped. */
const goPageIds = GO_PAGES.flatMap((p) => (p ? [p.page] : []))

describe('buildMenuTemplate', () => {
  // Edit is part of the shape: without it ⌘C, ⌘V and ⌘A stop working in text fields.
  it('has the house shape: app, File, Edit, View, Go, Window, Help', () => {
    expect(build().map((m) => m.label ?? m.role)).toEqual([
      'Taliesin',
      'File',
      'editMenu',
      'View',
      'Go',
      'windowMenu',
      'help'
    ])
  })

  it('has no reload, forceReload or zoom role anywhere, in any build', () => {
    // Reload drops every unsaved edit in the renderer. The zoom keys are blocked by
    // optimizer.watchWindowShortcuts, so a zoom item would show a key that does nothing.
    const banned = ['reload', 'forceReload', 'zoomIn', 'zoomOut', 'resetZoom']
    for (const isDev of [false, true]) {
      const roles = flatten(build(INITIAL_MENU_STATE, { isDev }))
        .map((i) => i.role)
        .filter(Boolean)
      expect(roles.length).toBeGreaterThan(5) // guard the guard: roles were found
      for (const role of banned) expect(roles).not.toContain(role)
    }
  })

  it('shows Toggle Developer Tools in a dev build only', () => {
    const roles = (isDev: boolean): unknown[] =>
      flatten(build(INITIAL_MENU_STATE, { isDev })).map((i) => i.role)
    expect(roles(false)).not.toContain('toggleDevTools')
    expect(roles(true)).toContain('toggleDevTools')
  })

  it('names the app in the role labels', () => {
    const app = build()[0].submenu as Item[]
    expect(app.find((i) => i.role === 'quit')!.label).toBe('Quit Taliesin')
    expect(app.find((i) => i.role === 'hide')!.label).toBe('Hide Taliesin')
    expect(byId(build(), 'about').label).toBe('About Taliesin')
    expect(byId(build(), 'settings').accelerator).toBe('Cmd+,')
  })

  it('greys out Save and Launch Creidhne until the renderer reports them', () => {
    const initial = build()
    expect(byId(initial, 'save').enabled).toBe(false)
    expect(byId(initial, 'save').accelerator).toBe('Cmd+S')
    expect(byId(initial, 'launchCompanion').enabled).toBe(false)

    const live = build({ ...INITIAL_MENU_STATE, canSave: true, canLaunchCompanion: true })
    expect(byId(live, 'save').enabled).toBe(true)
    expect(byId(live, 'launchCompanion').enabled).toBe(true)
  })

  it('lists every Go page in order, ⌘1 to ⌘9 on the first nine, and marks the current one', () => {
    const go = submenu(build({ ...INITIAL_MENU_STATE, page: 'mapmaker' }), 'Go').filter(
      (i) => i.type !== 'separator'
    )
    expect(go.map((i) => i.id)).toEqual(goPageIds.map((p) => `go:${p}`))
    expect(go.slice(0, 9).map((i) => i.accelerator)).toEqual(
      Array.from({ length: 9 }, (_, i) => `Cmd+${i + 1}`)
    )
    expect(go.slice(9).every((i) => i.accelerator === undefined)).toBe(true)
    expect(go.filter((i) => i.checked).map((i) => i.id)).toEqual(['go:mapmaker'])
  })

  it('sends the item id as the command when an item is clicked', () => {
    const send = vi.fn()
    const t = build(INITIAL_MENU_STATE, { send })
    ;(byId(t, 'go:uiforge').click as () => void)()
    ;(byId(t, 'whatsNew').click as () => void)()
    expect(send.mock.calls).toEqual([[{ command: 'go:uiforge' }], [{ command: 'whatsNew' }]])
  })

  it('gives every app item an id equal to the command it sends, so e2e can find it', () => {
    const send = vi.fn()
    const appItems = flatten(build(INITIAL_MENU_STATE, { send })).filter(
      (i) => typeof i.click === 'function'
    )
    expect(appItems.length).toBeGreaterThan(15)
    for (const i of appItems) (i.click as () => void)()
    expect(send.mock.calls.map(([msg]) => msg.command)).toEqual(appItems.map((i) => i.id))
  })
})

describe('menuStateSchema', () => {
  it('accepts the initial state and a live one', () => {
    expect(menuStateSchema.safeParse(INITIAL_MENU_STATE).success).toBe(true)
    const live = { page: 'uiforge', canSave: true, canLaunchCompanion: true }
    expect(menuStateSchema.parse(live)).toEqual(live)
  })

  it.each([
    ['null', null],
    ['a missing field', { page: 'archive', canSave: true }],
    ['a string for a boolean', { ...INITIAL_MENU_STATE, canSave: 'yes' }],
    ['a page that is not a string', { ...INITIAL_MENU_STATE, page: 7 }],
    ['an over-long page', { ...INITIAL_MENU_STATE, page: 'x'.repeat(65) }]
  ])('rejects %s', (_label, value) => {
    expect(menuStateSchema.safeParse(value).success).toBe(false)
  })
})

// The lists and names that cross a process boundary. Each side spells them on
// its own (the preload may import only `electron`, and the renderer's tsconfig
// cannot see main), so a rename on one side would fail silently: a menu item
// that does nothing, or a page the menu cannot reach.
describe('the contract with the preload and the renderer', () => {
  const read = (rel: string): string => readFileSync(join(__dirname, '..', '..', rel), 'utf8')

  it('the preload uses the same channel names as main', () => {
    const preload = read('preload/index.ts')
    expect(preload).toContain(`ipcRenderer.on('${MENU_COMMAND_CHANNEL}'`)
    expect(preload).toContain(`ipcRenderer.send('app:setMenuState'`)
    expect(read('main/handlers.ts')).toContain(`ipcMain.on('app:setMenuState'`)
  })

  it("lists exactly the nav bar's pages, in its order, except Settings", () => {
    const nav = read('renderer/src/components/NavToolbar.tsx')
    const navPages = [...nav.matchAll(/<NavButton page="(\w+)"/g)].map((m) => m[1])
    expect(navPages.length).toBeGreaterThan(10) // guard the guard
    expect(goPageIds).toEqual(navPages.filter((p) => p !== 'settings'))
  })

  it('covers every page the renderer knows, and nothing else', () => {
    const store = read('renderer/src/store/uiStore.ts')
    const block = store.slice(store.indexOf('export const PAGES = ['), store.indexOf('] as const'))
    const pages = [...block.matchAll(/'(\w+)'/g)].map((m) => m[1])
    expect(pages.length).toBeGreaterThan(10) // guard the guard
    expect([...goPageIds, 'settings'].sort()).toEqual([...pages].sort())
  })
})
