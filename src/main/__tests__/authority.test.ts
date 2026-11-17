/**
 * Regression tests for the renderer/main authority boundary: HTOO-673
 * (the renderer chose the program main ran), HTOO-674 (a settings save
 * authorized new folders) and HTOO-675 (junctions and symlinks led file I/O out
 * of the allowed roots).
 *
 * Each case goes through the real `registerHandlers`, wrapped by the real
 * `guardIpc`, with a trusted top-frame sender, on a real temporary filesystem,
 * as the security review did. Only `execFile` is replaced: it records the
 * program and writes the output file, so no program runs.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'
import type { IpcMain } from 'electron'

const execCalls = vi.hoisted(() => [] as { cmd: string; args: string[] }[])

vi.mock('child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('child_process')>()
  const execFile = vi.fn(
    (
      cmd: string,
      args: string[],
      optsOrCb?: unknown,
      maybeCb?: (e: Error | null, out?: string, err?: string) => void
    ) => {
      const cb = (typeof optsOrCb === 'function' ? optsOrCb : maybeCb) as
        | ((e: Error | null, out?: string, err?: string) => void)
        | undefined
      execCalls.push({ cmd, args })
      // The last argument is the output file for both conversions.
      const out = args[args.length - 1]!
      void import('fs').then(({ promises }) =>
        promises.writeFile(out, 'CONVERTED').then(
          () => cb?.(null, '', ''),
          (e: Error) => cb?.(e)
        )
      )
      return {} as never
    }
  )
  return { ...real, execFile, default: { ...real, execFile } }
})

// handlers.ts reaches electron only through the diagnostics module.
vi.mock('electron', () => ({
  clipboard: { writeText: vi.fn() },
  shell: { openExternal: vi.fn(), showItemInFolder: vi.fn(), openPath: vi.fn() }
}))

const { registerHandlers, applySettingsRoots, grantsOf } = await import('../handlers')
const { createSettingsManager } = await import('../settingsManager')
const { loadOrMigrateGrants, GRANTS_FILENAME } = await import('../grants')
const { initWindowSecurity, guardIpc } = await import('../windowSecurity')
const { makeSender, trust } = await import('./windowSecurityFixtures')
const { ZipFile } = await import('yazl')
type HandlerContext = import('../handlers').HandlerContext

const TRUSTED_HTML = join(tmpdir(), 'taliesin-authority-test', 'out', 'renderer', 'index.html')
const trusted = makeSender({ url: pathToFileURL(TRUSTED_HTML).href })

beforeAll(() => {
  initWindowSecurity(undefined, TRUSTED_HTML)
  trust(trusted.contents)
})

const BASE_SETTINGS = {
  libraries: [],
  activeLibrary: null,
  mapDirectories: [],
  activeMapDirectory: null,
  musicWorkingDirs: [],
  musEncodeKbps: 64,
  musEncodeSampleRate: 22050
}

let base: string
let settingsDir: string
let work: string
let outside: string

/** The next answer the native open dialog gives. */
let nextPick: string | null = null

interface App {
  ctx: HandlerContext
  invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>
  invokeFrom: (event: unknown, channel: string, ...args: unknown[]) => Promise<unknown>
}

/**
 * Start the app's main side as index.ts does: load the settings, load or
 * migrate the grants, apply the roots, register the handlers through the guard.
 */
