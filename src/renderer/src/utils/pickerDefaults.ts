/**
 * Where a file picker opens (HTOO-415).
 *
 * Electron's three dialog handlers all accept a `defaultPath`, but only one
 * call site in the renderer ever sent one — and it sent a bare filename. So
 * every picker opened wherever the OS last left the user, and picking a `.map`
 * file moved the start point for the next `.datf` import.
 *
 * The directories these return are already in settings. Nothing new is stored.
 *
 * These read the store with `getState()` rather than the hook because a picker
 * default is read inside an event handler, never during render. Subscribing
 * would re-render the component every time an unrelated setting changed, to
 * compute a value that is only wanted at the moment of the click.
 *
 * `undefined` means "let the OS decide", and it is what every function here
 * returns when the setting behind it is unset. The main handlers omit the key
 * when it is absent, so a user who has configured nothing keeps the old
 * behaviour.
 *
 * A `defaultPath` grants no access. Main blesses the root of the file the user
 * actually picks, and only then — see `blessRoot` in `handlers.ts`.
 */
import { useSettingsStore, deriveMapFilesDirectory } from '../store/settingsStore'

/** The directory part of a file path, or `undefined` if there is not one. */
export function dirOf(filePath: string | null | undefined): string | undefined {
  if (!filePath) return undefined
  const cut = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return cut > 0 ? filePath.slice(0, cut) : undefined
}

/**
 * A suggested save path: `filename` inside `dir`.
 *
 * With no directory this returns the bare filename, which is still worth
 * sending — a save dialog pre-fills the name from it.
 */
export function fileIn(dir: string | null | undefined, filename: string): string {
  if (!dir) return filename
  return `${dir.replace(/[\\/]+$/, '')}/${filename}`
}

/**
 * The binary `.map` directory of the world being worked in.
 *
 * The active map source is the directory the user browses, so it wins. A user
 * who has set a library but no map source falls back to that library's sibling
 * `mapfiles` directory.
 */
export function mapFilesDir(): string | undefined {
  const s = useSettingsStore.getState()
  return s.activeMapDirectory ?? deriveMapFilesDirectory(s.activeLibrary) ?? undefined
}

/** Where installed Brigid `.datf` packs live. */
export function brigidAssetsDir(): string | undefined {
  return useSettingsStore.getState().brigidAssetsPath ?? undefined
}

/** The asset pack working directory — pack projects and their source art. */
export function packWorkingDir(): string | undefined {
  return useSettingsStore.getState().packDir ?? undefined
}

/** The music directory in use: the active working directory, else the library. */
export function musicDir(): string | undefined {
  const s = useSettingsStore.getState()
  return s.activeMusicWorkingDir ?? s.musicLibraryPath ?? undefined
}

/** The Dark Ages install directory, which is where the `.dat` archives are. */
export function clientDir(): string | undefined {
  return useSettingsStore.getState().clientPath ?? undefined
}
