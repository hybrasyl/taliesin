import { existsSync } from 'fs'
import { basename, dirname, isAbsolute, join } from 'path'

// Where a file or folder picker opens (HTOO-553). Since Electron 43 a dialog with
// no `defaultPath` opens in Downloads, not in the last folder used, so every
// picker gets one. Candidates are in order of preference; the first that exists
// wins. A stale setting (a folder since moved) is skipped rather than handed to
// the dialog, which would fall back to Downloads again. Ported from creidhne's
// src/main/pickerStart.js.

type Exists = (p: string) => boolean

/** The first candidate that is a non-empty string and exists on disk. */
export function pickerStartPath(
  candidates: readonly (string | null | undefined)[],
  exists: Exists = existsSync
): string | undefined {
  for (const p of candidates) {
    if (typeof p === 'string' && p !== '' && exists(p)) return p
  }
  return undefined
}

/** The folder to remember from a pick: the folder itself, or a file's parent. */
export function pickedFolder(path: string, isDirectory: boolean): string {
  return isDirectory ? path : dirname(path)
}

/**
 * The `defaultPath` for one dialog, from what the renderer asked for and the
 * start folder.
 *
 * - An absolute path whose target or parent exists is used as it is.
 * - A bare name ("map.png") is put in the start folder. A save dialog needs
 *   this: without a folder, Electron 43+ puts the name in Downloads.
 * - A stale absolute path falls back to the start folder. A save dialog keeps
 *   its file name (`keepName`); an open dialog does not, because the name of a
 *   moved folder is not a file name.
 */
export function dialogDefaultPath(
  given: string | null | undefined,
  start: string | undefined,
  { keepName = false, exists = existsSync }: { keepName?: boolean; exists?: Exists } = {}
): string | undefined {
  if (!given) return start
  if (isAbsolute(given)) {
    if (exists(given) || exists(dirname(given))) return given
    if (!start) return given
    return keepName ? join(start, basename(given)) : start
  }
  return start ? join(start, given) : given
}