async function boot(): Promise<App> {
  const settingsManager = createSettingsManager(settingsDir)
  const ctx: HandlerContext = {
    settingsPath: settingsDir,
    settingsManager,
    appGetVersion: () => '0.0.0-test',
    settingsRoots: new Set<string>(),
    blessedRoots: new Set<string>()
  }
  ctx.authorityReady = (async () => {
    const s = await settingsManager.load()
    ctx.grants = await loadOrMigrateGrants(settingsDir, s)
    applySettingsRoots(ctx, s)
  })()
  await ctx.authorityReady

  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const raw = {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn),
    on: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn),
    removeHandler: (channel: string) => handlers.delete(channel),
    removeListener: () => undefined
  }
  const dialog = {
    showOpenDialog: async () => ({
      canceled: nextPick === null,
      filePaths: nextPick === null ? [] : [nextPick]
    }),
    showSaveDialog: async () => ({ canceled: true })
  }
  registerHandlers(
    { ipcMain: guardIpc(raw as unknown as IpcMain), BrowserWindow: {} as never, dialog },
    ctx
  )
  const invokeFrom = async (event: unknown, channel: string, ...args: unknown[]) => {
    const fn = handlers.get(channel)
    if (!fn) throw new Error(`no handler for ${channel}`)
    return fn(event, ...args)
  }
  return {
    ctx,
    invoke: <T>(channel: string, ...args: unknown[]) =>
      invokeFrom(trusted.event, channel, ...args) as Promise<T>,
    invokeFrom
  }
}

async function writeSettings(over: Record<string, unknown>): Promise<void> {
  await fs.mkdir(settingsDir, { recursive: true })
  await fs.writeFile(
    join(settingsDir, 'settings.json'),
    JSON.stringify({ ...BASE_SETTINGS, ...over }),
    'utf-8'
  )
}

async function exists(p: string): Promise<boolean> {
  return fs.access(p).then(
    () => true,
    () => false
  )
}

/** A junction on Windows (no admin rights needed), a directory symlink elsewhere. */
async function link(target: string, at: string): Promise<void> {
  await fs.symlink(target, at, process.platform === 'win32' ? 'junction' : 'dir')
}

beforeEach(async () => {
  base = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'taliesin-authority-')))
  settingsDir = join(base, 'settings')
  work = join(base, 'work')
  outside = join(base, 'outside')
  await fs.mkdir(work, { recursive: true })
  await fs.mkdir(outside, { recursive: true })
  await fs.writeFile(join(outside, 'secret.txt'), 'SECRET')
  execCalls.length = 0
  nextPick = null
})

afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true })
})

// ── HTOO-674 ──────────────────────────────────────────────────────────────────

