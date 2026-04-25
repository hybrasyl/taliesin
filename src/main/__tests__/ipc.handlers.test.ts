import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { normalize as pathNormalize } from 'path'

// Hoisted shared state — populated by the electron mock at registration time
// and consumed by tests after import('../index') triggers the registrations.
const {
  handlers,
  listeners,
  files,
  dirs,
  dialogReplies,
  electronMock,
  fsMock,
  settingsManager,
  hybindex,
  libraryPath,
  musicMetadata,
  archiver,
  childProcess,
  electronToolkit,
  dalib
} = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const listeners = new Map<string, (...args: unknown[]) => unknown>()
  const files = new Map<string, Buffer>() // absolute path → contents (binary)
  const dirs = new Map<string, Set<string>>() // absolute dir → set of immediate child names
  const dialogReplies = {
    openFile: [] as string[],
    openDirectory: null as string | null,
    saveFile: null as string | null
  }

  const ensureDir = (path: string) => {
    const norm = path.replace(/[\\/]+$/, '')
    if (!dirs.has(norm)) dirs.set(norm, new Set())
    // Create parent links so listing works for nested paths
    const parts = norm.split(/[\\/]/).filter(Boolean)
    for (let i = 1; i <= parts.length; i++) {
      const parent = '/' + parts.slice(0, i - 1).join('/')
      const child = parts[i - 1]
      const pNorm = parent === '/' ? '/' : parent.replace(/[\\/]+$/, '')
      if (!dirs.has(pNorm)) dirs.set(pNorm, new Set())
      if (child) dirs.get(pNorm)!.add(child)
    }
  }

  const dirOf = (filePath: string) => {
    const norm = filePath.replace(/\\/g, '/')
    const slash = norm.lastIndexOf('/')
    return slash > 0 ? norm.slice(0, slash) : '/'
  }
  const baseOf = (filePath: string) => {
    const norm = filePath.replace(/\\/g, '/')
    const slash = norm.lastIndexOf('/')
    return slash >= 0 ? norm.slice(slash + 1) : norm
  }

  type Dirent = { name: string; isFile: () => boolean; isDirectory: () => boolean }

  const readdir = vi.fn(async (path: string, opts?: { withFileTypes?: boolean }) => {
    const norm = path.replace(/\\/g, '/').replace(/\/+$/, '')
    // Collect direct file children from `files`, plus direct subdir children from `dirs`.
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
    if (childFiles.size === 0 && childDirs.size === 0 && !dirs.has(norm)) {
      const e: NodeJS.ErrnoException = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      throw e
    }
    const names = [...childFiles, ...childDirs]
    if (opts?.withFileTypes) {
      return names.map<Dirent>((name) => {
        const isDir = childDirs.has(name)
        return { name, isFile: () => !isDir, isDirectory: () => isDir }
      })
    }
    return names
  })

  const fsMock = {
    promises: {
      readFile: vi.fn(async (path: string, encoding?: string) => {
        const norm = path.replace(/\\/g, '/')
        const buf = files.get(norm)
        if (!buf) {
          const e: NodeJS.ErrnoException = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
          throw e
        }
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
        dirs.get(dirOf(norm))!.add(baseOf(norm))
      }),
      copyFile: vi.fn(async (src: string, dst: string) => {
        const sNorm = src.replace(/\\/g, '/')
        const dNorm = dst.replace(/\\/g, '/')
        const buf = files.get(sNorm)
        if (!buf) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        files.set(dNorm, buf)
        ensureDir(dirOf(dNorm))
        dirs.get(dirOf(dNorm))!.add(baseOf(dNorm))
      }),
      mkdir: vi.fn(async (path: string) => {
        ensureDir(path.replace(/\\/g, '/'))
      }),
      unlink: vi.fn(async (path: string) => {
        const norm = path.replace(/\\/g, '/')
        if (!files.has(norm)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        files.delete(norm)
        dirs.get(dirOf(norm))?.delete(baseOf(norm))
      }),
      rename: vi.fn(async (from: string, to: string) => {
        const fNorm = from.replace(/\\/g, '/')
        const tNorm = to.replace(/\\/g, '/')
        const buf = files.get(fNorm)
        if (!buf) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        files.delete(fNorm)
        dirs.get(dirOf(fNorm))?.delete(baseOf(fNorm))
        files.set(tNorm, buf)
        ensureDir(dirOf(tNorm))
        dirs.get(dirOf(tNorm))!.add(baseOf(tNorm))
      }),
      access: vi.fn(async (path: string) => {
        const norm = path.replace(/\\/g, '/')
        if (!files.has(norm) && !dirs.has(norm))
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      }),
      stat: vi.fn(async (path: string) => {
        const norm = path.replace(/\\/g, '/')
        const buf = files.get(norm)
        if (!buf) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        return { size: buf.length }
      }),
      readdir
    }
  }

  const electronMock = {
    app: {
      getPath: vi.fn((key: string) => (key === 'home' ? '/home' : '/appdata')),
      setPath: vi.fn(),
      // Never resolve in tests — keeps createWindow() and other ready-side
      // effects from running. We only care about the synchronous IPC
      // handler registrations at module load.
      whenReady: vi.fn(() => new Promise(() => undefined)),
      on: vi.fn(),
      getVersion: vi.fn(() => '0.0.0-test')
    },
    shell: { openExternal: vi.fn() },
    BrowserWindow: vi.fn(),
    ipcMain: {
      handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
        handlers.set(channel, fn)
      }),
      on: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
        listeners.set(channel, fn)
      })
    },
    dialog: {
      showOpenDialog: vi.fn(async (opts: { properties?: string[] }) => {
        if (opts.properties?.includes('openDirectory')) {
          return {
            canceled: dialogReplies.openDirectory == null,
            filePaths: dialogReplies.openDirectory ? [dialogReplies.openDirectory] : []
          }
        }
        return {
          canceled: dialogReplies.openFile.length === 0,
          filePaths: [...dialogReplies.openFile]
        }
      }),
      showSaveDialog: vi.fn(async () => ({
        canceled: dialogReplies.saveFile == null,
        filePath: dialogReplies.saveFile ?? undefined
      }))
    },
    screen: {}
  }

  // Local module mocks
  const settingsManager = { load: vi.fn(async () => ({})), save: vi.fn(async () => undefined) }
  const hybindex = {
    buildIndex: vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({
      libraryPath: '/lib',
      builtAt: 'now'
    })),
    loadIndex: vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => null),
    saveIndex: vi.fn<(...a: unknown[]) => Promise<void>>(async () => undefined),
    getIndexStatus: vi.fn<(...a: unknown[]) => Promise<{ exists: boolean; builtAt?: string }>>(
      async () => ({ exists: false })
    ),
    deleteIndex: vi.fn<(...a: unknown[]) => Promise<void>>(async () => undefined)
  }
  const libraryPath = { resolveLibraryPath: vi.fn(async (p: string) => p + '/world/xml') }

  const musicMetadata = {
    parseBuffer: vi.fn(async () => ({
      common: { title: 't', artist: 'a', genre: ['rock'], album: 'al' },
      format: { duration: 60, bitrate: 128000, sampleRate: 44100, numberOfChannels: 2 },
      native: {}
    }))
  }
  const archiver = vi.fn(() => {
    const events: Record<string, ((...a: unknown[]) => void)[]> = {}
    return {
      on: (ev: string, cb: (...a: unknown[]) => void) => {
        ;(events[ev] ??= []).push(cb)
      },
      pipe: () => undefined,
      append: () => undefined,
      file: () => undefined,
      finalize: () => undefined
    }
  })
  const childProcess = {
    execFile: vi.fn((_cmd: string, _args: string[], cb?: (e: Error | null) => void) => {
      cb?.(null)
      return {} as never
    }),
    spawn: vi.fn(() => ({ unref: vi.fn() }))
  }
  const electronToolkit = {
    electronApp: { setAppUserModelId: vi.fn() },
    optimizer: { watchWindowShortcuts: vi.fn() },
    is: { dev: false }
  }
  const dalib = {
    DataArchive: {
      fromBuffer: vi.fn((buf: Uint8Array) => {
        // The test seeds entries via mockResolvedValueOnce.
        const stub = (
          electronMock.app.getPath as {
            _archive?: {
              entries: { entryName: string; fileSize: number; toUint8Array: () => Uint8Array }[]
            }
          }
        )._archive
        return {
          entries: stub?.entries ?? [],
          getEntryBuffer: () => buf
        }
      })
    }
  }

  return {
    handlers,
    listeners,
    files,
    dirs,
    dialogReplies,
    electronMock,
    fsMock,
    settingsManager,
    hybindex,
    libraryPath,
    musicMetadata,
    archiver,
    childProcess,
    electronToolkit,
    dalib
  }
})

