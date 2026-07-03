import { create } from 'zustand'

export type ThemeName = 'hybrasyl' | 'chadul' | 'danaan' | 'grinneal'

export interface MapDirectory {
  path: string
  name: string // user-provided nickname (defaults to folder name)
}

/**
 * The renderer-owned, disk-persisted settings. Mirrors exactly the fields
 * App.tsx used to hydrate into / persist from Recoil atoms — the main-process
 * TaliesinSettings has a couple more fields (e.g. lastOpenedArchive) that are
 * managed via their own IPC calls, not this store.
 */
export interface RendererSettings {
  theme: ThemeName
  clientPath: string | null
  /** Where installed Brigid .datf packs live; scanned so the map/worldmap
   *  editors can preview static_tiles / world_maps overrides. */
  brigidAssetsPath: string | null
  libraries: string[]
  activeLibrary: string | null
  mapDirectories: MapDirectory[]
  activeMapDirectory: string | null
  musicLibraryPath: string | null
  musicWorkingDirs: string[]
  activeMusicWorkingDir: string | null
  ffmpegPath: string | null
  packDir: string | null
  companionPath: string | null
  musEncodeKbps: number
  musEncodeSampleRate: number
}

export const DEFAULT_SETTINGS: RendererSettings = {
  theme: 'hybrasyl',
  clientPath: null,
  brigidAssetsPath: null,
  libraries: [],
  activeLibrary: null,
  mapDirectories: [],
  activeMapDirectory: null,
  musicLibraryPath: null,
  musicWorkingDirs: [],
  activeMusicWorkingDir: null,
  ffmpegPath: null,
  packDir: null,
  companionPath: null,
  musEncodeKbps: 64,
  musEncodeSampleRate: 22050
}

interface SettingsActions {
  setTheme: (name: ThemeName) => void
  setClientPath: (path: string | null) => void
  setBrigidAssetsPath: (path: string | null) => void
  setLibraries: (libs: string[]) => void
  setActiveLibrary: (path: string | null) => void
  setMapDirectories: (dirs: MapDirectory[]) => void
  setActiveMapDirectory: (path: string | null) => void
  setMusicLibraryPath: (path: string | null) => void
  setMusicWorkingDirs: (dirs: string[]) => void
  setActiveMusicWorkingDir: (path: string | null) => void
  setFfmpegPath: (path: string | null) => void
  setPackDir: (path: string | null) => void
  setCompanionPath: (path: string | null) => void
  setMusEncodeKbps: (kbps: number) => void
  setMusEncodeSampleRate: (rate: number) => void
  /** Load persisted settings from disk into the store (once, at startup). */
  hydrate: () => Promise<void>
}

export type SettingsStore = RendererSettings & SettingsActions

// Coerce the loosely-typed persisted blob into RendererSettings, applying the
// same type guards App.tsx used so a corrupt/partial settings.json can't inject
// wrong-typed values into the store.
function coerce(raw: Record<string, unknown>): Partial<RendererSettings> {
  const out: Partial<RendererSettings> = {}
  const themes = ['hybrasyl', 'chadul', 'danaan', 'grinneal']
  if (typeof raw.theme === 'string' && themes.includes(raw.theme))
    out.theme = raw.theme as ThemeName
  if (typeof raw.clientPath === 'string') out.clientPath = raw.clientPath
  if (typeof raw.brigidAssetsPath === 'string') out.brigidAssetsPath = raw.brigidAssetsPath
  if (Array.isArray(raw.libraries)) out.libraries = raw.libraries as string[]
  if (typeof raw.activeLibrary === 'string') out.activeLibrary = raw.activeLibrary
  if (Array.isArray(raw.mapDirectories)) out.mapDirectories = raw.mapDirectories as MapDirectory[]
  if (typeof raw.activeMapDirectory === 'string') out.activeMapDirectory = raw.activeMapDirectory
  if (typeof raw.musicLibraryPath === 'string') out.musicLibraryPath = raw.musicLibraryPath
  if (Array.isArray(raw.musicWorkingDirs)) out.musicWorkingDirs = raw.musicWorkingDirs as string[]
  if (typeof raw.activeMusicWorkingDir === 'string')
    out.activeMusicWorkingDir = raw.activeMusicWorkingDir
  if (typeof raw.ffmpegPath === 'string') out.ffmpegPath = raw.ffmpegPath
  if (typeof raw.packDir === 'string') out.packDir = raw.packDir
  if (typeof raw.companionPath === 'string') out.companionPath = raw.companionPath
  if (typeof raw.musEncodeKbps === 'number') out.musEncodeKbps = raw.musEncodeKbps
  if (typeof raw.musEncodeSampleRate === 'number') out.musEncodeSampleRate = raw.musEncodeSampleRate
  return out
}