describe('settings save cannot authorize a folder (HTOO-674)', () => {
  it('a forged settings save does not make an outside folder readable', async () => {
    await writeSettings({ packDir: work })
    const app = await boot()
    const secret = join(outside, 'secret.txt')

    await expect(app.invoke('fs:readFile', secret)).rejects.toThrow(/not inside any allowed root/)
    const current = await app.invoke<Record<string, unknown>>('settings:load')
    await app.invoke('settings:save', { ...current, packDir: outside })
    // The same read, after the save, is still refused. No dialog was opened.
    await expect(app.invoke('fs:readFile', secret)).rejects.toThrow(/not inside any allowed root/)
    // Nor is the folder granted for the next start.
    const grants = JSON.parse(await fs.readFile(join(settingsDir, GRANTS_FILENAME), 'utf-8'))
    expect(grants.dirs).not.toContain(outside)
    const restarted = await boot()
    await expect(restarted.invoke('fs:readFile', secret)).rejects.toThrow()
  })

  it('a folder chosen in the dialog is a root at once, and again after a restart', async () => {
    await writeSettings({})
    const app = await boot()
    nextPick = outside
    const chosen = await app.invoke<string>('dialog:openDirectory')
    const current = await app.invoke<Record<string, unknown>>('settings:load')
    await app.invoke('settings:save', { ...current, packDir: chosen })
    expect(String(await app.invoke('fs:readFile', join(outside, 'secret.txt')))).toBe('SECRET')

    const restarted = await boot()
    expect(String(await restarted.invoke('fs:readFile', join(outside, 'secret.txt')))).toBe(
      'SECRET'
    )
  })

  it('a folder removed from settings loses its grant', async () => {
    await writeSettings({ packDir: work })
    const app = await boot()
    await fs.writeFile(join(work, 'a.txt'), 'A')
    const current = await app.invoke<Record<string, unknown>>('settings:load')
    await app.invoke('settings:save', { ...current, packDir: null })
    const restarted = await boot()
    await expect(restarted.invoke('fs:readFile', join(work, 'a.txt'))).rejects.toThrow()
    // A save that names the folder again, with no dialog, does not bring it back.
    const later = await restarted.invoke<Record<string, unknown>>('settings:load')
    await restarted.invoke('settings:save', { ...later, packDir: work })
    await expect(restarted.invoke('fs:readFile', join(work, 'a.txt'))).rejects.toThrow()
  })

  it('the migration accepts the paths in settings.json once, and never again', async () => {
    await writeSettings({ packDir: work })
    const first = await boot()
    await fs.writeFile(join(work, 'a.txt'), 'A')
    expect(String(await first.invoke('fs:readFile', join(work, 'a.txt')))).toBe('A')

    // settings.json now names another folder, as a forged save would leave it.
    await writeSettings({ packDir: work, musicLibraryPath: outside })
    const second = await boot()
    await expect(second.invoke('fs:readFile', join(outside, 'secret.txt'))).rejects.toThrow()
  })

  it('generic file IPC cannot write the grants or settings files, even inside a chosen folder', async () => {
    await writeSettings({})
    const app = await boot()
    // The user chose a folder that contains the settings folder.
    nextPick = base
    await app.invoke('dialog:openDirectory')
    const grantsPath = join(settingsDir, GRANTS_FILENAME)
    const before = await fs.readFile(grantsPath, 'utf-8')
    const forged = JSON.stringify({ version: 1, dirs: [outside], executables: {} })

    await expect(app.invoke('fs:writeFile', grantsPath, forged)).rejects.toThrow(
      /own settings folder/
    )
    await expect(
      app.invoke('fs:writeBytes', join(settingsDir, 'settings.json'), new Uint8Array([1]))
    ).rejects.toThrow(/own settings folder/)
    await expect(app.invoke('fs:deleteFile', grantsPath)).rejects.toThrow(/own settings folder/)
    await fs.writeFile(join(work, 'g.json'), forged)
    await expect(app.invoke('fs:moveFile', join(work, 'g.json'), grantsPath)).rejects.toThrow(
      /own settings folder/
    )
    await expect(app.invoke('fs:copyFile', join(work, 'g.json'), grantsPath)).rejects.toThrow(
      /own settings folder/
    )
    expect(await fs.readFile(grantsPath, 'utf-8')).toBe(before)
  })

  it('refuses an untrusted frame (control)', async () => {
    await writeSettings({ packDir: work })
    const app = await boot()
    const stranger = makeSender({ id: 99, url: 'https://example.com/' })
    await expect(
      Promise.resolve().then(() => app.invokeFrom(stranger.event, 'settings:load'))
    ).rejects.toThrow()
  })
})

// ── HTOO-673 ──────────────────────────────────────────────────────────────────

