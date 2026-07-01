import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs, createWriteStream } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import archiver from 'archiver'
import {
  loadPacks,
  listActivePacks,
  listCoveredIds,
  resolveAsset,
  resolveAssetBytes,
  suggestedBrigidAssetsPath,
  _resetForTests,
  _handlers
} from '../assetPacks'

// Build a real .datf (zip) at filePath with the given manifest + named PNG-ish
// entries. Uses the same archiver the compile path uses.
async function buildDatf(
  filePath: string,
  manifest: Record<string, unknown>,
  files: { name: string; content: Buffer }[]
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(filePath)
    const archive = archiver('zip')
    output.on('close', () => resolve())
    output.on('error', reject)
    archive.on('error', reject)
    archive.pipe(output)
    archive.append(JSON.stringify(manifest), { name: '_manifest.json' })
    for (const f of files) archive.append(f.content, { name: f.name })
    void archive.finalize()
  })
}

const manifest = (content_type: string, pack_id: string, priority: number): Record<string, unknown> => ({
  schema_version: 1,
  pack_id,
  pack_version: '1.0.0',
  content_type,
  priority,
  covers: {}
})

describe('assetPacks handlers', () => {
  const { staticTilesHandler, worldMapsHandler, musicHandler } = _handlers

  it('music parseEntry reads music_{id}.{ext}, rejects non-audio', () => {
    expect(musicHandler.parseEntry('music_0001.mp3')).toEqual({
      subtype: 'music',
      id: 1,
      key: 'music:1'
    })
    expect(musicHandler.parseEntry('music_42.ogg')).toEqual({ subtype: 'music', id: 42, key: 'music:42' })
    expect(musicHandler.parseEntry('music_0001.png')).toBeNull()
    expect(musicHandler.parseEntry('sfx_0001.mp3')).toBeNull()
    expect(musicHandler.keyFor('music', 5)).toBe('music:5')
    expect(musicHandler.keyFor('floor', 5)).toBeNull()
  })

  it('static_tiles parseEntry reads floor/wall ids, rejects others', () => {
    expect(staticTilesHandler.parseEntry('floor00001.png')).toEqual({
      subtype: 'floor',
      id: 1,
      key: 'floor:1'
    })
    expect(staticTilesHandler.parseEntry('wall00342.png')).toEqual({
      subtype: 'wall',
      id: 342,
      key: 'wall:342'
    })
    expect(staticTilesHandler.parseEntry('sub/floor00001.png')).toEqual({
      subtype: 'floor',
      id: 1,
      key: 'floor:1'
    }) // basename only
    expect(staticTilesHandler.parseEntry('door00001.png')).toBeNull()
    expect(staticTilesHandler.parseEntry('_manifest.json')).toBeNull()
  })

  it('static_tiles keyFor matches parseEntry keys, only for floor/wall', () => {
    expect(staticTilesHandler.keyFor('floor', 1)).toBe('floor:1')
    expect(staticTilesHandler.keyFor('wall', 342)).toBe('wall:342')
    expect(staticTilesHandler.keyFor('world_maps', 1)).toBeNull()
  })

  it('world_maps parseEntry is case-insensitive and root-only', () => {
    expect(worldMapsHandler.parseEntry('field001.png')).toEqual({
      subtype: 'world_maps',
      id: 'field001',
      key: 'world:field001'
    })
    expect(worldMapsHandler.parseEntry('Mileth.png')).toEqual({
      subtype: 'world_maps',
      id: 'mileth',
      key: 'world:mileth'
    })
    expect(worldMapsHandler.parseEntry('sub/field001.png')).toBeNull()
    expect(worldMapsHandler.parseEntry('field001.epf')).toBeNull()
  })

  it('world_maps keyFor lowercases the field name', () => {
    expect(worldMapsHandler.keyFor('world_maps', 'Field001')).toBe('world:field001')
    expect(worldMapsHandler.keyFor('floor', 1)).toBeNull()
  })
})

