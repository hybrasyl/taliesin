/**
 * Asset-pack resource limits (HTOO-693; Creidhne's HTOO-684, ported), against
 * real zip files on disk and the real zip reader. Each case uses small limits so
 * that a refusal needs only a small file; the production limits are checked for
 * headroom separately.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { randomBytes } from 'crypto'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { crc32, deflateRawSync } from 'zlib'

vi.setConfig({ testTimeout: 30_000 })

vi.mock('@eriscorp/hybindex-ts', () => {
  const m = {
    buildIndex: vi.fn(),
    loadIndex: vi.fn(),
    saveIndex: vi.fn(),
    getIndexStatus: vi.fn(),
    deleteIndex: vi.fn(),
    listSectionFiles: vi.fn()
  }
  return { ...m, default: m }
})

import {
  _loadPackForTests,
  _resetForTests,
  _setPackLimitsForTests,
  listImageEntries,
  loadPacks,
  readPackEntry,
  resolveAsset
} from '../assetPacks'
import { packImport } from '../handlers'
import type { HandlerContext } from '../handlers'
import {
  PACK_LIMITS,
  openPackBounded,
  packLimitViolation,
  readEntryBounded,
  type PackLimits,
  type PackZipEntry
} from '../packLimits'

interface ZipInput {
  name: string
  data: Buffer
  /** Write this size in both headers instead of the real one, to make a lying entry. */
  declaredSize?: number
}

// A minimal zip writer: deflate, no data descriptors. yazl, which the compile
// uses, always writes true sizes, so it cannot make a lying entry.
function buildZip(entries: ZipInput[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const { name, data, declaredSize } of entries) {
    const nameBuf = Buffer.from(name, 'utf8')
    const packed = deflateRawSync(data)
    const crc = crc32(data)
    const size = declaredSize ?? data.length
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(size, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    locals.push(local, nameBuf, packed)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(packed.length, 20)
    central.writeUInt32LE(size, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBuf)
    offset += 30 + nameBuf.length + packed.length
  }
  const cd = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, eocd])
}

const manifestFor = (content_type: string, extra: object = {}): Buffer =>
  Buffer.from(
    JSON.stringify({
      schema_version: 1,
      pack_id: 'limits-test',
      pack_version: '0.1.0',
      content_type,
      priority: 100,
      covers: {},
      ...extra
    })
  )

// ambient_sounds is one of the content types assetPacks.ts reads.
const MANIFEST = manifestFor('ambient_sounds')

const SMALL: Readonly<PackLimits> = Object.freeze({
  maxPackBytes: 64 * 1024,
  maxEntries: 4,
  maxManifestBytes: 1024,
  maxEntryBytes: 4096,
  maxTotalBytes: 8192,
  maxRatio: 20,
  ratioFloorBytes: 1024
})