describe('the renderer does not choose a program (HTOO-673)', () => {
  const bik = new Uint8Array([0x42, 0x49, 0x4b, 0x69])

  async function fakeFfmpeg(dir: string): Promise<string> {
    const p = join(dir, 'ffmpeg.exe')
    await fs.writeFile(p, 'FAKE FFMPEG')
    return p
  }

  it('bik:convert ignores a program path the renderer adds', async () => {
    await writeSettings({})
    const app = await boot()
    // The old call shape: (bytes, ffmpegPath, cacheDir).
    await app.invoke('bik:convert', bik, process.execPath, work)
    expect(execCalls.map((c) => c.cmd)).toEqual(['ffmpeg'])
  })

  it('a forged settings ffmpegPath does not reach either conversion', async () => {
    await writeSettings({ musicLibraryPath: work })
    const app = await boot()
    const current = await app.invoke<Record<string, unknown>>('settings:load')
    await app.invoke('settings:save', { ...current, ffmpegPath: process.execPath })
    // settings:load reports main's record, not the forged value.
    expect((await app.invoke<Record<string, unknown>>('settings:load')).ffmpegPath).toBe(undefined)

    await app.invoke('bik:convert', bik)
    await fs.writeFile(join(work, 'a.ogg'), 'OGG')
    const dest = join(work, 'deploy')
    await fs.mkdir(dest)
    const pack = { id: 'p', name: 'P', tracks: [{ musicId: 1, sourceFile: 'a.ogg' }] }
    await app.invoke('music:deploy-pack', work, pack, dest, 64, 22050)
    expect(execCalls.map((c) => c.cmd)).toEqual(['ffmpeg', 'ffmpeg'])
  })

  it('an ffmpeg chosen in the dialog runs for both conversions', async () => {
    await writeSettings({ musicLibraryPath: work })
    const app = await boot()
    const ffmpeg = await fakeFfmpeg(outside)
    nextPick = ffmpeg
    expect(await app.invoke('exec:choose', 'ffmpeg')).toBe(ffmpeg)
    expect((await app.invoke<Record<string, unknown>>('settings:load')).ffmpegPath).toBe(ffmpeg)

    const mp4 = await app.invoke<string>('bik:convert', bik)
    expect(String(await fs.readFile(mp4))).toBe('CONVERTED')
    await fs.writeFile(join(work, 'a.ogg'), 'OGG')
    const dest = join(work, 'deploy')
    await fs.mkdir(dest)
    const pack = { id: 'p', name: 'P', tracks: [{ musicId: 1, sourceFile: 'a.ogg' }] }
    await app.invoke('music:deploy-pack', work, pack, dest, 64, 22050)
    expect(execCalls.map((c) => c.cmd)).toEqual([ffmpeg, ffmpeg])

    // The approval survives a restart, and clearing it goes back to PATH.
    const restarted = await boot()
    await restarted.invoke('exec:clear', 'ffmpeg')
    await restarted.invoke('bik:convert', new Uint8Array([9, 9, 9]))
    expect(execCalls[execCalls.length - 1]!.cmd).toBe('ffmpeg')
  })

  it('an approved ffmpeg that changed on disk does not run', async () => {
    await writeSettings({})
    const app = await boot()
    const ffmpeg = await fakeFfmpeg(outside)
    nextPick = ffmpeg
    await app.invoke('exec:choose', 'ffmpeg')
    await fs.writeFile(ffmpeg, 'SOMETHING ELSE ENTIRELY')
    await expect(app.invoke('bik:convert', bik)).rejects.toThrow(/changed after you chose it/)
    expect(execCalls).toEqual([])
  })

  it('generic file IPC cannot overwrite the approved program', async () => {
    await writeSettings({ packDir: work })
    const app = await boot()
    const ffmpeg = await fakeFfmpeg(work)
    nextPick = ffmpeg
    await app.invoke('exec:choose', 'ffmpeg')
    await expect(app.invoke('fs:writeBytes', ffmpeg, new Uint8Array([0x4d, 0x5a]))).rejects.toThrow(
      /program Taliesin runs/
    )
    expect(String(await fs.readFile(ffmpeg))).toBe('FAKE FFMPEG')
  })

  it('a forged settings companionPath is not the companion main launches', async () => {
    await writeSettings({})
    const app = await boot()
    const launched: string[] = []
    app.ctx.companionProbe = {
      platform: 'win32',
      execPath: join(base, 'app', 'taliesin.exe'),
      env: {},
      exists: async (p: string) => p === process.execPath,
      isExecutable: async () => true,
      readdir: async () => [],
      runCommand: async () => null,
      launch: vi.fn(async (t: string) => {
        launched.push(t)
      })
    }
    const current = await app.invoke<Record<string, unknown>>('settings:load')
    await app.invoke('settings:save', { ...current, companionPath: process.execPath })
    const status = await app.invoke<{ resolved: unknown }>('app:companionStatus')
    expect(status.resolved).toBeNull()
    const result = await app.invoke<{ ok: boolean }>('app:launchCompanion')
    expect(result.ok).toBe(false)
    expect(launched).toEqual([])
  })
})

