/**
 * Map staging on a real disk (HTOO-634), and the warp repair that walks the
 * staging root (HTOO-635).
 *
 * A temporary world, `<world>/xml` and `<world>/.staging`, as the settings
 * bless it: the library and its world parent.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import {
  scanWarpReferrers,
  updateWarpTargets,
  stagingListMaps,
  stagingStageMap,
  stagingReleaseMap
} from '../handlers'
import { stagingRootFor } from '../mapStaging'

type Ctx = Parameters<typeof scanWarpReferrers>[0]

const XMLNS = 'http://www.hybrasyl.com/XML/Hybrasyl/2020-02'

function mapXml(id: number, name: string, targets: string[] = []): string {
  const warps = targets
    .map((t) => `    <Warp X="1" Y="1"><MapTarget X="2" Y="2">${t}</MapTarget></Warp>`)
    .join('\n')
  return `<?xml version="1.0"?>\n<Map Id="${id}" X="10" Y="10" xmlns="${XMLNS}">\n  <Name>${name}</Name>\n  <Warps>\n${warps}\n  </Warps>\n</Map>\n`
}

let world: string
let lib: string
let staging: string
let ctx: Ctx

async function put(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text)
}

beforeEach(async () => {
  world = await mkdtemp(join(tmpdir(), 'taliesin-staging-'))
  lib = join(world, 'xml')
  staging = join(world, '.staging')
  await mkdir(join(lib, 'maps'), { recursive: true })
  ctx = {
    settingsPath: join(world, 'settings'),
    settingsRoots: new Set([lib, world]),
    blessedRoots: new Set<string>()
  } as unknown as Ctx
})

afterEach(async () => {
  await rm(world, { recursive: true, force: true })
})

describe('the staging root', () => {
  it('is `.staging` beside the library', () => {
    expect(stagingRootFor(lib)).toBe(staging)
    expect(stagingRootFor(`${lib}/`)).toBe(staging)
  })
})

describe('the warp scan and repair read the staging root (HTOO-635)', () => {
  beforeEach(async () => {
    await put(join(lib, 'maps', 'Abel.xml'), mapXml(1, 'Abel'))
    await put(join(lib, 'maps', 'Inn.xml'), mapXml(2, 'Abel Inn', ['Abel']))
    // A staged map that warps to the live one, and a staged item that
    // teleports to it: Creidhne stages items.
    await put(join(staging, 'maps', 'draft', 'Docks.xml'), mapXml(3, 'Abel Docks', ['Abel']))
    await put(
      join(staging, 'items', 'song.xml'),
      `<Item><Name>Abel Song</Name><Properties><Use><Teleport X="1" Y="1">Abel</Teleport></Use></Properties></Item>`
    )
  })

  it('reports a staged referrer, and marks it staged', async () => {
    const found = await scanWarpReferrers(ctx, lib, 'Abel')
    expect(found).toEqual([
      { file: 'Inn.xml', count: 1, section: 'maps' },
      { file: 'draft/Docks.xml', count: 1, section: 'maps', staged: true },
      { file: 'song.xml', count: 1, section: 'items', staged: true }
    ])
  })

  it('repairs the warp in a staged map, and the teleport in a staged item', async () => {
    const { updated, failed } = await updateWarpTargets(ctx, lib, 'Abel', 'Abel Town')
    expect(failed).toEqual([])
    expect(updated.filter((u) => u.staged).map((u) => u.file)).toEqual([
      'draft/Docks.xml',
      'song.xml'
    ])
    const docks = await readFile(join(staging, 'maps', 'draft', 'Docks.xml'), 'utf8')
    expect(docks).toContain('<MapTarget X="2" Y="2">Abel Town</MapTarget>')
    const song = await readFile(join(staging, 'items', 'song.xml'), 'utf8')
    expect(song).toContain('<Teleport X="1" Y="1">Abel Town</Teleport>')
    const inn = await readFile(join(lib, 'maps', 'Inn.xml'), 'utf8')
    expect(inn).toContain('>Abel Town</MapTarget>')
  })

  it('reads no staging root outside the allowed roots', async () => {
    // Only the library is blessed, not its world: the staging root is refused,
    // so only the live referrer is found.
    ctx.settingsRoots = new Set([lib])
    const found = await scanWarpReferrers(ctx, lib, 'Abel')
    expect(found.map((r) => r.file)).toEqual(['Inn.xml'])
  })
})

describe('staging:listMaps', () => {
  it('lists each staged map with its name, Id and warp targets', async () => {
    await put(join(staging, 'maps', 'Docks.xml'), mapXml(3, 'Abel Docks', ['Abel', 'Abel', 'Pier']))
    await put(join(staging, 'maps', 'sub', 'Pier.xml'), mapXml(4, 'Pier &amp; Rope'))
    // Staging has no archive: an archived file in it is not listed.
    await put(join(staging, 'maps', '.ignore', 'Old.xml'), mapXml(5, 'Old'))
    const { dir, files } = await stagingListMaps(ctx, lib)
    expect(dir).toBe(join(staging, 'maps').replace(/\\/g, '/'))
    expect(files).toEqual([
      { rel: 'Docks.xml', name: 'Abel Docks', id: 3, targets: ['Abel', 'Pier'] },
      { rel: 'sub/Pier.xml', name: 'Pier & Rope', id: 4, targets: [] }
    ])
  })

  it('gives an empty list when the world has no staging folder', async () => {
    await expect(stagingListMaps(ctx, lib)).resolves.toMatchObject({ files: [] })
    expect(existsSync(staging)).toBe(false)
  })

  it('refuses a library outside the allowed roots', async () => {
    await expect(stagingListMaps(ctx, join(tmpdir(), 'elsewhere', 'xml'))).rejects.toThrow()
  })
})

describe('staging:stageMap and staging:releaseMap', () => {
  it('stages a map to the same path under .staging, and releases it back', async () => {
    await put(join(lib, 'maps', 'towns', 'Abel.xml'), mapXml(1, 'Abel'))
    const staged = await stagingStageMap(ctx, lib, 'towns/Abel.xml')
    expect(staged.path).toBe(join(staging, 'maps', 'towns', 'Abel.xml').replace(/\\/g, '/'))
    expect(existsSync(join(lib, 'maps', 'towns', 'Abel.xml'))).toBe(false)
    expect(await readFile(join(staging, 'maps', 'towns', 'Abel.xml'), 'utf8')).toBe(
      mapXml(1, 'Abel')
    )

    const released = await stagingReleaseMap(ctx, lib, 'towns/Abel.xml')
    expect(released.path).toBe(join(lib, 'maps', 'towns', 'Abel.xml').replace(/\\/g, '/'))
    expect(existsSync(join(staging, 'maps', 'towns', 'Abel.xml'))).toBe(false)
    expect(await readdir(join(lib, 'maps', 'towns'))).toEqual(['Abel.xml'])
  })

  it('moves only the XML, and leaves the mapfiles folder alone', async () => {
    await put(join(lib, 'maps', 'Abel.xml'), mapXml(1, 'Abel'))
    await put(join(world, 'mapfiles', 'lod1.map'), 'MAP')
    await stagingStageMap(ctx, lib, 'Abel.xml')
    expect(await readdir(join(world, 'mapfiles'))).toEqual(['lod1.map'])
    expect(await readdir(staging)).toEqual(['maps'])
  })

  it('refuses to write over a file on the other side', async () => {
    await put(join(lib, 'maps', 'Abel.xml'), mapXml(1, 'Abel'))
    await put(join(staging, 'maps', 'Abel.xml'), mapXml(9, 'Other'))
    await expect(stagingStageMap(ctx, lib, 'Abel.xml')).rejects.toThrow(/already exists/)
    expect(await readFile(join(staging, 'maps', 'Abel.xml'), 'utf8')).toBe(mapXml(9, 'Other'))
    expect(existsSync(join(lib, 'maps', 'Abel.xml'))).toBe(true)
  })

  it('refuses an archived map', async () => {
    await put(join(lib, 'maps', '.ignore', 'Old.xml'), mapXml(1, 'Old'))
    await expect(stagingStageMap(ctx, lib, '.ignore/Old.xml')).rejects.toThrow(/archived/)
    expect(existsSync(join(lib, 'maps', '.ignore', 'Old.xml'))).toBe(true)
  })

  it.each([[''], ['.'], ['towns'], ['../nations/n.xml'], ['../../escape.xml']])(
    'refuses %j, which is not a map XML inside the maps folder',
    async (rel) => {
      await put(join(lib, 'nations', 'n.xml'), '<Nation/>')
      await expect(stagingStageMap(ctx, lib, rel)).rejects.toThrow()
      expect(existsSync(join(lib, 'nations', 'n.xml'))).toBe(true)
      expect(existsSync(staging)).toBe(false)
    }
  )
})