vi.mock('electron', () => electronMock)
vi.mock('fs', () => fsMock)
vi.mock('@eriscorp/hybindex-ts', () => hybindex)
vi.mock('../settingsManager', () => ({
  createSettingsManager: () => settingsManager
}))
vi.mock('../libraryPath', () => libraryPath)
vi.mock('music-metadata', () => musicMetadata)
vi.mock('archiver', () => ({ default: archiver }))
vi.mock('child_process', () => childProcess)
vi.mock('@electron-toolkit/utils', () => electronToolkit)
vi.mock('@eriscorp/dalib-ts', () => dalib)

// ── Helpers ───────────────────────────────────────────────────────────────────

const fakeEvent = { sender: { send: vi.fn() } }
function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`No handler registered for ${channel}`)
  return Promise.resolve(fn(fakeEvent, ...args)) as Promise<T>
}

function reset() {
  files.clear()
  dirs.clear()
  dirs.set('/', new Set())
  dialogReplies.openFile = []
  dialogReplies.openDirectory = null
  dialogReplies.saveFile = null
  vi.clearAllMocks()
}

// ── Setup: import index.ts to register handlers ───────────────────────────────

beforeAll(async () => {
  const indexModule = await import('../index')
  // Wide-open root for the in-memory test filesystem. assertInsideAnyRoot
  // accepts every absolute path when '/' is in the allowed set, which lets
  // existing handler tests keep using synthetic paths. Phase 3 dedicated
  // negative tests override this per-case to verify rejection works.
  indexModule.ctx.blessedRoots.add('/')
})