// ── HTOO-675 ──────────────────────────────────────────────────────────────────

async function datf(manifest: object, files: Record<string, string>): Promise<Buffer> {
  const zip = new ZipFile()
  zip.addBuffer(Buffer.from(JSON.stringify(manifest)), '_manifest.json')
  for (const [name, content] of Object.entries(files)) zip.addBuffer(Buffer.from(content), name)
  zip.end()
  const chunks: Buffer[] = []
  for await (const chunk of zip.outputStream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

describe('links do not lead out of an allowed root (HTOO-675)', () => {
  it('pack import does not write through a junction under the working folder', async () => {
    await writeSettings({ packDir: work })
    const app = await boot()
    await fs.mkdir(join(work, 'linked'))
    await link(outside, join(work, 'linked', 'redirect'))
    const pack = join(work, 'in.datf')
    await fs.writeFile(
      pack,
      await datf(
        {
          schema_version: 1,
          pack_id: 'linked',
          pack_version: '1.0.0',
          content_type: 'ability_icons',
          priority: 100,
          covers: { ability_icons: { dimensions: [32, 32] } }
        },
        { 'redirect/probe.txt': 'MARKER' }
      )
    )

    const result = await app
      .invoke<{ warnings: string[] }>('pack:import', pack, work, { force: true })
      .catch((e: Error) => ({ warnings: [e.message] }))
    expect(await exists(join(outside, 'probe.txt'))).toBe(false)
    expect(result.warnings.join('\n')).toMatch(/through a link/)
  })

  it('generic read, write and copy refuse a path through a link', async () => {
    await writeSettings({ packDir: work })
    const app = await boot()
    await link(outside, join(work, 'door'))
    await fs.writeFile(join(work, 'a.txt'), 'A')

    await expect(app.invoke('fs:readFile', join(work, 'door', 'secret.txt'))).rejects.toThrow(
      /through a link/
    )
    await expect(
      app.invoke('fs:writeBytes', join(work, 'door', 'new.txt'), new Uint8Array([1]))
    ).rejects.toThrow(/through a link/)
    await expect(
      app.invoke('fs:copyFile', join(work, 'a.txt'), join(work, 'door', 'copy.txt'))
    ).rejects.toThrow(/through a link/)
    await expect(app.invoke('fs:ensureDir', join(work, 'door', 'sub'))).rejects.toThrow(
      /through a link/
    )
    expect((await fs.readdir(outside)).sort()).toEqual(['secret.txt'])
  })

  it('a root that is itself a link stays usable, because the user chose it', async () => {
    await writeSettings({})
    const app = await boot()
    const linkedRoot = join(base, 'linked-root')
    await link(outside, linkedRoot)
    nextPick = linkedRoot
    await app.invoke('dialog:openDirectory')
    await app.invoke('fs:writeBytes', join(linkedRoot, 'ok.txt'), new Uint8Array([0x4f, 0x4b]))
    expect(String(await fs.readFile(join(outside, 'ok.txt')))).toBe('OK')
  })

  it('a link from one allowed root into another is allowed', async () => {
    await writeSettings({ packDir: work, musicLibraryPath: outside })
    const app = await boot()
    await link(outside, join(work, 'music'))
    expect(String(await app.invoke('fs:readFile', join(work, 'music', 'secret.txt')))).toBe(
      'SECRET'
    )
  })
})

// The grant state is reachable for other suites through grantsOf.
it('grantsOf gives an empty state, not a shared default', () => {
  const a = { settingsRoots: new Set(), blessedRoots: new Set() } as unknown as HandlerContext
  const b = { settingsRoots: new Set(), blessedRoots: new Set() } as unknown as HandlerContext
  grantsOf(a).dirs.add('/x')
  expect(grantsOf(b).dirs.size).toBe(0)
})
