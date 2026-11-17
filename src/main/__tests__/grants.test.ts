import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  GRANTS_FILENAME,
  emptyGrants,
  isGranted,
  loadOrMigrateGrants,
  measureExecutable,
  settingsDirPaths,
  snapshotGrants,
  verifyExecutable
} from '../grants'

let dir: string

beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'taliesin-grants-'))
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe('settingsDirPaths', () => {
  it('names every folder field once, and no program', () => {
    expect(
      settingsDirPaths({
        clientPath: '/c',
        brigidAssetsPath: '/b',
        libraries: ['/l1', '/l2'],
        activeLibrary: '/l1',
        mapDirectories: [{ path: '/m', name: 'M' }],
        activeMapDirectory: '/m2',
        musicLibraryPath: '/mu',
        musicWorkingDirs: ['/w'],
        activeMusicWorkingDir: '/w2',
        packDir: '/p',
        ffmpegPath: '/ffmpeg',
        companionPath: '/companion'
      }).sort()
    ).toEqual(['/b', '/c', '/l1', '/l2', '/m', '/m2', '/mu', '/p', '/w', '/w2'])
  })

  it('skips empty and absent fields', () => {
    expect(settingsDirPaths({ clientPath: '', packDir: undefined })).toEqual([])
  })
})

describe('isGranted', () => {
  it('accepts a path inside a grant or a session root, and nothing else', () => {
    const g = emptyGrants()
    g.dirs.add(join(dir, 'a'))
    expect(isGranted(g, [], join(dir, 'a', 'x'))).toBe(true)
    expect(isGranted(g, [join(dir, 'b')], join(dir, 'b'))).toBe(true)
    expect(isGranted(g, [], join(dir, 'c'))).toBe(false)
    // A sibling whose name starts with a granted name is not inside it.
    expect(isGranted(g, [], join(dir, 'a-evil'))).toBe(false)
  })
})

describe('loadOrMigrateGrants', () => {
  it('migrates the settings paths and programs once, and writes the file', async () => {
    const ffmpeg = join(dir, 'ffmpeg.exe')
    await fs.writeFile(ffmpeg, 'FF')
    const g = await loadOrMigrateGrants(dir, {
      packDir: join(dir, 'p'),
      ffmpegPath: ffmpeg,
      companionPath: join(dir, 'missing.exe')
    })
    expect([...g.dirs]).toEqual([join(dir, 'p')])
    expect(g.executables.ffmpeg?.path).toBe(ffmpeg)
    // A program that is not there is not accepted.
    expect(g.executables.companion).toBeUndefined()

    const onDisk = JSON.parse(await fs.readFile(join(dir, GRANTS_FILENAME), 'utf-8'))
    expect(onDisk).toEqual(snapshotGrants(g))
  })

  it('reads an existing file and does not migrate again', async () => {
    await loadOrMigrateGrants(dir, { packDir: join(dir, 'p') })
    const again = await loadOrMigrateGrants(dir, { packDir: join(dir, 'q') })
    expect([...again.dirs]).toEqual([join(dir, 'p')])
  })

  it('fails closed on a damaged file, and says so', async () => {
    await fs.writeFile(join(dir, GRANTS_FILENAME), '{ not json')
    const log: string[] = []
    const g = await loadOrMigrateGrants(dir, { packDir: join(dir, 'p') }, (m) => log.push(m))
    expect(g.dirs.size).toBe(0)
    expect(log.join('\n')).toMatch(/not valid/)
    // The damaged file is not replaced by a migration.
    expect(await fs.readFile(join(dir, GRANTS_FILENAME), 'utf-8')).toBe('{ not json')
  })

  it('persists through a temporary file and a rename', async () => {
    const g = await loadOrMigrateGrants(dir, {})
    g.dirs.add('/x')
    await g.persist!(snapshotGrants(g))
    expect(JSON.parse(await fs.readFile(join(dir, GRANTS_FILENAME), 'utf-8')).dirs).toEqual(['/x'])
    expect(await fs.readdir(dir)).toEqual([GRANTS_FILENAME])
  })
})

describe('measureExecutable / verifyExecutable', () => {
  it('accepts an unchanged file without hashing it again', async () => {
    const p = join(dir, 'tool.exe')
    await fs.writeFile(p, 'TOOL')
    const grant = await measureExecutable(p)
    expect(grant.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(await verifyExecutable(grant)).toEqual({ grant, changed: false })
  })

  it('accepts a touched file with the same content, and records its new mtime', async () => {
    const p = join(dir, 'tool.exe')
    await fs.writeFile(p, 'TOOL')
    const grant = await measureExecutable(p)
    const later = new Date(Date.now() + 60_000)
    await fs.utimes(p, later, later)
    const r = await verifyExecutable(grant)
    expect(r.changed).toBe(true)
    expect(r.grant.mtimeMs).not.toBe(grant.mtimeMs)
    expect(r.grant.sha256).toBe(grant.sha256)
  })

  it('refuses a file whose content changed', async () => {
    const p = join(dir, 'tool.exe')
    await fs.writeFile(p, 'TOOL')
    const grant = await measureExecutable(p)
    await fs.writeFile(p, 'OTHER PROGRAM')
    await expect(verifyExecutable(grant)).rejects.toThrow(/changed after you chose it/)
  })

  it('refuses a file that is gone', async () => {
    const p = join(dir, 'tool.exe')
    await fs.writeFile(p, 'TOOL')
    const grant = await measureExecutable(p)
    await fs.rm(p)
    await expect(verifyExecutable(grant)).rejects.toThrow(/missing/)
  })

  it('records a directory (a macOS .app bundle) without a hash, and checks it still is one', async () => {
    const app = join(dir, 'Creidhne.app')
    await fs.mkdir(app)
    const grant = await measureExecutable(app)
    expect(grant).toMatchObject({ isDirectory: true, sha256: null })
    expect((await verifyExecutable(grant)).changed).toBe(false)
    await fs.rm(app, { recursive: true })
    await fs.writeFile(app, 'not a bundle')
    await expect(verifyExecutable(grant)).rejects.toThrow(/changed/)
  })
})
