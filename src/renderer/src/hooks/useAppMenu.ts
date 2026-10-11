import { useEffect } from 'react'
import { useUiStore, isPage } from '../store/uiStore'
import { useMenuStore } from '../store/menuStore'
import { useCompanionStatus } from './useCompanionStatus'
import { isMac } from '../utils/platform'

/**
 * The renderer half of the macOS application menu (HTOO-569): run a menu
 * command, and report what the menu greys out and marks. Each command runs the
 * same action as its button. See src/main/appMenu.ts for the menu itself.
 * Ported from creidhne.
 *
 * Navigation goes through `setCurrentPage`, the same guarded setter as the nav
 * bar, so a Go command over a dirty editor asks about the unsaved edits first.
 */
export interface MenuActions {
  launchCompanion: () => Promise<void>
}

export function runMenuCommand(
  msg: { command?: unknown } | null | undefined,
  actions: MenuActions
): void {
  // Nothing while a modal is open. A page change would unmount the page under a
  // dialog that belongs to it, and lose what was typed there. A Mac app disables
  // its menu behind a sheet the same way. The standard roles (Copy, Paste, Quit)
  // are main's and still work.
  if (isModalOpen()) return
  const command = msg?.command
  if (typeof command !== 'string') return
  const ui = useUiStore.getState()

  if (command.startsWith('go:')) {
    const page = command.slice(3)
    if (isPage(page)) ui.setCurrentPage(page)
    return
  }
  switch (command) {
    case 'settings':
      ui.setCurrentPage('settings')
      return
    case 'about':
    case 'whatsNew':
      // Both dialogs belong to Settings, which takes the request when it mounts.
      useMenuStore.getState().request(command)
      ui.setCurrentPage('settings')
      return
    case 'save':
      // The same save the unsaved-changes dialog runs. A failed save shows its own
      // error in the editor, so there is nothing to add here.
      void Promise.resolve(ui.dirtyEditor?.onSave()).catch(() => {})
      return
    case 'launchCompanion':
      void actions.launchCompanion()
      return
    case 'reportIssue':
      ui.setReportIssueOpen(true)
      return
  }
}

/**
 * An open MUI `Modal`: a dialog, a menu or a popover. A closed one is unmounted,
 * or carries `MuiModal-hidden` when it is kept mounted.
 */
export function isModalOpen(doc: Document = document): boolean {
  return doc.querySelector('.MuiModal-root:not(.MuiModal-hidden)') !== null
}

/** What the menu greys out and marks, from the store. */
export function currentMenuState({ companionFound }: { companionFound: boolean }): MenuState {
  const s = useUiStore.getState()
  return {
    page: s.currentPage,
    canSave: !!s.dirtyEditor,
    canLaunchCompanion: companionFound
  }
}

/**
 * Wire the menu once settings have hydrated: run its commands, and report its
 * state when it changes (sent only when it differs). macOS only. Elsewhere there
 * is no menu to drive, and the companion is not asked about a second time.
 */
export function useAppMenu(enabled: boolean): void {
  const active = enabled && isMac()
  const { found: companionFound, refresh: refreshCompanion } = useCompanionStatus({
    enabled: active
  })

  // The command listener. `refreshCompanion` is stable, so this runs once.
  useEffect(() => {
    if (!active) return
    const actions: MenuActions = {
      launchCompanion: async () => {
        await window.api.launchCompanion()
        // A launch is the moment a target can turn out to have gone missing.
        refreshCompanion()
      }
    }
    return window.api.menu.onCommand((msg) => runMenuCommand(msg, actions))
  }, [active, refreshCompanion])

  // The state report: on every store change, and when the companion answer
  // changes. Main drops a report that changes nothing.
  useEffect(() => {
    if (!active) return
    const report = (): void => window.api.menu.setState(currentMenuState({ companionFound }))
    report()
    return useUiStore.subscribe(report)
  }, [active, companionFound])
}