let root: string
let n = 0
async function pack(entries: ZipInput[], dir = root): Promise<string> {
  const p = join(dir, `p${n++}.datf`)
  await writeFile(p, buildZip(entries))
  return p
}
const sound = (id: number, bytes = 100): ZipInput => ({
  name: `amb_${String(id).padStart(4, '0')}.ogg`,
  // Random bytes do not compress, so only the limit a case names can refuse it.
  data: randomBytes(bytes)
})

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'taliesin-packlimits-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('pack limits on load', () => {
  beforeEach(() => _setPackLimitsForTests(SMALL))
  afterEach(() => _resetForTests())

  it('loads a valid pack that is inside every limit', async () => {
    const p = await pack([{ name: '_manifest.json', data: MANIFEST }, sound(1), sound(2)])
    const loaded = await _loadPackForTests(p)
    expect(loaded).not.toBeNull()
    expect([...loaded!.coverage.get('ambient')!]).toEqual([1, 2])
  })

  it('loads a pack with entries exactly at the limits', async () => {
    const p = await pack([
      { name: '_manifest.json', data: MANIFEST },
      sound(1, SMALL.maxEntryBytes),
      sound(2),
      sound(3)
    ])
    expect(await _loadPackForTests(p)).not.toBeNull()
  })

  it('refuses a pack with too many entries', async () => {
    const p = await pack([
      { name: '_manifest.json', data: MANIFEST },
      ...[1, 2, 3, 4].map((i) => sound(i))
    ])
    expect(await _loadPackForTests(p)).toBeNull()
  })

  it('refuses an oversized manifest', async () => {
    const big = manifestFor('ambient_sounds', { description: 'x'.repeat(2000) })
    const p = await pack([{ name: '_manifest.json', data: big }, sound(1)])
    expect(await _loadPackForTests(p)).toBeNull()
  })

  it('refuses an oversized asset', async () => {
    const p = await pack([
      { name: '_manifest.json', data: MANIFEST },
      sound(1, SMALL.maxEntryBytes + 1)
    ])
    expect(await _loadPackForTests(p)).toBeNull()
  })

  it('refuses a high-ratio entry', async () => {
    const zeros = { name: 'amb_0001.ogg', data: Buffer.alloc(4000) }
    const p = await pack([{ name: '_manifest.json', data: MANIFEST }, zeros])
    expect(await _loadPackForTests(p)).toBeNull()
  })

  it('refuses a pack file above the size limit before it opens it', async () => {
    const p = await pack([{ name: '_manifest.json', data: MANIFEST }, sound(1, 3000)])
    _setPackLimitsForTests({ ...SMALL, maxPackBytes: 1000 })
    expect(await _loadPackForTests(p)).toBeNull()
  })

  it('checks the file size before the zip reader parses anything', async () => {
    // Not a zip at all: only the size check can give this reason.
    const p = join(root, 'garbage.datf')
    await writeFile(p, randomBytes(3000))
    await expect(openPackBounded(p, { ...SMALL, maxPackBytes: 1000 })).rejects.toThrow(
      /the file is 3000 bytes/
    )
  })

  it('refuses entries that together pass the total limit', async () => {
    const p = await pack([
      { name: '_manifest.json', data: MANIFEST },
      sound(1, 3000),
      sound(2, 3000),
      sound(3, 3000)
    ])
    expect(await _loadPackForTests(p)).toBeNull()
  })

  it('refuses a manifest that inflates past its declared size', async () => {
    const lying = { name: '_manifest.json', data: MANIFEST, declaredSize: 10 }
    // The declared size is inside the limit; the inflate is not.
    const p = await pack([lying, sound(1)])
    _setPackLimitsForTests({ ...SMALL, maxManifestBytes: 64 })
    expect(await _loadPackForTests(p)).toBeNull()
  })
})

describe('pack limits on each read of an active pack', () => {
  // Declared 10 bytes, so the pack opens; it inflates to 100 000.
  const lyingSound = { name: 'amb_0002.ogg', data: Buffer.alloc(100_000, 7), declaredSize: 10 }

  beforeEach(() => _setPackLimitsForTests(SMALL))
  afterEach(() => _resetForTests())

  it('resolveAsset gives no bytes for an entry that inflates past the limit', async () => {
    await pack([{ name: '_manifest.json', data: MANIFEST }, sound(1), lyingSound])
    await loadPacks({ brigidAssetsPath: root })
    expect(await resolveAsset('ambient', 1)).not.toBeNull()
    expect(await resolveAsset('ambient', 2)).toBeNull()
  })

  it('readPackEntry gives no bytes for an entry that inflates past the limit', async () => {
    const p = await pack([{ name: '_manifest.json', data: MANIFEST }, sound(1), lyingSound])
    await loadPacks({ brigidAssetsPath: root })
    expect(await readPackEntry(p, 'amb_0001.ogg')).not.toBeNull()
    expect(await readPackEntry(p, 'amb_0002.ogg')).toBeNull()
  })

  it('listImageEntries skips a pack whose manifest inflates past the limit', async () => {
    const art = { name: 'art.png', data: randomBytes(100) }
    // Declared 10 bytes; it inflates past SMALL's 1024, which MANIFEST fits in.
    const long = manifestFor('ambient_sounds', { description: 'x'.repeat(2000) })
    const good = await pack([{ name: '_manifest.json', data: MANIFEST }, art])
    await pack([{ name: '_manifest.json', data: long, declaredSize: 10 }, art])
    await loadPacks({ brigidAssetsPath: root })
    const listed = await listImageEntries()
    expect(listed.map((e) => e.packFile)).toEqual([good])
  })
})

describe('readEntryBounded', () => {
  it('stops an entry that inflates past its declared size at the limit', async () => {
    // The central directory says 10 bytes; the entry inflates to 100 000.
    const p = await pack([
      { name: 'amb_0001.ogg', data: Buffer.alloc(100_000, 7), declaredSize: 10 }
    ])
    const entry = (await openPackBounded(p)).files[0]
    expect(Number(entry.uncompressedSize)).toBe(10)
    await expect(readEntryBounded(entry, 4096)).rejects.toThrow(/inflates past the limit/)
  })

  it('reads an entry at the limit', async () => {
    const data = sound(1, 4096).data
    const p = await pack([{ name: 'amb_0001.ogg', data }])
    const buf = await readEntryBounded((await openPackBounded(p)).files[0], 4096)
    expect(buf.equals(data)).toBe(true)
  })

  it('refuses an entry whose declared size is above the limit without reading it', async () => {
    let opened = false
    const entry = {
      path: 'x',
      uncompressedSize: 5000,
      compressedSize: 5000,
      stream: () => {
        opened = true
        throw new Error('opened')
      }
    } as unknown as PackZipEntry
    await expect(readEntryBounded(entry, 4096)).rejects.toThrow(/above the limit/)
    expect(opened).toBe(false)
  })
})

