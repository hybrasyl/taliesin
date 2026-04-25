import { describe, it, expect, beforeEach, vi } from 'vitest'
import { join } from 'path'

// Hoisted in-memory fs mock so the module under test reads from this map
// instead of the real filesystem.
const { fsMock, files, errors } = vi.hoisted(() => {
  const files = new Map<string, string>()
  const errors = new Map<string, Error>()
  return {
    files,
    errors,
    fsMock: {
      promises: {
        readFile: vi.fn(async (path: string) => {
          if (errors.has(path)) throw errors.get(path)
          if (!files.has(path)) {
            const e: NodeJS.ErrnoException = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
            throw e
          }
          return files.get(path)!
        }),
        writeFile: vi.fn(async (path: string, content: string) => {
          if (errors.has(path)) throw errors.get(path)
          files.set(path, content)
        }),
        copyFile: vi.fn(async (from: string, to: string) => {
          if (errors.has(from)) throw errors.get(from)
          if (!files.has(from)) {
            const e: NodeJS.ErrnoException = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
            throw e
          }
          files.set(to, files.get(from)!)
        }),
        rename: vi.fn(async (from: string, to: string) => {
          if (errors.has(from)) throw errors.get(from)
          const v = files.get(from)
          if (v === undefined) {
            const e: NodeJS.ErrnoException = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
            throw e
          }
          files.delete(from)
          files.set(to, v)
        }),
        mkdir: vi.fn(async () => undefined)
      }
    }
  }
})

vi.mock('fs', () => fsMock)

// Import AFTER the mock so the module picks up the stubbed fs.
const { createSettingsManager } = await import('../settingsManager')

const USER_DATA = '/user/data'
const PRIMARY = join(USER_DATA, 'settings.json')
const BACKUP = join(USER_DATA, 'settings.bak.json')
const TMP = join(USER_DATA, 'settings.tmp.json')

const VALID_SETTINGS = {
  libraries: ['libA', 'libB'],
  activeLibrary: 'libA',
  mapDirectories: [{ path: '/maps', name: 'Maps' }],
  activeMapDirectory: '/maps',
  musicWorkingDirs: ['/music'],
  musEncodeKbps: 96,
  musEncodeSampleRate: 44100
}

beforeEach(() => {
  files.clear()
  errors.clear()
  vi.clearAllMocks()
  // posix-style join — runs on Windows host but settings paths are constructed with `path.join`
  // which returns whatever the platform's separator is; we don't assert on the exact slashes
  // because withDefaults/load only care about content, and writeFile/readFile compare by key.
  // We pre-fill the constants used in this test file by calling the SUT with the same userDataPath.
})

describe('createSettingsManager.load', () => {
  it('returns defaults when no settings file exists', async () => {
    const mgr = createSettingsManager(USER_DATA)
    const settings = await mgr.load()
    expect(settings.libraries).toEqual([])
    expect(settings.activeLibrary).toBeNull()
    expect(settings.mapDirectories).toEqual([])
    expect(settings.musicWorkingDirs).toEqual([])
    expect(settings.musEncodeKbps).toBe(64)
    expect(settings.musEncodeSampleRate).toBe(22050)
  })

  it('reads valid JSON from primary and applies defaults for missing fields', async () => {
    files.set(
      PRIMARY,
      JSON.stringify({
        libraries: ['libA'],
        mapDirectories: []
        // intentionally missing musEncodeKbps / musEncodeSampleRate
      })
    )
    const settings = await createSettingsManager(USER_DATA).load()
    expect(settings.libraries).toEqual(['libA'])
    expect(settings.musEncodeKbps).toBe(64) // default applied
    expect(settings.musEncodeSampleRate).toBe(22050)
    expect(settings.activeLibrary).toBeNull()
  })

  it('falls back to backup when primary is malformed JSON (recovery hotspot, lines 82–94)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    files.set(PRIMARY, '{not valid json')
    files.set(BACKUP, JSON.stringify(VALID_SETTINGS))

    const settings = await createSettingsManager(USER_DATA).load()
    expect(settings.libraries).toEqual(VALID_SETTINGS.libraries)
    expect(settings.activeLibrary).toBe('libA')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('settings.json unreadable'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Recovered settings from backup'))
    warn.mockRestore()
  })

  it('falls back to backup when primary fails the shape validator', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // libraries is not an array → validate() returns false
    files.set(PRIMARY, JSON.stringify({ libraries: 'not-an-array', mapDirectories: [] }))
    files.set(BACKUP, JSON.stringify(VALID_SETTINGS))

    const settings = await createSettingsManager(USER_DATA).load()
    expect(settings.libraries).toEqual(VALID_SETTINGS.libraries)
    warn.mockRestore()
  })

  it('returns defaults when both primary and backup are unreadable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    files.set(PRIMARY, '{broken')
    files.set(BACKUP, '{also broken')

    const settings = await createSettingsManager(USER_DATA).load()
    expect(settings.libraries).toEqual([])
    expect(settings.activeLibrary).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('No valid settings found'))
    warn.mockRestore()
  })

  it('persists the recovered backup to primary so the next load is fast', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    files.set(PRIMARY, '{broken')
    files.set(BACKUP, JSON.stringify(VALID_SETTINGS))

    const mgr = createSettingsManager(USER_DATA)
    await mgr.load()

    // Recovery save() flushes through the queue; let it settle.
    await new Promise((r) => setTimeout(r, 0))
    expect(fsMock.promises.writeFile).toHaveBeenCalledWith(TMP, expect.any(String), 'utf-8')
    warn.mockRestore()
  })

  it('drops malformed entries inside mapDirectories arrays', async () => {
    files.set(
      PRIMARY,
      JSON.stringify({
        libraries: [],
        mapDirectories: [
          { path: '/a', name: 'A' },
          { path: 123, name: 'bad' }, // wrong types — should be filtered
          null, // null entry — should be filtered
          { path: '/b', name: 'B' }
        ]
      })
    )
    const settings = await createSettingsManager(USER_DATA).load()
    expect(settings.mapDirectories).toEqual([
      { path: '/a', name: 'A' },
      { path: '/b', name: 'B' }
    ])
  })
})