describe('assetPacks loading + resolution', () => {
  let dir: string

  beforeEach(async () => {
    _resetForTests()
    dir = await fs.mkdtemp(join(tmpdir(), 'taliesin-packs-'))
  })

  afterEach(async () => {
    _resetForTests()
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('resolves the highest-priority pack for an overlapping tile id', async () => {
    await buildDatf(join(dir, 'low.datf'), manifest('static_tiles', 'low', 50), [
      { name: 'floor00001.png', content: Buffer.from('LOW-FLOOR-1') },
      { name: 'floor00002.png', content: Buffer.from('LOW-FLOOR-2') }
    ])
    await buildDatf(join(dir, 'high.datf'), manifest('static_tiles', 'high', 200), [
      { name: 'floor00001.png', content: Buffer.from('HIGH-FLOOR-1') }
    ])

    await loadPacks({ brigidAssetsPath: dir })

    // Overlapping id 1 → higher priority wins; id 2 → only the low pack has it.
    expect((await resolveAsset('floor', 1))?.toString()).toBe('HIGH-FLOOR-1')
    expect((await resolveAsset('floor', 2))?.toString()).toBe('LOW-FLOOR-2')
    // Uncovered id → null.
    expect(await resolveAsset('floor', 999)).toBeNull()
    // Wrong subtype → null.
    expect(await resolveAsset('wall', 1)).toBeNull()
  })

  it('listCoveredIds merges across packs and sorts numerically', async () => {
    await buildDatf(join(dir, 'a.datf'), manifest('static_tiles', 'a', 100), [
      { name: 'floor00003.png', content: Buffer.from('x') },
      { name: 'wall00010.png', content: Buffer.from('x') }
    ])
    await buildDatf(join(dir, 'b.datf'), manifest('static_tiles', 'b', 100), [
      { name: 'floor00001.png', content: Buffer.from('x') }
    ])
    await loadPacks({ brigidAssetsPath: dir })

    expect(await listCoveredIds('floor')).toEqual([1, 3])
    expect(await listCoveredIds('wall')).toEqual([10])
    expect(await listCoveredIds('world_maps')).toEqual([])
  })

  it('world_maps resolves by field name and lists covered fields', async () => {
    await buildDatf(join(dir, 'w.datf'), manifest('world_maps', 'w', 100), [
      { name: 'field001.png', content: Buffer.from('FIELD-1') },
      { name: 'Mileth.png', content: Buffer.from('MILETH') }
    ])
    await loadPacks({ brigidAssetsPath: dir })

    expect((await resolveAsset('world_maps', 'field001'))?.toString()).toBe('FIELD-1')
    // Case-insensitive.
    expect((await resolveAsset('world_maps', 'MILETH'))?.toString()).toBe('MILETH')
    expect(await listCoveredIds('world_maps')).toEqual(['field001', 'mileth'])
  })

  it('resolveAssetBytes returns raw bytes + the right MIME', async () => {
    await buildDatf(join(dir, 's.datf'), manifest('static_tiles', 's', 100), [
      { name: 'floor00001.png', content: Buffer.from('PNGBYTES') }
    ])
    await buildDatf(join(dir, 'm.datf'), manifest('music', 'm', 100), [
      { name: 'music_0001.mp3', content: Buffer.from('MP3BYTES') }
    ])
    await loadPacks({ brigidAssetsPath: dir })

    // PNG for tiles, audio/mpeg for an mp3 music entry.
    const floor = await resolveAssetBytes('floor', 1)
    expect(floor?.mime).toBe('image/png')
    expect(Buffer.from(floor!.bytes).toString()).toBe('PNGBYTES')
    const music = await resolveAssetBytes('music', 1)
    expect(music?.mime).toBe('audio/mpeg')
    expect(Buffer.from(music!.bytes).toString()).toBe('MP3BYTES')
    expect(await resolveAssetBytes('floor', 2)).toBeNull()
  })

  it('listActivePacks summarizes packs and their covered subtypes', async () => {
    await buildDatf(join(dir, 's.datf'), manifest('static_tiles', 's', 100), [
      { name: 'floor00001.png', content: Buffer.from('x') }
    ])
    await loadPacks({ brigidAssetsPath: dir })

    const active = await listActivePacks()
    expect(active).toHaveLength(1)
    expect(active[0].fileName).toBe('s.datf')
    expect(active[0].manifest.pack_id).toBe('s')
    expect(active[0].coveredSubtypes).toEqual(['floor'])
  })

  it('skips unknown content types and unsupported schema versions', async () => {
    await buildDatf(join(dir, 'unknown.datf'), manifest('creature_sprites', 'c', 100), [
      { name: 'whatever.png', content: Buffer.from('x') }
    ])
    await buildDatf(join(dir, 'badver.datf'), { ...manifest('static_tiles', 'v', 100), schema_version: 2 }, [
      { name: 'floor00001.png', content: Buffer.from('x') }
    ])
    await loadPacks({ brigidAssetsPath: dir })

    expect(await listActivePacks()).toHaveLength(0)
    expect(await resolveAsset('floor', 1)).toBeNull()
  })

  it('missing/empty source directory is a clean no-op', async () => {
    await loadPacks({ brigidAssetsPath: join(dir, 'does-not-exist') })
    expect(await listActivePacks()).toEqual([])
    expect(await listCoveredIds('floor')).toEqual([])
  })
})

describe('suggestedBrigidAssetsPath', () => {
  const prev = process.env.LOCALAPPDATA

  afterEach(() => {
    if (prev === undefined) delete process.env.LOCALAPPDATA
    else process.env.LOCALAPPDATA = prev
  })

  it('joins %LOCALAPPDATA%\\erisco\\Brigid\\assets when set', () => {
    process.env.LOCALAPPDATA = join('C:', 'Users', 'x', 'AppData', 'Local')
    expect(suggestedBrigidAssetsPath()).toBe(
      join(process.env.LOCALAPPDATA, 'erisco', 'Brigid', 'assets')
    )
  })

  it('returns null when LOCALAPPDATA is absent', () => {
    delete process.env.LOCALAPPDATA
    expect(suggestedBrigidAssetsPath()).toBeNull()
  })
})