describe('packLimitViolation', () => {
  it('refuses a size that is not a valid number', () => {
    const files = [{ path: 'a', uncompressedSize: -1, compressedSize: 1 }]
    expect(packLimitViolation(10, files, SMALL)).toMatch(/not valid/)
  })

  it('leaves the production limits far above the measured packs', () => {
    // Measured 2026-11-17: 5.9 MB pack, 799 entries, 327-byte manifest, 4.7 MB
    // entry, ratio 6.8. See packLimits.ts.
    expect(PACK_LIMITS.maxPackBytes).toBeGreaterThan(100 * 5.9e6)
    expect(PACK_LIMITS.maxEntries).toBeGreaterThan(100 * 799)
    expect(PACK_LIMITS.maxEntryBytes).toBeGreaterThan(50 * 4.7e6)
    expect(PACK_LIMITS.maxRatio).toBeGreaterThan(10 * 6.8)
  })
})

describe('pack limits on import', () => {
  let work: string
  let inbox: string
  let ctx: HandlerContext

  // static_tiles, as importExtractSafety.test.ts: the import keeps any name.
  const TILES = manifestFor('static_tiles')
  const tile = (id: number, bytes = 100): ZipInput => ({
    name: `floor${String(id).padStart(5, '0')}.png`,
    data: randomBytes(bytes)
  })

  beforeEach(async () => {
    work = join(root, 'work')
    inbox = join(root, 'inbox')
    await mkdir(work, { recursive: true })
    await mkdir(inbox, { recursive: true })
    ctx = {
      settingsPath: join(root, 'appdata'),
      settingsManager: {
        load: async () => ({}),
        save: async () => undefined
      } as unknown as HandlerContext['settingsManager'],
      appGetVersion: () => '0.0.0',
      settingsRoots: new Set<string>(),
      blessedRoots: new Set<string>([work, inbox])
    }
  })

  it('imports a valid pack with an entry at the limit', async () => {
    const p = await pack(
      [{ name: '_manifest.json', data: TILES }, tile(1, SMALL.maxEntryBytes), tile(2)],
      inbox
    )
    const result = await packImport(ctx, p, work, undefined, SMALL)
    expect(result.projectFilename).toBe('limits-test.json')
    expect((await readdir(join(work, 'limits-test'))).sort()).toEqual([
      'floor00001.png',
      'floor00002.png'
    ])
  })

  it('refuses a pack with too many entries, and writes nothing', async () => {
    const p = await pack(
      [{ name: '_manifest.json', data: TILES }, ...[1, 2, 3, 4].map((i) => tile(i))],
      inbox
    )
    await expect(packImport(ctx, p, work, undefined, SMALL)).rejects.toThrow(
      /refused this pack: it has 5 entries/
    )
    expect(await readdir(work)).toEqual([])
  })

  it('refuses a pack file above the size limit, and writes nothing', async () => {
    const p = await pack([{ name: '_manifest.json', data: TILES }, tile(1, 3000)], inbox)
    await expect(
      packImport(ctx, p, work, undefined, { ...SMALL, maxPackBytes: 1000 })
    ).rejects.toThrow(/refused this pack: the file is/)
    expect(await readdir(work)).toEqual([])
  })

  it('refuses a manifest that inflates past its declared size', async () => {
    const p = await pack(
      [{ name: '_manifest.json', data: TILES, declaredSize: 10 }, tile(1)],
      inbox
    )
    await expect(
      packImport(ctx, p, work, undefined, { ...SMALL, maxManifestBytes: 64 })
    ).rejects.toThrow(/inflates past the limit/)
    expect(await readdir(work)).toEqual([])
  })

  it('stops an asset that inflates past its declared size, and leaves no file behind', async () => {
    const lying = { name: 'floor00002.png', data: Buffer.alloc(100_000, 7), declaredSize: 10 }
    const p = await pack([{ name: '_manifest.json', data: TILES }, tile(1), lying], inbox)
    await expect(packImport(ctx, p, work, undefined, SMALL)).rejects.toThrow(
      /inflates past the limit/
    )
    // The staging folder is gone, and nothing reached the working folder.
    expect(await readdir(work)).toEqual([])
  })
})