describe('createSettingsManager.save', () => {
  it('writes to a tmp file then renames to primary (atomic write)', async () => {
    const mgr = createSettingsManager(USER_DATA)
    await mgr.save({
      libraries: ['x'],
      activeLibrary: 'x',
      mapDirectories: [],
      activeMapDirectory: null,
      musicWorkingDirs: [],
      musEncodeKbps: 64,
      musEncodeSampleRate: 22050
    })

    // tmp file no longer exists (renamed away), primary now contains the content
    expect(files.has(TMP)).toBe(false)
    expect(files.has(PRIMARY)).toBe(true)
    const written = JSON.parse(files.get(PRIMARY)!)
    expect(written.libraries).toEqual(['x'])
    expect(fsMock.promises.writeFile).toHaveBeenCalledWith(TMP, expect.any(String), 'utf-8')
    expect(fsMock.promises.rename).toHaveBeenCalledWith(TMP, PRIMARY)
  })

  it('copies primary→backup before each save (rotates backup forward)', async () => {
    files.set(PRIMARY, JSON.stringify({ libraries: ['old'], mapDirectories: [] }))
    const mgr = createSettingsManager(USER_DATA)
    await mgr.save({
      libraries: ['new'],
      activeLibrary: null,
      mapDirectories: [],
      activeMapDirectory: null,
      musicWorkingDirs: [],
      musEncodeKbps: 64,
      musEncodeSampleRate: 22050
    })

    expect(files.has(BACKUP)).toBe(true)
    expect(JSON.parse(files.get(BACKUP)!).libraries).toEqual(['old'])
    expect(JSON.parse(files.get(PRIMARY)!).libraries).toEqual(['new'])
  })

  it('does not throw when primary does not yet exist (first save scenario)', async () => {
    const mgr = createSettingsManager(USER_DATA)
    await expect(
      mgr.save({
        libraries: [],
        activeLibrary: null,
        mapDirectories: [],
        activeMapDirectory: null,
        musicWorkingDirs: [],
        musEncodeKbps: 64,
        musEncodeSampleRate: 22050
      })
    ).resolves.toBeUndefined()
    expect(files.has(PRIMARY)).toBe(true)
  })

  it('serializes concurrent saves through the internal queue (no interleaving)', async () => {
    const mgr = createSettingsManager(USER_DATA)
    const base = {
      activeLibrary: null,
      mapDirectories: [],
      activeMapDirectory: null,
      musicWorkingDirs: [],
      musEncodeKbps: 64,
      musEncodeSampleRate: 22050
    }
    // Kick off three concurrent saves. The queue chain should write them in
    // submission order even though they're awaited together.
    await Promise.all([
      mgr.save({ ...base, libraries: ['first'] }),
      mgr.save({ ...base, libraries: ['second'] }),
      mgr.save({ ...base, libraries: ['third'] })
    ])

    const writeCalls = fsMock.promises.writeFile.mock.calls.map(
      (args) => JSON.parse(args[1] as string).libraries[0]
    )
    expect(writeCalls).toEqual(['first', 'second', 'third'])
    expect(JSON.parse(files.get(PRIMARY)!).libraries).toEqual(['third'])
  })

  it('propagates errors when writeFile fails', async () => {
    const mgr = createSettingsManager(USER_DATA)
    errors.set(TMP, new Error('disk full'))
    await expect(
      mgr.save({
        libraries: [],
        activeLibrary: null,
        mapDirectories: [],
        activeMapDirectory: null,
        musicWorkingDirs: [],
        musEncodeKbps: 64,
        musEncodeSampleRate: 22050
      })
    ).rejects.toThrow(/disk full/)
  })
})
