import { useMapMakerStore, type MapTab } from '../store/mapMakerStore'
import { mapFilesDir } from './pickerDefaults'

// Saving a Map Maker tab, outside the page.
//
// The page unmounts on navigation while its tabs live on in the store, so a
// dirty tab can need saving when no page is there to do it — the window's
// close guard is that case. One implementation serves the page's Save, its
// close-tab prompt, and the app-close guard, so they cannot drift.

/**
 * Write one tab to disk. A tab that was never saved asks for a path first.
 * Returns false when there was nothing to save or the user cancelled the
 * dialog — the tab is then still dirty, and the caller must not treat it as
 * saved.
 */
export async function saveTab(tab: MapTab): Promise<boolean> {
  if (!tab.mapFile) return false
  let savePath = tab.filePath
  if (!savePath) {
    savePath = await window.api.saveFile(
      [{ name: 'DA Map Files', extensions: ['map'] }],
      mapFilesDir()
    )
    if (!savePath) return false
  }
  await window.api.writeBytes(savePath, tab.mapFile.toUint8Array())
  useMapMakerStore.getState().updateTab(tab.id, { filePath: savePath, dirty: false })
  return true
}

/** Whether any open tab holds unsaved edits. */
export function hasDirtyTabs(): boolean {
  return useMapMakerStore.getState().tabs.some((t) => t.dirty)
}

/**
 * Save every dirty tab in order. A cancelled dialog leaves that tab dirty and
 * moves on to the next, so `hasDirtyTabs` afterwards says whether it is safe
 * to close.
 */
export async function saveDirtyTabs(): Promise<void> {
  for (const tab of useMapMakerStore.getState().tabs) {
    if (tab.dirty) await saveTab(tab)
  }
}