beforeEach(() => {
  reset()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('IPC channel registration', () => {
  it('registers every preload-declared channel as either ipcMain.handle or ipcMain.on', () => {
    // Window controls go via ipcMain.on; everything else via ipcMain.handle.
    expect(listeners.has('minimize-window')).toBe(true)
    expect(listeners.has('maximize-window')).toBe(true)
    expect(listeners.has('close-window')).toBe(true)
    expect(handlers.size).toBeGreaterThanOrEqual(60)
  })
})

describe('settings handlers', () => {
  it('settings:load delegates to the settings manager', async () => {
    settingsManager.load.mockResolvedValueOnce({ libraries: ['libA'], mapDirectories: [] })
    const result = await invoke('settings:load')
    expect(result).toEqual({ libraries: ['libA'], mapDirectories: [] })
  })

  it('settings:save forwards the payload to the settings manager', async () => {
    await invoke('settings:save', { libraries: ['x'], mapDirectories: [] })
    expect(settingsManager.save).toHaveBeenCalledWith({ libraries: ['x'], mapDirectories: [] })
  })

  it('get-user-data-path returns a non-empty settings path string', async () => {
    const path = await invoke<string>('get-user-data-path')
    expect(typeof path).toBe('string')
    expect(path.length).toBeGreaterThan(0)
  })
})

describe('dialog handlers', () => {
  it('dialog:openFile returns the first selected path', async () => {
    dialogReplies.openFile = ['/u/file.txt']
    expect(await invoke('dialog:openFile')).toBe('/u/file.txt')
  })

  it('dialog:openFile returns null when cancelled', async () => {
    dialogReplies.openFile = []
    expect(await invoke('dialog:openFile')).toBeNull()
  })

  it('dialog:openDirectory returns the selected directory or null', async () => {
    dialogReplies.openDirectory = '/u/dir'
    expect(await invoke('dialog:openDirectory')).toBe('/u/dir')
    dialogReplies.openDirectory = null
    expect(await invoke('dialog:openDirectory')).toBeNull()
  })

  it('dialog:saveFile returns the chosen output path', async () => {
    dialogReplies.saveFile = '/u/out.txt'
    expect(await invoke('dialog:saveFile')).toBe('/u/out.txt')
  })
})

describe('fs handlers', () => {
  it('fs:readFile returns the binary contents at the given path', async () => {
    files.set('/x/data.bin', Buffer.from([1, 2, 3]))
    const result = await invoke<Buffer>('fs:readFile', '/x/data.bin')
    expect(Buffer.from(result).toString('hex')).toBe('010203')
  })

  it('fs:writeFile writes text content to disk', async () => {
    await invoke('fs:writeFile', '/dir/out.txt', 'hello')
    expect(files.get('/dir/out.txt')?.toString('utf-8')).toBe('hello')
  })

  it('fs:writeBytes writes a Uint8Array to disk', async () => {
    await invoke('fs:writeBytes', '/dir/out.bin', new Uint8Array([0xff, 0x00]))
    expect(files.get('/dir/out.bin')?.toString('hex')).toBe('ff00')
  })

  it('fs:exists returns true for existing files and false otherwise', async () => {
    files.set('/x/y.txt', Buffer.from('hi'))
    expect(await invoke('fs:exists', '/x/y.txt')).toBe(true)
    expect(await invoke('fs:exists', '/x/missing.txt')).toBe(false)
  })

  it('fs:listDir reports name + isDirectory for each entry', async () => {
    files.set('/x/a.txt', Buffer.from('a'))
    files.set('/x/b.txt', Buffer.from('b'))
    const entries = await invoke<{ name: string; isDirectory: boolean }[]>('fs:listDir', '/x')
    const names = entries.map((e) => e.name).sort()
    expect(names).toEqual(['a.txt', 'b.txt'])
    expect(entries.every((e) => !e.isDirectory)).toBe(true)
  })

  it('fs:ensureDir creates the directory recursively', async () => {
    await invoke('fs:ensureDir', '/deeply/nested/dir')
    expect(dirs.has('/deeply/nested/dir')).toBe(true)
  })

  it('fs:deleteFile removes the file', async () => {
    files.set('/x/gone.txt', Buffer.from('bye'))
    await invoke('fs:deleteFile', '/x/gone.txt')
    expect(files.has('/x/gone.txt')).toBe(false)
  })

  it('fs:copyFile creates the parent dir and duplicates the source', async () => {
    files.set('/src/file.txt', Buffer.from('content'))
    await invoke('fs:copyFile', '/src/file.txt', '/dst/file.txt')
    expect(files.get('/dst/file.txt')?.toString('utf-8')).toBe('content')
  })
})

describe('catalog handlers', () => {
  it('catalog:load returns parsed JSON from the standard catalog path', async () => {
    files.set(
      '/maps/map-catalog.json',
      Buffer.from(JSON.stringify({ 'lod00001.map': { name: 'Inn' } }), 'utf-8')
    )
    const data = await invoke<Record<string, { name: string }>>('catalog:load', '/maps')
    expect(data['lod00001.map'].name).toBe('Inn')
  })

  it('catalog:load returns {} when the catalog file does not exist', async () => {
    expect(await invoke('catalog:load', '/empty')).toEqual({})
  })

  it('catalog:load uses .creidhne path when directory is named "mapfiles"', async () => {
    files.set(
      '/world/.creidhne/map-catalog.json',
      Buffer.from(JSON.stringify({ 'lod00001.map': { notes: 'shared' } }), 'utf-8')
    )
    const data = await invoke<Record<string, { notes: string }>>('catalog:load', '/world/mapfiles')
    expect(data['lod00001.map'].notes).toBe('shared')
  })

  it('catalog:save writes JSON to the resolved catalog path', async () => {
    await invoke('catalog:save', '/maps', { 'lod00001.map': { name: 'A' } })
    const saved = JSON.parse(files.get('/maps/map-catalog.json')!.toString('utf-8'))
    expect(saved['lod00001.map'].name).toBe('A')
  })

  it('catalog:scan filters .map files only', async () => {
    files.set('/maps/lod00001.map', Buffer.alloc(100))
    files.set('/maps/lod00002-summer.map', Buffer.alloc(200))
    files.set('/maps/notes.txt', Buffer.from('ignored'))
    const result = await invoke<{ filename: string; sizeBytes: number }[]>('catalog:scan', '/maps')
    expect(result.map((e) => e.filename).sort()).toEqual(['lod00001.map', 'lod00002-summer.map'])
  })
})

describe('hybindex handlers', () => {
  it('index:read delegates to loadIndex', async () => {
    hybindex.loadIndex.mockResolvedValueOnce({ libraryPath: '/lib' })
    expect(await invoke('index:read', '/lib')).toEqual({ libraryPath: '/lib' })
  })

  it('index:build calls buildIndex then saveIndex with the result', async () => {
    const idx = { libraryPath: '/lib', builtAt: 't' }
    hybindex.buildIndex.mockResolvedValueOnce(idx)
    expect(await invoke('index:build', '/lib')).toBe(idx)
    // Path is normalized by assertInsideAnyRoot before being passed through;
    // on Windows this swaps slashes, so compare against the platform-normalized form.
    expect(hybindex.saveIndex).toHaveBeenCalledWith(pathNormalize('/lib'), idx)
  })

  it('index:status delegates to getIndexStatus', async () => {
    hybindex.getIndexStatus.mockResolvedValueOnce({ exists: true, builtAt: 'x' })
    expect(await invoke('index:status', '/lib')).toEqual({ exists: true, builtAt: 'x' })
  })

  it('index:delete delegates to deleteIndex', async () => {
    await invoke('index:delete', '/lib')
    expect(hybindex.deleteIndex).toHaveBeenCalledWith(pathNormalize('/lib'))
  })

  it('library:resolve delegates to resolveLibraryPath', async () => {
    expect(await invoke('library:resolve', '/picked')).toBe(pathNormalize('/picked') + '/world/xml')
  })
})

describe('prefab handlers', () => {
  it('prefab:list returns summaries for valid JSON files only', async () => {
    files.set(
      '/lib/world/.creidhne/prefabs/a.json',
      Buffer.from(
        JSON.stringify({ name: 'A', width: 5, height: 5, createdAt: 't', updatedAt: 't' }),
        'utf-8'
      )
    )
    files.set('/lib/world/.creidhne/prefabs/broken.json', Buffer.from('not json', 'utf-8'))
    const list = await invoke<{ filename: string; name: string }[]>('prefab:list', '/lib/world/xml')
    expect(list.map((p) => p.filename)).toEqual(['a.json'])
    expect(list[0].name).toBe('A')
  })

  it('prefab:save writes JSON under <library>/../.creidhne/prefabs', async () => {
    await invoke('prefab:save', '/lib/world/xml', 'foo.json', { name: 'foo' })
    expect(files.has('/lib/world/.creidhne/prefabs/foo.json')).toBe(true)
  })

  it('prefab:load reads a previously-saved prefab', async () => {
    files.set(
      '/lib/world/.creidhne/prefabs/foo.json',
      Buffer.from(JSON.stringify({ name: 'foo' }), 'utf-8')
    )
    const data = await invoke<{ name: string }>('prefab:load', '/lib/world/xml', 'foo.json')
    expect(data.name).toBe('foo')
  })

  it('prefab:delete removes the file', async () => {
    files.set('/lib/world/.creidhne/prefabs/foo.json', Buffer.from('{}', 'utf-8'))
    await invoke('prefab:delete', '/lib/world/xml', 'foo.json')
    expect(files.has('/lib/world/.creidhne/prefabs/foo.json')).toBe(false)
  })

  it('prefab:save rejects a traversal in filename', async () => {
    await expect(
      invoke('prefab:save', '/lib/world/xml', '../../escape.json', { x: 1 })
    ).rejects.toThrow(/Path traversal/)
  })

  it('prefab:load rejects a traversal in filename', async () => {
    await expect(invoke('prefab:load', '/lib/world/xml', '../boom.json')).rejects.toThrow(
      /Path traversal/
    )
  })

  it('prefab:rename rejects a traversal in either name', async () => {
    await expect(
      invoke('prefab:rename', '/lib/world/xml', 'old.json', '../escape.json')
    ).rejects.toThrow(/Path traversal/)
    await expect(
      invoke('prefab:rename', '/lib/world/xml', '../old.json', 'new.json')
    ).rejects.toThrow(/Path traversal/)
  })

  it('prefab:rename moves the file to the new name', async () => {
    files.set('/lib/world/.creidhne/prefabs/old.json', Buffer.from('{}', 'utf-8'))
    await invoke('prefab:rename', '/lib/world/xml', 'old.json', 'new.json')
    expect(files.has('/lib/world/.creidhne/prefabs/old.json')).toBe(false)
    expect(files.has('/lib/world/.creidhne/prefabs/new.json')).toBe(true)
  })
})

describe('asset pack handlers', () => {
  it('pack:scan returns only valid pack manifests', async () => {
    files.set(
      '/p/a.json',
      Buffer.from(JSON.stringify({ pack_id: 'a', content_type: 'ability_icons' }), 'utf-8')
    )
    files.set('/p/incomplete.json', Buffer.from(JSON.stringify({ pack_id: 'b' }), 'utf-8')) // no content_type
    const list = await invoke<Array<{ filename: string }>>('pack:scan', '/p')
    expect(list.map((p) => p.filename)).toEqual(['a.json'])
  })

  it('pack:save writes the JSON manifest', async () => {
    await invoke('pack:save', '/p/x.json', { pack_id: 'x', content_type: 'ability_icons' })
    const saved = JSON.parse(files.get('/p/x.json')!.toString('utf-8'))
    expect(saved.pack_id).toBe('x')
  })

  it('pack:load reads back a saved manifest', async () => {
    files.set('/p/x.json', Buffer.from(JSON.stringify({ pack_id: 'x' }), 'utf-8'))
    expect(await invoke<{ pack_id: string }>('pack:load', '/p/x.json')).toEqual({ pack_id: 'x' })
  })

  it('pack:addAsset copies the source PNG into the pack dir', async () => {
    files.set('/src/icon.png', Buffer.from('PNGDATA'))
    await invoke('pack:addAsset', '/pack', '/src/icon.png', 'skill_0001.png')
    expect(files.get('/pack/skill_0001.png')?.toString('utf-8')).toBe('PNGDATA')
  })

  it('pack:removeAsset deletes silently when the file is gone', async () => {
    await expect(invoke('pack:removeAsset', '/pack', 'gone.png')).resolves.toBeUndefined()
  })

  it('pack:addAsset rejects a traversal in targetFilename', async () => {
    files.set('/src/icon.png', Buffer.from('PNGDATA'))
    await expect(
      invoke('pack:addAsset', '/pack', '/src/icon.png', '../escape.png')
    ).rejects.toThrow(/Path traversal/)
    expect(files.has('/escape.png')).toBe(false)
  })

  it('pack:removeAsset rejects a traversal in filename', async () => {
    await expect(invoke('pack:removeAsset', '/pack', '../../boom.png')).rejects.toThrow(
      /Path traversal/
    )
  })
})

describe('palette handlers', () => {
  it('palette:scan returns only valid palette files, sorted by id', async () => {
    files.set(
      '/p/_palettes/zeta.json',
      Buffer.from(JSON.stringify({ id: 'zeta', name: 'Z', entries: [1, 2] }), 'utf-8')
    )
    files.set(
      '/p/_palettes/alpha.json',
      Buffer.from(JSON.stringify({ id: 'alpha', name: 'A', entries: [1] }), 'utf-8')
    )
    files.set('/p/_palettes/broken.json', Buffer.from('not json', 'utf-8'))
    const list = await invoke<Array<{ id: string; entryCount: number }>>('palette:scan', '/p')
    expect(list.map((p) => p.id)).toEqual(['alpha', 'zeta'])
    expect(list[0].entryCount).toBe(1)
    expect(list[1].entryCount).toBe(2)
  })

  it('palette:calibrationLoad returns {} for missing calibration files', async () => {
    expect(await invoke('palette:calibrationLoad', '/p', 'fire')).toEqual({})
  })

  it('palette:calibrationSave writes JSON under _calibrations/', async () => {
    await invoke('palette:calibrationSave', '/p', 'fire', { source: 'x' })
    expect(files.has('/p/_calibrations/fire.json')).toBe(true)
  })

  it('palette:calibrationSave rejects a traversal in paletteId', async () => {
    await expect(
      invoke('palette:calibrationSave', '/p', '../boom', { source: 'x' })
    ).rejects.toThrow(/Path traversal/)
  })

  it('palette:calibrationLoad rejects a traversal in paletteId', async () => {
    await expect(invoke('palette:calibrationLoad', '/p', '../../etc/passwd')).rejects.toThrow(
      /Path traversal/
    )
  })

  it('frame:scan returns sorted PNG filenames from _frames/', async () => {
    files.set('/p/_frames/b.png', Buffer.alloc(1))
    files.set('/p/_frames/a.png', Buffer.alloc(1))
    files.set('/p/_frames/note.txt', Buffer.alloc(1))
    expect(await invoke('frame:scan', '/p')).toEqual(['a.png', 'b.png'])
  })
})

describe('theme handlers', () => {
  it('theme:list ignores malformed JSON files', async () => {
    files.set(
      '/appdata/Erisco/Taliesin/themes/good.json',
      Buffer.from(JSON.stringify({ name: 'Good' }), 'utf-8')
    )
    files.set('/appdata/Erisco/Taliesin/themes/bad.json', Buffer.from('not json', 'utf-8'))
    const list = await invoke<{ filename: string; name: string }[]>('theme:list')
    expect(list.map((t) => t.filename)).toEqual(['good.json'])
  })

  it('theme:save writes JSON under the themes dir', async () => {
    await invoke('theme:save', 'desert.json', { name: 'Desert' })
    expect(files.has('/appdata/Erisco/Taliesin/themes/desert.json')).toBe(true)
  })

  it('theme:delete removes the file', async () => {
    files.set('/appdata/Erisco/Taliesin/themes/x.json', Buffer.from('{}'))
    await invoke('theme:delete', 'x.json')
    expect(files.has('/appdata/Erisco/Taliesin/themes/x.json')).toBe(false)
  })

  it('theme:save rejects a traversal in filename', async () => {
    await expect(invoke('theme:save', '../../boom.json', { name: 'X' })).rejects.toThrow(
      /Path traversal/
    )
  })

  it('theme:delete rejects a traversal in filename', async () => {
    await expect(invoke('theme:delete', '../boom.json')).rejects.toThrow(/Path traversal/)
  })
})

describe('music:deploy-pack — destination-clearing hotspot (handlers.ts musicDeployPack)', () => {
  const pack = {
    id: 'p1',
    name: 'P',
    tracks: [
      { musicId: 1, sourceFile: 'song1.mp3' },
      { musicId: 2, sourceFile: 'song2.mp3' }
    ]
  }

  it('clears top-level files in the destination before deploying', async () => {
    files.set('/dest/leftover.mus', Buffer.from('OLD'))
    files.set('/dest/another.mus', Buffer.from('OLD'))
    files.set('/lib/song1.mp3', Buffer.from('S1'))
    files.set('/lib/song2.mp3', Buffer.from('S2'))

    await invoke('music:deploy-pack', '/lib', pack, '/dest', null, 64, 22050)

    expect(files.has('/dest/leftover.mus')).toBe(false)
    expect(files.has('/dest/another.mus')).toBe(false)
  })

  it('preserves subdirectories in the destination', async () => {
    files.set('/dest/leftover.mus', Buffer.from('OLD'))
    files.set('/dest/sub/keepme.mus', Buffer.from('KEEP'))
    files.set('/lib/song1.mp3', Buffer.from('S1'))
    files.set('/lib/song2.mp3', Buffer.from('S2'))

    await invoke('music:deploy-pack', '/lib', pack, '/dest', null, 64, 22050)

    expect(files.has('/dest/leftover.mus')).toBe(false)
    expect(files.has('/dest/sub/keepme.mus')).toBe(true)
  })

  it('writes the sidecar manifest with packId and track summaries', async () => {
    files.set('/lib/song1.mp3', Buffer.from('S1'))
    files.set('/lib/song2.mp3', Buffer.from('S2'))

    await invoke('music:deploy-pack', '/lib', pack, '/dest', null, 64, 22050)

    const manifest = JSON.parse(files.get('/dest/music-pack.json')!.toString('utf-8'))
    expect(manifest.packId).toBe('p1')
    expect(manifest.tracks).toEqual([
      { id: 1, sourceFile: 'song1.mp3' },
      { id: 2, sourceFile: 'song2.mp3' }
    ])
    expect(typeof manifest.exportedAt).toBe('string')
  })

  it('clears the destination when the pack has zero tracks (no sources to validate)', async () => {
    // Zero tracks ⇒ nothing to validate ⇒ proceed with clear+manifest.
    files.set('/dest/leftover.mus', Buffer.from('OLD'))
    await invoke('music:deploy-pack', '/lib', { ...pack, tracks: [] }, '/dest', null, 64, 22050)
    expect(files.has('/dest/leftover.mus')).toBe(false)
  })

  it('throws without touching the destination when a source file is missing', async () => {
    files.set('/dest/leftover.mus', Buffer.from('KEEP_ME'))
    files.set('/lib/song1.mp3', Buffer.from('S1'))
    // song2.mp3 deliberately missing
    await expect(
      invoke('music:deploy-pack', '/lib', pack, '/dest', null, 64, 22050)
    ).rejects.toThrow(/song2\.mp3/)
    expect(files.has('/dest/leftover.mus')).toBe(true)
    expect(files.has('/dest/music-pack.json')).toBe(false)
    expect(childProcess.execFile).not.toHaveBeenCalled()
  })

  it('rejects a traversal in track.sourceFile without touching the destination', async () => {
    files.set('/dest/leftover.mus', Buffer.from('KEEP_ME'))
    const evilPack = { ...pack, tracks: [{ musicId: 1, sourceFile: '../../etc/passwd' }] }
    await expect(
      invoke('music:deploy-pack', '/lib', evilPack, '/dest', null, 64, 22050)
    ).rejects.toThrow(/Path traversal/)
    expect(files.has('/dest/leftover.mus')).toBe(true)
  })

  it('throws without touching the destination when the source library directory is empty', async () => {
    files.set('/dest/leftover.mus', Buffer.from('KEEP_ME'))
    // /lib has no source files at all
    await expect(
      invoke('music:deploy-pack', '/lib', pack, '/dest', null, 64, 22050)
    ).rejects.toThrow(/song1\.mp3/)
    expect(files.has('/dest/leftover.mus')).toBe(true)
    expect(files.has('/dest/music-pack.json')).toBe(false)
  })

  it('re-encodes through ffmpeg when the source bitrate/sample-rate does not match', async () => {
    // Default parseBuffer mock returns 128000 bps / 44100 Hz; deploy targets
    // 96 kbps / 44100 Hz → bitrate mismatch ⇒ ffmpeg fallback.
    files.set('/lib/song1.mp3', Buffer.from('S1'))
    files.set('/lib/song2.mp3', Buffer.from('S2'))

    await invoke('music:deploy-pack', '/lib', pack, '/dest', '/usr/bin/ffmpeg', 96, 44100)

    expect(childProcess.execFile).toHaveBeenCalledTimes(2)
    const [cmd, args] = childProcess.execFile.mock.calls[0]
    expect(cmd).toBe('/usr/bin/ffmpeg')
    expect(args).toContain('96k')
    expect(args).toContain('44100')
    expect(args).toContain('libmp3lame')
  })

  it('fast-paths a .mp3 source already at the target bitrate + sample rate via copyFile', async () => {
    files.set('/lib/song1.mp3', Buffer.from('S1'))
    files.set('/lib/song2.mp3', Buffer.from('S2'))
    musicMetadata.parseBuffer.mockImplementation(async () => ({
      common: { title: 't', artist: 'a', genre: ['rock'], album: 'al' },
      format: { duration: 60, bitrate: 64000, sampleRate: 22050, numberOfChannels: 2 },
      native: {}
    }))

    await invoke('music:deploy-pack', '/lib', pack, '/dest', '/usr/bin/ffmpeg', 64, 22050)

    expect(childProcess.execFile).not.toHaveBeenCalled()
    expect(files.get('/dest/1.mus')?.toString('utf-8')).toBe('S1')
    expect(files.get('/dest/2.mus')?.toString('utf-8')).toBe('S2')
  })

  it('falls back to ffmpeg when only the sample rate matches', async () => {
    files.set('/lib/song1.mp3', Buffer.from('S1'))
    files.set('/lib/song2.mp3', Buffer.from('S2'))
    musicMetadata.parseBuffer.mockImplementation(async () => ({
      common: { title: 't', artist: 'a', genre: ['rock'], album: 'al' },
      format: { duration: 60, bitrate: 128000, sampleRate: 22050, numberOfChannels: 2 }, // 128 kbps ≠ 64 kbps
      native: {}
    }))

    await invoke('music:deploy-pack', '/lib', pack, '/dest', '/usr/bin/ffmpeg', 64, 22050)

    expect(childProcess.execFile).toHaveBeenCalledTimes(2)
  })

  it('falls back to ffmpeg when music-metadata throws (corrupt mp3 → safe re-encode)', async () => {
    files.set('/lib/song1.mp3', Buffer.from('S1'))
    files.set('/lib/song2.mp3', Buffer.from('S2'))
    musicMetadata.parseBuffer.mockImplementation(async () => {
      throw new Error('parse error')
    })

    await invoke('music:deploy-pack', '/lib', pack, '/dest', '/usr/bin/ffmpeg', 64, 22050)

    expect(childProcess.execFile).toHaveBeenCalledTimes(2)
  })

  it('skips the metadata check entirely for non-mp3 sources', async () => {
    files.set('/lib/song1.ogg', Buffer.from('S1'))
    files.set('/lib/song2.wav', Buffer.from('S2'))
    const oggPack = {
      ...pack,
      tracks: [
        { musicId: 1, sourceFile: 'song1.ogg' },
        { musicId: 2, sourceFile: 'song2.wav' }
      ]
    }

    await invoke('music:deploy-pack', '/lib', oggPack, '/dest', '/usr/bin/ffmpeg', 64, 22050)

    expect(musicMetadata.parseBuffer).not.toHaveBeenCalled()
    expect(childProcess.execFile).toHaveBeenCalledTimes(2)
  })

  it('falls back to "ffmpeg" on PATH when ffmpegPath is null', async () => {
    files.set('/lib/song1.mp3', Buffer.from('S1'))
    const onePack = { ...pack, tracks: [{ musicId: 7, sourceFile: 'song1.mp3' }] }
    await invoke('music:deploy-pack', '/lib', onePack, '/dest', null, 64, 22050)
    const [cmd] = childProcess.execFile.mock.calls[0]
    expect(cmd).toBe('ffmpeg')
  })
})

describe('music:scan', () => {
  it('returns [] when the directory does not exist (graceful degrade)', async () => {
    expect(await invoke('music:scan', '/does/not/exist')).toEqual([])
  })

  it('returns [] for an empty directory', async () => {
    dirs.set('/empty', new Set())
    expect(await invoke('music:scan', '/empty')).toEqual([])
  })

  it('discovers music files recursively with sizes', async () => {
    files.set('/lib/a.mp3', Buffer.from('AAA'))
    files.set('/lib/sub/b.ogg', Buffer.from('BBBB'))
    files.set('/lib/skip.txt', Buffer.from('NOPE'))
    const result = (await invoke('music:scan', '/lib')) as { filename: string; sizeBytes: number }[]
    expect(result.sort((x, y) => x.filename.localeCompare(y.filename))).toEqual([
      { filename: 'a.mp3', sizeBytes: 3 },
      { filename: 'sub/b.ogg', sizeBytes: 4 }
    ])
  })
})

describe('bik:convert (handlers.ts bikConvert)', () => {
  const bytes = new Uint8Array([0x42, 0x49, 0x4b, 0x69, 0xde, 0xad, 0xbe, 0xef])

  it('runs ffmpeg with libx264 + aac when no cached mp4 exists', async () => {
    await invoke('bik:convert', bytes, '/usr/bin/ffmpeg', '/cache/bik')

    expect(childProcess.execFile).toHaveBeenCalledTimes(1)
    const [cmd, args] = childProcess.execFile.mock.calls[0]
    expect(cmd).toBe('/usr/bin/ffmpeg')
    expect(args).toContain('libx264')
    expect(args).toContain('aac')
    expect(args).toContain('+faststart')
    // Last arg is the output mp4 path inside the cache dir.
    const outArg = (args as string[])[args.length - 1].replace(/\\/g, '/')
    expect(outArg).toMatch(/^\/cache\/bik\/[a-f0-9]{32}\.mp4$/)
  })

  it('skips ffmpeg when the cached mp4 already exists', async () => {
    // Pre-seed the cache with the deterministic hashed path. Run a first
    // conversion to learn the path, then reset the spy and re-invoke.
    await invoke('bik:convert', bytes, null, '/cache/bik')
    const [, firstArgs] = childProcess.execFile.mock.calls[0]
    const cachedMp4 = (firstArgs as string[])[firstArgs.length - 1]
    files.set(cachedMp4.replace(/\\/g, '/'), Buffer.from('FAKE_MP4'))
    childProcess.execFile.mockClear()

    const out = await invoke('bik:convert', bytes, null, '/cache/bik')
    expect(out).toBe(cachedMp4)
    expect(childProcess.execFile).not.toHaveBeenCalled()
  })

  it('returns the same cached path for identical input bytes', async () => {
    const out1 = await invoke<string>('bik:convert', bytes, null, '/cache/bik')
    const out2 = await invoke<string>('bik:convert', bytes, null, '/cache/bik')
    expect(out1).toBe(out2)
  })

  it('uses a different cache path for different input bytes', async () => {
    const other = new Uint8Array([0x42, 0x49, 0x4b, 0x69, 0x01, 0x02, 0x03, 0x04])
    const a = await invoke<string>('bik:convert', bytes, null, '/cache/bik')
    const b = await invoke<string>('bik:convert', other, null, '/cache/bik')
    expect(a).not.toBe(b)
  })

  it('falls back to "ffmpeg" on PATH when ffmpegPath is null', async () => {
    await invoke('bik:convert', bytes, null, '/cache/bik')
    expect(childProcess.execFile.mock.calls[0][0]).toBe('ffmpeg')
  })

  it('removes the temp .bik even if ffmpeg fails (mp4 stays absent)', async () => {
    childProcess.execFile.mockImplementationOnce(
      (_cmd: string, _args: string[], cb?: (e: Error | null) => void) => {
        cb?.(new Error('ffmpeg failed'))
        return {} as never
      }
    )
    await expect(invoke('bik:convert', bytes, null, '/cache/bik')).rejects.toThrow()
    // No leftover .bik or .mp4 in the cache.
    const cacheKeys = [...files.keys()].filter((k) => k.startsWith('/cache/bik/'))
    const biks = cacheKeys.filter((k) => k.endsWith('.bik'))
    const mp4s = cacheKeys.filter((k) => k.endsWith('.mp4'))
    expect(biks).toEqual([])
    expect(mp4s).toEqual([])
  })
})

describe('music metadata + packs', () => {
  it('music:metadata:load returns {} when the file does not exist', async () => {
    expect(await invoke('music:metadata:load', '/lib')).toEqual({})
  })

  it('music:metadata:save persists JSON to <dir>/music-library.json', async () => {
    await invoke('music:metadata:save', '/lib', { 'a.mp3': { name: 'A' } })
    const saved = JSON.parse(files.get('/lib/music-library.json')!.toString('utf-8'))
    expect(saved['a.mp3'].name).toBe('A')
  })

  it('music:packs:load returns [] when the file does not exist', async () => {
    expect(await invoke('music:packs:load', '/lib')).toEqual([])
  })

  it('music:packs:save persists JSON to <dir>/music-packs.json', async () => {
    await invoke('music:packs:save', '/lib', [{ id: 'x' }])
    const saved = JSON.parse(files.get('/lib/music-packs.json')!.toString('utf-8'))
    expect(saved[0].id).toBe('x')
  })
})

// ── Category-A path-traversal rejection ──────────────────────────────────────
//
// Each handler that takes a renderer-supplied absolute path validates it
// against ctx.roots. This block narrows the allowed roots to /library, then
// invokes every channel with a path under /escape and asserts it's denied.

describe('Category-A path-traversal rejection', () => {
  // Channels that reject by throwing when the path is outside allowed roots.
  // First arg of every entry is the path that should be rejected.
  const throwingCases: [string, unknown[]][] = [
    ['fs:readFile', ['/escape/x']],
    ['fs:listDir', ['/escape']],
    ['fs:copyFile', ['/escape/x', '/library/x']],
    ['fs:writeFile', ['/escape/x', 'data']],
    ['fs:writeBytes', ['/escape/x', new Uint8Array(0)]],
    ['fs:ensureDir', ['/escape/dir']],
    ['fs:deleteFile', ['/escape/x']],
    ['fs:listArchive', ['/escape/a.dat']],
    ['catalog:save', ['/escape/maps', {}]],
    ['catalog:scan', ['/escape/maps']],
    ['music:metadata:save', ['/escape/music', {}]],
    ['music:packs:save', ['/escape/music', []]],
    ['music:packs:load', ['/escape/music']],
    ['music:metadata:load', ['/escape/music']],
    [
      'music:deploy-pack',
      ['/escape/lib', { tracks: [], id: 'p', name: 'p' }, '/library/dst', null, 64, 22050]
    ],
    ['sfx:list', ['/escape/client']],
    ['sfx:readEntry', ['/escape/client', 'a.mp3']],
    ['sfx:index:load', ['/escape/lib']],
    ['sfx:index:save', ['/escape/lib', {}]],
    ['bik:convert', [new Uint8Array(0), null, '/escape/cache']],
    ['index:read', ['/escape/lib']],
    ['index:build', ['/escape/lib']],
    ['index:status', ['/escape/lib']],
    ['index:delete', ['/escape/lib']],
    ['library:resolve', ['/escape/picked']],
    ['prefab:load', ['/escape/lib', 'a.json']],
    ['prefab:save', ['/escape/lib', 'a.json', {}]],
    ['prefab:delete', ['/escape/lib', 'a.json']],
    ['prefab:rename', ['/escape/lib', 'a.json', 'b.json']],
    ['pack:load', ['/escape/p.json']],
    ['pack:save', ['/escape/p.json', {}]],
    ['pack:delete', ['/escape/p.json']],
    ['pack:addAsset', ['/escape/pack', '/library/a.png', 'b.png']],
    ['pack:removeAsset', ['/escape/pack', 'a.png']],
    ['pack:compile', ['/escape/pack', {}, [], '/library/out.datf']],
    ['palette:load', ['/escape/p.json']],
    ['palette:save', ['/escape/p.json', {}]],
    ['palette:calibrationLoad', ['/escape/pack', 'fire']],
    ['palette:calibrationSave', ['/escape/pack', 'fire', {}]],
    ['frame:scan', ['/escape/pack']],
    ['catalog:load', ['/escape/maps']],
    ['prefab:list', ['/escape/lib']]
  ]

  // Channels that swallow root-rejection errors and return an "empty" shape
  // (matching their existing behaviour for missing/unreadable directories).
  // The bad path can't be read, but the renderer gets a non-throwing answer.
  const swallowingCases: [string, unknown[], unknown][] = [
    ['fs:exists', ['/escape/x'], false],
    ['music:scan', ['/escape/music'], []],
    ['music:client:scan', ['/escape/client'], []],
    ['music:readFileMeta', ['/escape/song.mp3'], null],
    ['palette:scan', ['/escape/pack'], []],
    ['palette:delete', ['/escape/p.json'], undefined],
    ['pack:scan', ['/escape/packs'], []]
  ]

  let savedBlessed: Set<string>
  let indexModule: typeof import('../index')

  beforeEach(async () => {
    indexModule = await import('../index')
    savedBlessed = new Set(indexModule.ctx.blessedRoots)
    indexModule.ctx.blessedRoots.clear()
    indexModule.ctx.blessedRoots.add('/library')
  })

  afterEach(() => {
    indexModule.ctx.blessedRoots.clear()
    savedBlessed.forEach((r) => indexModule.ctx.blessedRoots.add(r))
  })

  it.each(throwingCases)(
    '%s rejects an absolute path outside allowed roots',
    async (channel, args) => {
      await expect(invoke(channel, ...args)).rejects.toThrow()
    }
  )

  it.each(swallowingCases)(
    '%s swallows root rejection and returns the empty shape',
    async (channel, args, expected) => {
      expect(await invoke(channel, ...args)).toEqual(expected)
    }
  )

  it('tileScan:analyze skips disallowed dirs and returns no aggregated tile data', async () => {
    const result = (await invoke('tileScan:analyze', ['/escape/maps'])) as {
      fileCount: number
      tileCount: number
    }
    expect(result.fileCount).toBe(0)
    expect(result.tileCount).toBe(0)
  })
})

// ── Dialog auto-bless integration ────────────────────────────────────────────

describe('Dialog auto-bless integration', () => {
  let savedBlessed: Set<string>
  let indexModule: typeof import('../index')

  beforeEach(async () => {
    indexModule = await import('../index')
    savedBlessed = new Set(indexModule.ctx.blessedRoots)
    indexModule.ctx.blessedRoots.clear()
    indexModule.ctx.blessedRoots.add('/library')
  })

  afterEach(() => {
    indexModule.ctx.blessedRoots.clear()
    savedBlessed.forEach((r) => indexModule.ctx.blessedRoots.add(r))
  })

  it('dialog:openFile blesses the picked file path so a subsequent fs:readFile succeeds', async () => {
    dialogReplies.openFile = ['/blessed/file.txt']
    files.set('/blessed/file.txt', Buffer.from('hello', 'utf-8'))

    // Without auto-bless this read would throw — /blessed is not under /library.
    const picked = await invoke('dialog:openFile')
    expect(picked).toBe('/blessed/file.txt')
    const buf = await invoke<Buffer>('fs:readFile', '/blessed/file.txt')
    expect(Buffer.from(buf).toString('utf-8')).toBe('hello')
  })

  it('dialog:openDirectory blesses the picked dir so files inside become readable', async () => {
    dialogReplies.openDirectory = '/blessed-dir'
    files.set('/blessed-dir/foo.txt', Buffer.from('x', 'utf-8'))

    expect(await invoke('dialog:openDirectory')).toBe('/blessed-dir')
    const buf = await invoke<Buffer>('fs:readFile', '/blessed-dir/foo.txt')
    expect(Buffer.from(buf).toString('utf-8')).toBe('x')
  })
})
