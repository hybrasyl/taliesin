import type { MenuItemConstructorOptions } from 'electron'
import type { MenuState } from './schemas/menu'

/**
 * The macOS application menu (HTOO-569), in place of Electron's default one. The
 * default View menu has Reload and Force Reload, which drop every unsaved edit in
 * the renderer, and Toggle Developer Tools. macOS only: Windows and Linux are
 * frameless with the renderer's own buttons, and a menu there would register its
 * accelerators too.
 *
 * Pure: the template comes from the renderer's last `MenuState`. A Taliesin item
 * calls `send`, and the renderer runs the same action as the matching button.
 * Standard items are Electron roles. Chromium gives a key to the page first, and
 * to the menu only when the page does not `preventDefault` it, so a page's own
 * ⌘S or ⌘W still wins.
 *
 * The house design is docs/architecture/macos-chrome.md in the document repo.
 * Mabon is the reference implementation; this is ported from creidhne's.
 */

/** Main → renderer: a Taliesin menu item was chosen. The preload spells it as a literal. */
export const MENU_COMMAND_CHANNEL = 'menu:command'

/**
 * The pages the Go menu lists, in the nav toolbar's order. `null` is a separator,
 * where the toolbar has a divider. ⌘1 to ⌘9 go to the first nine pages. Settings
 * is not here: it is in the app menu (⌘,), where macOS puts it.
 * appMenu.test.ts compares this list with the toolbar's `nav(...)` calls, so a
 * page that is in one and not the other fails the suite.
 */
export const GO_PAGES: readonly ({ page: string; label: string } | null)[] = [
  { page: 'dashboard', label: 'Dashboard' },
  null,
  { page: 'catalog', label: 'Map Catalog' },
  { page: 'mapeditor', label: 'Map XML Editor' },
  { page: 'worldmap', label: 'World Map Editor' },
  null,
  { page: 'archive', label: 'Archive Browser' },
  { page: 'mapmaker', label: 'Map Maker' },
  { page: 'prefabs', label: 'Prefab Catalog' },
  { page: 'assetpacks', label: 'Asset Pack Manager' },
  { page: 'statictiles', label: 'Static Tile Manager' },
  { page: 'uiforge', label: 'UI Layout Forge' },
  { page: 'palettes', label: 'Palettes & Duotone' },
  { page: 'music', label: 'Music Manager' },
  { page: 'sfx', label: 'Sound Effects' }
]

export const INITIAL_MENU_STATE: MenuState = {
  page: 'dashboard',
  canSave: false,
  canLaunchCompanion: false
}

export interface MenuOptions {
  appName: string
  isDev: boolean
  send: (msg: { command: string }) => void
}

export function buildMenuTemplate(
  state: MenuState,
  { appName, isDev, send }: MenuOptions
): MenuItemConstructorOptions[] {
  const item = (
    label: string,
    command: string,
    extra: MenuItemConstructorOptions = {}
  ): MenuItemConstructorOptions => ({
    label,
    id: command,
    click: () => send({ command }),
    ...extra
  })
  const sep: MenuItemConstructorOptions = { type: 'separator' }

  let shortcut = 0
  const goItems = GO_PAGES.map((entry): MenuItemConstructorOptions => {
    if (!entry) return sep
    shortcut += 1
    return item(entry.label, `go:${entry.page}`, {
      type: 'checkbox',
      checked: state.page === entry.page,
      ...(shortcut <= 9 ? { accelerator: `Cmd+${shortcut}` } : {})
    })
  })

  return [
    {
      // The role labels are set by hand, so they read the product name even
      // where Electron's `app.name` would not.
      label: appName,
      submenu: [
        item(`About ${appName}`, 'about'),
        // Goes to the Check for updates button on the Settings About card.
        item('Check for Updates…', 'checkForUpdates'),
        sep,
        item('Settings…', 'settings', { accelerator: 'Cmd+,' }),
        sep,
        { role: 'services' },
        sep,
        { role: 'hide', label: `Hide ${appName}` },
        { role: 'hideOthers' },
        { role: 'unhide' },
        sep,
        { role: 'quit', label: `Quit ${appName}` }
      ]
    },
    {
      label: 'File',
      submenu: [
        item('Save', 'save', { accelerator: 'Cmd+S', enabled: state.canSave }),
        sep,
        item('Launch Creidhne', 'launchCompanion', { enabled: state.canLaunchCompanion }),
        sep,
        // ⌘W is the window's. The Map Maker binds its own ⌘W to close a tab, and
        // the page gets the key first. The window's close keeps the
        // unsaved-changes guard: its `close` event asks the renderer.
        { role: 'close' }
      ]
    },
    // Keep it: without an Edit menu, ⌘C, ⌘V and ⌘A stop working in text fields.
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        // No zoom items: `optimizer.watchWindowShortcuts` blocks the zoom keys in
        // every build, which stops a menu accelerator too.
        { role: 'togglefullscreen' },
        ...(isDev ? [sep, { role: 'toggleDevTools' } as MenuItemConstructorOptions] : [])
      ]
    },
    { label: 'Go', submenu: goItems },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [item('Report an Issue…', 'reportIssue'), item("What's New", 'whatsNew')]
    }
  ]
}
