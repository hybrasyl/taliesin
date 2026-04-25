/**
 * Renderer↔main integration bridge.
 *
 * Provides an in-memory fs + a fake `window.api` whose every method calls the
 * real handler functions extracted into `src/main/handlers.ts`. Use it in
 * page-level integration tests to exercise renderer state machines + the IPC
 * contract end-to-end without spinning up Electron.
 *
 * Pattern (vi.mock factories must be hoisted in the test file itself):
 *
 *   import { createMemoryFs } from '.../handlerBridge'
 *   const memfs = vi.hoisted(() => createMemoryFs())
 *   vi.mock('fs', () => memfs.fsModule)
 *   vi.mock('@eriscorp/hybindex-ts', () => ({ ... }))
 *   vi.mock('child_process', () => ({ ... }))
 *
 *   const handlers = await import('../../main/handlers')
 *   installBridgedApi(handlers, { settingsPath: '/appdata/Taliesin', settingsManager })
 */
import { vi } from 'vitest'

// ── In-memory filesystem ─────────────────────────────────────────────────────

export interface MemoryFs {
  files: Map<string, Buffer>
  fsModule: {
    promises: {
      readFile:  ReturnType<typeof vi.fn>
      writeFile: ReturnType<typeof vi.fn>
      copyFile:  ReturnType<typeof vi.fn>
      mkdir:     ReturnType<typeof vi.fn>
      unlink:    ReturnType<typeof vi.fn>
      rename:    ReturnType<typeof vi.fn>
      access:    ReturnType<typeof vi.fn>
      stat:      ReturnType<typeof vi.fn>
      readdir:   ReturnType<typeof vi.fn>
    }
  }
  reset: () => void
}

export function createMemoryFs(): MemoryFs {
  const files = new Map<string, Buffer>()
  const dirs  = new Map<string, Set<string>>()

  const dirOf = (p: string) => {
    const norm = p.replace(/\\/g, '/')
    const slash = norm.lastIndexOf('/')
    return slash > 0 ? norm.slice(0, slash) : '/'
  }
  const baseOf = (p: string) => {
    const norm = p.replace(/\\/g, '/')
    const slash = norm.lastIndexOf('/')
    return slash >= 0 ? norm.slice(slash + 1) : norm
  }
  const ensureDir = (path: string) => {
    const norm = path.replace(/[\\/]+$/, '').replace(/\\/g, '/')
    if (!dirs.has(norm)) dirs.set(norm, new Set())
  }
  const enoent = () => Object.assign(new Error('ENOENT'), { code: 'ENOENT' })

  type Dirent = { name: string; isFile: () => boolean; isDirectory: () => boolean }

  const readdir = vi.fn(async (path: string, opts?: { withFileTypes?: boolean }) => {
    const norm = path.replace(/\\/g, '/').replace(/\/+$/, '')
    const childFiles = new Set<string>()
    const childDirs  = new Set<string>()
    const prefix = norm === '/' ? '/' : norm + '/'
    for (const filePath of files.keys()) {
      if (!filePath.startsWith(prefix)) continue
      const rest = filePath.slice(prefix.length)
      const slash = rest.indexOf('/')
      if (slash === -1) childFiles.add(rest)
      else childDirs.add(rest.slice(0, slash))
    }
    for (const dirPath of dirs.keys()) {
      if (!dirPath.startsWith(prefix)) continue
      const rest = dirPath.slice(prefix.length)
      if (rest && !rest.includes('/')) childDirs.add(rest)
    }
    if (childFiles.size === 0 && childDirs.size === 0 && !dirs.has(norm)) throw enoent()
    const names = [...childFiles, ...childDirs]
    if (opts?.withFileTypes) {
      return names.map<Dirent>(name => {
        const isDir = childDirs.has(name)
        return { name, isFile: () => !isDir, isDirectory: () => isDir }
      })
    }
    return names
  })

  const fsModule = {
    promises: {
      readFile: vi.fn(async (path: string, encoding?: string) => {
        const norm = path.replace(/\\/g, '/')
        const buf = files.get(norm)
        if (!buf) throw enoent()
        return encoding === 'utf-8' || encoding === 'utf8' ? buf.toString('utf-8') : buf
      }),
      writeFile: vi.fn(async (path: string, content: string | Buffer | Uint8Array) => {
        const norm = path.replace(/\\/g, '/')
        const buf = typeof content === 'string'
          ? Buffer.from(content, 'utf-8')
          : Buffer.from(content as Uint8Array)
        files.set(norm, buf)
        ensureDir(dirOf(norm))
      }),
      copyFile: vi.fn(async (src: string, dst: string) => {
        const sNorm = src.replace(/\\/g, '/')
        const dNorm = dst.replace(/\\/g, '/')
        const buf = files.get(sNorm)
        if (!buf) throw enoent()
        files.set(dNorm, buf)
        ensureDir(dirOf(dNorm))
      }),
      mkdir: vi.fn(async (path: string) => {
        ensureDir(path.replace(/\\/g, '/'))
      }),
      unlink: vi.fn(async (path: string) => {
        const norm = path.replace(/\\/g, '/')
        if (!files.has(norm)) throw enoent()
        files.delete(norm)
      }),
      rename: vi.fn(async (from: string, to: string) => {
        const fNorm = from.replace(/\\/g, '/')
        const tNorm = to.replace(/\\/g, '/')
        const buf = files.get(fNorm)
        if (!buf) throw enoent()
        files.delete(fNorm)
        files.set(tNorm, buf)
        ensureDir(dirOf(tNorm))
      }),
      access: vi.fn(async (path: string) => {
        const norm = path.replace(/\\/g, '/')
        if (!files.has(norm) && !dirs.has(norm)) throw enoent()
      }),
      stat: vi.fn(async (path: string) => {
        const norm = path.replace(/\\/g, '/')
        const buf = files.get(norm)
        if (!buf) throw enoent()
        return { size: buf.length }
      }),
      readdir,
    },
  }

  void baseOf // silence unused (handy when extending the fs surface)

  // Vite-ESM consumers may reach for `default` even when the source uses named
  // imports, so expose the same shape under both keys.
  ;(fsModule as unknown as { default: unknown }).default = fsModule

  return {
    files,
    fsModule,
    reset: () => {
      files.clear()
      dirs.clear()
      dirs.set('/', new Set())
    },
  }
}

