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
      readFile: ReturnType<typeof vi.fn>
      writeFile: ReturnType<typeof vi.fn>
      copyFile: ReturnType<typeof vi.fn>
      mkdir: ReturnType<typeof vi.fn>
      unlink: ReturnType<typeof vi.fn>
      rename: ReturnType<typeof vi.fn>
      access: ReturnType<typeof vi.fn>
      stat: ReturnType<typeof vi.fn>
      readdir: ReturnType<typeof vi.fn>
    }
  }
  reset: () => void
}

export function createMemoryFs(): MemoryFs {
  const files = new Map<string, Buffer>()
  const dirs = new Map<string, Set<string>>()

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
    const childDirs = new Set<string>()
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
      return names.map<Dirent>((name) => {
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
        const buf =
          typeof content === 'string'
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
      readdir
    }
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
    }
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
  // Pre-bless '/' so assertInsideAnyRoot accepts every absolute path the
  // in-memory test filesystem uses. Tests that exercise authorisation can
  // override these sets per-case via the returned bridge context.
  const handlerCtx = {
    settingsPath: ctx.settingsPath,
    settingsManager: ctx.settingsManager as never,
    appGetVersion: ctx.appGetVersion ?? (() => '0.0.0-test'),
    settingsRoots: new Set<string>(),
    blessedRoots: new Set<string>(['/'])
  }

  return {
    // Window controls — no-ops in the bridge (no real BrowserWindow)
    minimizeWindow: () => undefined,
    maximizeWindow: () => undefined,
    closeWindow: () => undefined,

    // App
    getAppVersion: () => handlers.getAppVersion(handlerCtx),
    getUserDataPath: async () => handlers.getUserDataPath(handlerCtx),
    launchCompanion: (p) => handlers.launchCompanion(handlerCtx, p),

    // Settings
    loadSettings: async () => (await handlers.loadSettings(handlerCtx)) as Record<string, unknown>,
    saveSettings: (s) => handlers.saveSettings(handlerCtx, s),

    // Dialogs (test-controlled) — also bless results into ctx so subsequent
    // handler calls can read paths the user "picked" in the test.
    openFile: async () => {
      const p = (await dialog.openFile?.()) ?? null
      if (p) handlerCtx.blessedRoots.add(p)
      return p
    },
    openDirectory: async () => {
      const p = (await dialog.openDirectory?.()) ?? null
      if (p) handlerCtx.blessedRoots.add(p)
      return p
    },
    saveFile: async () => {
      const p = (await dialog.saveFile?.()) ?? null
      if (p) handlerCtx.blessedRoots.add(p)
      return p
    },

    // Filesystem
    readFile: (p) => handlers.readFile(handlerCtx, p),
    listDir: (p) => handlers.listDir(handlerCtx, p),
    copyFile: (s, d) => handlers.copyFile(handlerCtx, s, d),
    writeFile: (p, c) => handlers.writeFile(handlerCtx, p, c),
    writeBytes: (p, d) => handlers.writeBytes(handlerCtx, p, d),
    exists: (p) => handlers.exists(handlerCtx, p),
    stat: (p) => handlers.stat(handlerCtx, p),
    ensureDir: (p) => handlers.ensureDir(handlerCtx, p),
    deleteFile: (p) => handlers.deleteFile(handlerCtx, p),
    listArchive: (p) => handlers.listArchive(handlerCtx, p),

    // Catalog
    catalogLoad: (p) => handlers.catalogLoad(handlerCtx, p),
    catalogSave: (p, d) => handlers.catalogSave(handlerCtx, p, d),
    catalogScan: (p) => handlers.catalogScan(handlerCtx, p),

    // Music
    musicReadFileMeta: (p) => handlers.musicReadFileMeta(handlerCtx, p),
    musicScan: (p) => handlers.musicScan(handlerCtx, p),
    musicMetadataLoad: async (d) =>
      (await handlers.musicMetadataLoad(handlerCtx, d)) as Record<string, MusicMeta>,
    musicMetadataSave: (p, d) => handlers.musicMetadataSave(handlerCtx, p, d),
    musicPacksLoad: async (d) => (await handlers.musicPacksLoad(handlerCtx, d)) as MusicPack[],
    musicPacksSave: (p, packs) => handlers.musicPacksSave(handlerCtx, p, packs),
    musicDeployPack: (src, pack, dst, ffmpeg, kbps, sr) =>
      handlers.musicDeployPack(handlerCtx, src, pack, dst, ffmpeg, kbps, sr),
    musicClientScan: (p) => handlers.musicClientScan(handlerCtx, p),

    // SFX
    sfxList: (p) => handlers.sfxList(handlerCtx, p),
    sfxReadEntry: (p, n) => handlers.sfxReadEntry(handlerCtx, p, n),
    sfxIndexLoad: async (l) =>
      (await handlers.sfxIndexLoad(handlerCtx, l)) as Record<
        string,
        { name?: string; comment?: string }
      >,
    sfxIndexSave: (p, d) => handlers.sfxIndexSave(handlerCtx, p, d),

    // BIK
    bikConvert: (bytes, ffmpegPath, cacheDir) =>
      handlers.bikConvert(handlerCtx, bytes, ffmpegPath, cacheDir),

    // World index
    indexRead: async (l) => (await handlers.indexRead(handlerCtx, l)) as WorldIndex | null,
    indexBuild: async (l) => (await handlers.indexBuild(handlerCtx, l)) as WorldIndex,
    indexStatus: (l) => handlers.indexStatus(handlerCtx, l),
    indexDelete: (l) => handlers.indexDelete(handlerCtx, l),
    libraryResolve: (p) => handlers.libraryResolve(handlerCtx, p),

    // Prefabs
    prefabList: (p) => handlers.prefabList(handlerCtx, p),
    prefabLoad: (p, f) => handlers.prefabLoad(handlerCtx, p, f),
    prefabSave: (p, f, d) => handlers.prefabSave(handlerCtx, p, f, d),
    prefabDelete: (p, f) => handlers.prefabDelete(handlerCtx, p, f),
    prefabRename: (p, o, n) => handlers.prefabRename(handlerCtx, p, o, n),

    // Asset packs
    packScan: (p) => handlers.packScan(handlerCtx, p),
    packLoad: (p) => handlers.packLoad(handlerCtx, p),
    packSave: (p, d) => handlers.packSave(handlerCtx, p, d),
    packDelete: (p) => handlers.packDelete(handlerCtx, p),
    packAddAsset: (d, s, t) => handlers.packAddAsset(handlerCtx, d, s, t),
    packRemoveAsset: (d, f) => handlers.packRemoveAsset(handlerCtx, d, f),
    packCompile: (d, m, f, o) => handlers.packCompile(handlerCtx, d, m, f, o),

    // Palettes
    paletteScan: (p) => handlers.paletteScan(handlerCtx, p),
    paletteLoad: (p) => handlers.paletteLoad(handlerCtx, p),
    paletteSave: (p, d) => handlers.paletteSave(handlerCtx, p, d),
    paletteDelete: (p) => handlers.paletteDelete(handlerCtx, p),
    paletteCalibrationLoad: async (d, id) =>
      (await handlers.paletteCalibrationLoad(handlerCtx, d, id)) as Record<
        string,
        Record<string, unknown>
      >,
    paletteCalibrationSave: (d, id, data) =>
      handlers.paletteCalibrationSave(handlerCtx, d, id, data),
    frameScan: (p) => handlers.frameScan(handlerCtx, p),

    // Tile scanner
    tileScanAnalyze: (paths) => handlers.tileScanAnalyze(handlerCtx, paths),

    // Themes
    themeList: () => handlers.themeList(handlerCtx),
    themeLoad: (f) => handlers.themeLoad(handlerCtx, f),
    themeSave: (f, d) => handlers.themeSave(handlerCtx, f, d),
    themeDelete: (f) => handlers.themeDelete(handlerCtx, f)
  }
}

/** Install a bridged window.api on the global window. */
export function installBridgedApi(handlers: Handlers, ctx: BridgeContext): TaliesinAPI {
  const api = buildBridgedApi(handlers, ctx)
  ;(window as unknown as { api: TaliesinAPI }).api = api
  return api
}
