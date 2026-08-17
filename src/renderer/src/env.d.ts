/// <reference types="vite/client" />

declare global {
  interface DirEntry {
    name: string
    isDirectory: boolean
  }

  /**
   * Companion resolution (HTOO-292). Structurally identical to the types in
   * `src/main/companion.ts`, declared here because the renderer's tsconfig does
   * not include `src/main` — the same reason `DirEntry` is repeated above.
   */
  type CompanionKind = 'binary' | 'appBundle' | 'desktopEntry'
  type CompanionSource = 'manual' | 'sibling' | 'installed'
  interface CompanionStatus {
    resolved: { target: string; kind: CompanionKind; source: CompanionSource } | null
    /** A configured override that no longer exists. Discovery continued past it. */
    staleOverride: boolean
  }
  /** Never collapsed to a boolean: each reason needs its own sentence, and three
   *  of the four are things the user can fix. */
  type CompanionLaunchResult =
    | { ok: true; source: CompanionSource; target: string }
    | {
        ok: false
        reason:
          | 'not-found'
          | 'stale-override'
          | 'not-executable'
          | 'launch-failed'
          | 'not-configured'
        target?: string
        message?: string
      }

  /**
   * One world type's `.xml` files, listed recursively and split by whether they
   * are archived. `dir` is absolute and forward-slashed; each rel path is
   * type-relative and *is* the `<type>NamesByFilename` / `MapDetail.filename`
   * index key, so names look up directly with no `.ignore/` prefix handling.
   */
  /**
   * One XML file that names the map being scanned for.
   *
   * Not only maps: a nation, a server config and a world map all name maps and
   * all break the same way, so `section` says which kind this is.
   */
  interface WarpReferrer {
    /** Path relative to its own section. */
    file: string
    /** How many references in it name the map scanned for. */
    count: number
    /** `maps`, `nations`, `serverconfigs`, `worldmaps`. */
    section: string
  }

  interface SectionListing {
    dir: string
    active: string[]
    archived: string[]
  }

  interface MapScanEntry {
    filename: string
    sizeBytes: number
  }

  interface MusicScanEntry {
    filename: string
    sizeBytes: number
  }

  /** A browsable PNG entry inside an installed .datf pack (art picker). */
  interface PackImageEntry {
    packFile: string
    packFileName: string
    packId: string
    contentType: string
    schemaVersion: number
    entryPath: string
  }

  interface MusicMeta {
    name?: string
    notes?: string
    description?: string
    tags?: string[]
    duration?: number
    bitrate?: number
    sampleRate?: number
    channels?: number
    /** Read-only: generation prompt from ID3 TXXX:PROMPT frame (e.g. Suno). */
    prompt?: string
  }

  interface MusicFileMeta {
    title: string | null
    artist: string | null
    genre: string | null
    album: string | null
    duration: number | null
    bitrate: number | null
    sampleRate: number | null
    channels: number | null
    prompt: string | null
  }

  interface MusicPackTrack {
    musicId: number
    sourceFile: string
  }

  interface MusicPack {
    id: string
    name: string
    description?: string
    tracks: MusicPackTrack[]
    createdAt: string
    updatedAt: string
  }

  // ── World index (shared format with Creidhne) ─────────────────────────────────
  type WorldIndex = import('@eriscorp/hybindex-ts').WorldIndex

  interface TaliesinAPI {
    minimizeWindow: () => void
    maximizeWindow: () => void
    closeWindow: () => void
    getAppVersion: () => Promise<string>
    /** The bundled CHANGELOG.md for the "What's new" dialog; null if not shipped. */
    getChangelog: () => Promise<string | null>
    getUserDataPath: () => Promise<string>
    revealSettings: () => Promise<void>
    appReady: () => void
    reportRendererError: (payload: {
      source: string
      message: string
      stack?: string
    }) => Promise<void>
    buildDiagnostics: () => Promise<string>
    openIssue: (payload: {
      title: string
      body: string
    }) => Promise<{ ok: true; truncated: boolean }>
    copyReport: (payload: { body: string }) => Promise<{ ok: true }>
    revealLogs: () => Promise<void>
    loadSettings: () => Promise<Record<string, unknown>>
    saveSettings: (settings: unknown) => Promise<void>
    /**
     * Companion app (HTOO-292). The renderer names no path — main resolves the
     * companion by identity and decides what may be launched.
     */
    launchCompanion: () => Promise<CompanionLaunchResult>
    companionStatus: () => Promise<CompanionStatus>
    companionPickerFilters: () => Promise<{ name: string; extensions: string[] }[]>
    /** A newer published release, or null when current / offline / rate-limited. */
    checkForUpdate: () => Promise<{ version: string; url: string } | null>
    openFile: (
      filters?: { name: string; extensions: string[] }[],
      defaultPath?: string
    ) => Promise<string | null>
    openFiles: (
      filters?: { name: string; extensions: string[] }[],
      defaultPath?: string
    ) => Promise<string[]>
    openDirectory: () => Promise<string | null>
    saveFile: (
      filters?: { name: string; extensions: string[] }[],
      defaultPath?: string
    ) => Promise<string | null>
    readFile: (filePath: string) => Promise<Buffer>
    listDir: (dirPath: string) => Promise<DirEntry[]>
    listSection: (libraryPath: string, type: string) => Promise<SectionListing>
    scanWarpReferrers: (libraryPath: string, mapName: string) => Promise<WarpReferrer[]>
    updateWarpTargets: (
      libraryPath: string,
      oldName: string,
      newName: string
    ) => Promise<{ updated: WarpReferrer[]; failed: string[] }>
    copyFile: (src: string, dst: string) => Promise<void>
    moveFile: (src: string, dst: string) => Promise<void>
    writeFile: (filePath: string, content: string) => Promise<void>
    writeBytes: (filePath: string, data: Uint8Array) => Promise<void>
    exists: (filePath: string) => Promise<boolean>
    stat: (filePath: string) => Promise<{ mtimeMs: number; sizeBytes: number } | null>
    ensureDir: (dirPath: string) => Promise<void>
    deleteFile: (filePath: string) => Promise<void>
    listArchive: (filePath: string) => Promise<string[]>
    catalogLoad: (dirPath: string) => Promise<Record<string, unknown>>
    catalogSave: (dirPath: string, data: unknown) => Promise<void>
    catalogScan: (dirPath: string) => Promise<MapScanEntry[]>
    musicReadFileMeta: (filePath: string) => Promise<MusicFileMeta | null>
    musicScan: (dirPath: string) => Promise<MusicScanEntry[]>
    musicMetadataLoad: (dirPath: string) => Promise<Record<string, MusicMeta>>
    musicMetadataSave: (dirPath: string, data: Record<string, MusicMeta>) => Promise<void>
    musicPacksLoad: (dirPath: string) => Promise<MusicPack[]>
    musicPacksSave: (dirPath: string, packs: MusicPack[]) => Promise<void>
    musicDeployPack: (
      srcLibDir: string,
      pack: MusicPack,
      destDir: string,
      ffmpegPath: string | null,
      kbps: number,
      sampleRate: number
    ) => Promise<void>
    musicClientScan: (clientPath: string) => Promise<MusicScanEntry[]>
    indexRead: (libraryRoot: string) => Promise<WorldIndex | null>
    indexBuild: (libraryRoot: string) => Promise<WorldIndex>
    indexStatus: (
      libraryRoot: string
    ) => Promise<{ exists: boolean; builtAt?: string; stale?: boolean }>
    indexDelete: (libraryRoot: string) => Promise<void>
    libraryResolve: (selectedPath: string) => Promise<string | null>
    prefabList: (libraryPath: string) => Promise<
      {
        filename: string
        name: string
        width: number
        height: number
        createdAt: string
        updatedAt: string
      }[]
    >
    prefabLoad: (libraryPath: string, filename: string) => Promise<unknown>
    prefabSave: (libraryPath: string, filename: string, data: unknown) => Promise<void>
    prefabDelete: (libraryPath: string, filename: string) => Promise<void>
    prefabRename: (libraryPath: string, oldName: string, newName: string) => Promise<void>
    packScan: (dirPath: string) => Promise<unknown[]>
    packLoad: (filePath: string) => Promise<unknown>
    packSave: (filePath: string, data: unknown) => Promise<void>
    packDelete: (filePath: string) => Promise<void>
    packAddAsset: (packDir: string, sourcePath: string, targetFilename: string) => Promise<void>
    packRemoveAsset: (packDir: string, filename: string) => Promise<void>
    packCompile: (
      packDir: string,
      manifest: unknown,
      assetFilenames: string[],
      outputPath: string
    ) => Promise<void>
    packImport: (
      datfPath: string,
      packDir: string,
      options?: { force?: boolean }
    ) => Promise<{ projectFilename: string; warnings: string[] }>
    packListActive: () => Promise<unknown[]>
    packListImageEntries: () => Promise<PackImageEntry[]>
    packReadEntry: (packFile: string, entryPath: string) => Promise<Uint8Array | null>
    packListCoveredIds: (subtype: string) => Promise<(number | string)[]>
    packResolveAsset: (
      subtype: string,
      id: number | string
    ) => Promise<{ bytes: Uint8Array; mime: string } | null>
    packSuggestedBrigidAssetsPath: () => Promise<string | null>
    packReload: () => Promise<void>
    packTrackMeta: (
      subtype: string,
      id: number | string
    ) => Promise<{ title: string | null; artist: string | null; album: string | null } | null>
    sfxList: (clientPath: string) => Promise<{ entryName: string; sizeBytes: number }[]>
    sfxReadEntry: (clientPath: string, entryName: string) => Promise<Buffer>
    sfxIndexLoad: (
      activeLibrary: string
    ) => Promise<Record<string, { name?: string; comment?: string }>>
    sfxIndexSave: (
      activeLibrary: string,
      data: Record<string, { name?: string; comment?: string }>
    ) => Promise<void>
    bikConvert: (bytes: Uint8Array, ffmpegPath: string | null, cacheDir: string) => Promise<string>
    tileScanAnalyze: (dirPaths: string[]) => Promise<{
      background: [number, number][]
      leftForeground: [number, number][]
      rightForeground: [number, number][]
      fileCount: number
      tileCount: number
    }>
    themeList: () => Promise<{ filename: string; name: string }[]>
    themeLoad: (filename: string) => Promise<unknown>
    themeSave: (filename: string, data: unknown) => Promise<void>
    themeDelete: (filename: string) => Promise<void>
    paletteScan: (
      packDir: string
    ) => Promise<{ filename: string; id: string; name: string; entryCount: number }[]>
    paletteLoad: (filePath: string) => Promise<unknown>
    paletteSave: (filePath: string, data: unknown) => Promise<void>
    paletteDelete: (filePath: string) => Promise<void>
    paletteCalibrationLoad: (
      packDir: string,
      paletteId: string
    ) => Promise<Record<string, Record<string, unknown>>>
    paletteCalibrationSave: (packDir: string, paletteId: string, data: unknown) => Promise<void>
    frameScan: (packDir: string) => Promise<string[]>
  }

  interface Window {
    api: TaliesinAPI
  }
}

export {}