// ── window.api bridge ────────────────────────────────────────────────────────

export interface BridgeContext {
  settingsPath: string
  settingsManager: { load: () => Promise<unknown>; save: (s: unknown) => Promise<void> }
  appGetVersion?: () => string
  /** Optional dialog stub — defaults to canceling all dialogs. */
  dialog?: {
    openFile?: () => Promise<string | null>
    openDirectory?: () => Promise<string | null>
    saveFile?: () => Promise<string | null>
  }
}

// Avoid importing types from src/main/ to keep the renderer tsconfig clean.
// The bridge accepts an opaque handlers object and forwards into it; the
// runtime contract is enforced by the integration tests.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Handlers = Record<string, (...args: any[]) => any>
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Constructs a `window.api` shape backed by the real handler functions
 * imported from `src/main/handlers.ts`. Every method matches a channel name
 * in the preload (`TaliesinAPI`) and forwards into the corresponding handler.
 */
export function buildBridgedApi(handlers: Handlers, ctx: BridgeContext): TaliesinAPI {
  const dialog = ctx.dialog ?? {}
  const handlerCtx = {
    settingsPath: ctx.settingsPath,
    settingsManager: ctx.settingsManager as never,
    appGetVersion: ctx.appGetVersion ?? (() => '0.0.0-test'),
  }

  return {
    // Window controls — no-ops in the bridge (no real BrowserWindow)
    minimizeWindow: () => undefined,
    maximizeWindow: () => undefined,
    closeWindow:    () => undefined,

    // App
    getAppVersion:     () => handlers.getAppVersion(handlerCtx),
    getUserDataPath:   async () => handlers.getUserDataPath(handlerCtx),
    launchCompanion:   (p) => handlers.launchCompanion(p),

    // Settings
    loadSettings: async () => (await handlers.loadSettings(handlerCtx)) as Record<string, unknown>,
    saveSettings: (s) => handlers.saveSettings(handlerCtx, s),

    // Dialogs (test-controlled)
    openFile:      async () => (await dialog.openFile?.())      ?? null,
    openDirectory: async () => (await dialog.openDirectory?.()) ?? null,
    saveFile:      async () => (await dialog.saveFile?.())      ?? null,

    // Filesystem
    readFile:     handlers.readFile,
    listDir:      handlers.listDir,
    copyFile:     handlers.copyFile,
    writeFile:    handlers.writeFile,
    writeBytes:   handlers.writeBytes,
    exists:       handlers.exists,
    ensureDir:    handlers.ensureDir,
    deleteFile:   handlers.deleteFile,
    listArchive:  handlers.listArchive,

    // Catalog
    catalogLoad:  handlers.catalogLoad,
    catalogSave:  handlers.catalogSave,
    catalogScan:  handlers.catalogScan,

    // Music
    musicReadFileMeta: handlers.musicReadFileMeta,
    musicScan:         handlers.musicScan,
    musicMetadataLoad: async (d) => (await handlers.musicMetadataLoad(d)) as Record<string, MusicMeta>,
    musicMetadataSave: handlers.musicMetadataSave,
    musicPacksLoad:    async (d) => (await handlers.musicPacksLoad(d)) as MusicPack[],
    musicPacksSave:    handlers.musicPacksSave,
    musicDeployPack:   handlers.musicDeployPack,
    musicClientScan:   handlers.musicClientScan,

    // SFX
    sfxList:       handlers.sfxList,
    sfxReadEntry:  handlers.sfxReadEntry,
    sfxIndexLoad:  async (l) => (await handlers.sfxIndexLoad(l)) as Record<string, { name?: string; comment?: string }>,
    sfxIndexSave:  handlers.sfxIndexSave,

    // BIK
    bikConvert: (bytes, ffmpegPath, cacheDir) => handlers.bikConvert(bytes, ffmpegPath, cacheDir),

    // World index
    indexRead:       async (l) => (await handlers.indexRead(l)) as WorldIndex | null,
    indexBuild:      async (l) => (await handlers.indexBuild(l)) as WorldIndex,
    indexStatus:     handlers.indexStatus,
    indexDelete:     handlers.indexDelete,
    libraryResolve:  handlers.libraryResolve,

    // Prefabs
    prefabList:    handlers.prefabList,
    prefabLoad:    handlers.prefabLoad,
    prefabSave:    handlers.prefabSave,
    prefabDelete:  handlers.prefabDelete,
    prefabRename:  handlers.prefabRename,

    // Asset packs
    packScan:        handlers.packScan,
    packLoad:        handlers.packLoad,
    packSave:        handlers.packSave,
    packDelete:      handlers.packDelete,
    packAddAsset:    handlers.packAddAsset,
    packRemoveAsset: handlers.packRemoveAsset,
    packCompile:     handlers.packCompile,

    // Palettes
    paletteScan:             handlers.paletteScan,
    paletteLoad:             handlers.paletteLoad,
    paletteSave:             handlers.paletteSave,
    paletteDelete:           handlers.paletteDelete,
    paletteCalibrationLoad:  async (d, id) => (await handlers.paletteCalibrationLoad(d, id)) as Record<string, Record<string, unknown>>,
    paletteCalibrationSave:  handlers.paletteCalibrationSave,
    frameScan:               handlers.frameScan,

    // Tile scanner
    tileScanAnalyze: handlers.tileScanAnalyze,

    // Themes
    themeList:    () => handlers.themeList(handlerCtx),
    themeLoad:    (f) => handlers.themeLoad(handlerCtx, f),
    themeSave:    (f, d) => handlers.themeSave(handlerCtx, f, d),
    themeDelete:  (f) => handlers.themeDelete(handlerCtx, f),
  }
}

/** Install a bridged window.api on the global window. */
export function installBridgedApi(handlers: Handlers, ctx: BridgeContext): TaliesinAPI {
  const api = buildBridgedApi(handlers, ctx)
  ;(window as unknown as { api: TaliesinAPI }).api = api
  return api
}