// Suppresses the save-on-change subscription for the single write that
// originated from disk during hydrate — otherwise hydrate would
// load → set → subscribe-fires → save the exact same content back, bouncing
// settings.json on every launch.
let suppressNextSave = false

export const useSettingsStore = create<SettingsStore>((set) => ({
  ...DEFAULT_SETTINGS,
  // Spread nested collections so each store instance owns its own — tests that
  // reset the store must not share references with DEFAULT_SETTINGS.
  libraries: [...DEFAULT_SETTINGS.libraries],
  mapDirectories: [...DEFAULT_SETTINGS.mapDirectories],
  musicWorkingDirs: [...DEFAULT_SETTINGS.musicWorkingDirs],

  setTheme: (theme) => set({ theme }),
  setClientPath: (clientPath) => set({ clientPath }),
  setBrigidAssetsPath: (brigidAssetsPath) => set({ brigidAssetsPath }),
  setLibraries: (libraries) => set({ libraries }),
  setActiveLibrary: (activeLibrary) => set({ activeLibrary }),
  setMapDirectories: (mapDirectories) => set({ mapDirectories }),
  setActiveMapDirectory: (activeMapDirectory) => set({ activeMapDirectory }),
  setMusicLibraryPath: (musicLibraryPath) => set({ musicLibraryPath }),
  setMusicWorkingDirs: (musicWorkingDirs) => set({ musicWorkingDirs }),
  setActiveMusicWorkingDir: (activeMusicWorkingDir) => set({ activeMusicWorkingDir }),
  setFfmpegPath: (ffmpegPath) => set({ ffmpegPath }),
  setPackDir: (packDir) => set({ packDir }),
  setCompanionPath: (companionPath) => set({ companionPath }),
  setMusEncodeKbps: (musEncodeKbps) => set({ musEncodeKbps }),
  setMusEncodeSampleRate: (musEncodeSampleRate) => set({ musEncodeSampleRate }),

  hydrate: async () => {
    const loaded = await window.api.loadSettings()
    suppressNextSave = true
    set(coerce(loaded))
  }
}))

// Persist changes back to disk through the main process. Debounced 200ms so a
// flurry of edits collapses to one write; the main-side save queue
// (.then(fn, fn) resilient) further serializes writes in submission order.
let saveTimer: ReturnType<typeof setTimeout> | null = null

useSettingsStore.subscribe((state) => {
  if (suppressNextSave) {
    suppressNextSave = false
    return
  }
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (typeof window === 'undefined' || !window.api?.saveSettings) return
    const {
      theme,
      clientPath,
      brigidAssetsPath,
      libraries,
      activeLibrary,
      mapDirectories,
      activeMapDirectory,
      musicLibraryPath,
      musicWorkingDirs,
      activeMusicWorkingDir,
      ffmpegPath,
      packDir,
      companionPath,
      musEncodeKbps,
      musEncodeSampleRate
    } = state
    void window.api
      .saveSettings({
        theme,
        clientPath,
        brigidAssetsPath,
        libraries,
        activeLibrary,
        mapDirectories,
        activeMapDirectory,
        musicLibraryPath,
        musicWorkingDirs,
        activeMusicWorkingDir,
        ffmpegPath,
        packDir,
        companionPath,
        musEncodeKbps,
        musEncodeSampleRate
      })
      .catch((err) => console.error('[settings] save IPC failed:', err))
  }, 200)
})

/**
 * Binary .map files live at `<world>/mapfiles`, sibling to `<world>/xml`.
 * Derived from the active library path (was the `mapFilesDirectoryState`
 * Recoil selector). Pure so it's unit-testable and usable outside React.
 */
export function deriveMapFilesDirectory(activeLibrary: string | null): string | null {
  if (!activeLibrary) return null
  const norm = activeLibrary.replace(/\\/g, '/').replace(/\/+$/, '')
  const lastSep = norm.lastIndexOf('/')
  if (lastSep <= 0) return null
  return norm.slice(0, lastSep) + '/mapfiles'
}

/** Reactive selector hook for the derived mapfiles directory. */
export function useMapFilesDirectory(): string | null {
  return useSettingsStore((s) => deriveMapFilesDirectory(s.activeLibrary))
}
