/**
 * HTOO-676 and HTOO-677 on a real disk.
 *
 * Both faults were found with real files: a `.datf` whose `pack_id` is `.`
 * overwrote another project's asset, and a `.dat` entry named `../note.txt`
 * wrote next to the chosen extraction folder. These tests use the real fs, the
 * real yazl and unzipper libraries, and the real dalib-ts parser, in a
 * temporary folder, so a fault that only shows on disk cannot hide behind a
 * mock.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ZipFile } from 'yazl'

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

import { packImport, extractArchive } from '../handlers'
import type { HandlerContext } from '../handlers'

let root: string
let ctx: HandlerContext

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'taliesin-safety-'))
  ctx = {
    settingsPath: join(root, 'appdata'),
    settingsManager: {
      load: async () => ({}),
      save: async () => undefined
    } as unknown as HandlerContext['settingsManager'],
    appGetVersion: () => '0.0.0',
    settingsRoots: new Set<string>(),
    // Only `work` and `inbox` are allowed, as in the cards' reproductions.
    blessedRoots: new Set<string>([join(root, 'work'), join(root, 'inbox')])
  }
  await mkdir(join(root, 'work'), { recursive: true })
  await mkdir(join(root, 'inbox'), { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** A `.datf` built with yazl, the writer the compile uses. */
async function datf(manifest: object, files: Record<string, string>): Promise<Buffer> {
  const zip = new ZipFile()
  zip.addBuffer(Buffer.from(JSON.stringify(manifest)), '_manifest.json')
  for (const [name, content] of Object.entries(files)) zip.addBuffer(Buffer.from(content), name)
  zip.end()
  const chunks: Buffer[] = []
  for await (const chunk of zip.outputStream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

function manifest(packId: string): object {
  return {
    schema_version: 1,
    pack_id: packId,
    pack_version: '1.0.0',
    content_type: 'static_tiles',
    priority: 100,
    covers: {}
  }
}

/**
 * Damage the deflate data of the archive's last entry, so it fails when it is
 * read. The local header gives the name and extra-field lengths, and the
 * compressed data starts after them. A first byte of 0xFF is an invalid
 * deflate block type.
 */
function corruptLastEntry(zip: Buffer): Buffer {
  const out = Buffer.from(zip)
  const at = out.lastIndexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  const nameLength = out.readUInt16LE(at + 26)
  const extraLength = out.readUInt16LE(at + 28)
  const data = at + 30 + nameLength + extraLength
  out.fill(0xff, data, data + 8)
  return out
}

/**
 * A legacy `.dat`, built by hand: the entry count plus one, a 17-byte record
 * for each entry (offset, then a 13-byte name), the end offset, then the data.
 * dalib-ts has no public writer that takes a name with a separator in it,
 * which is the case under test.
 */
function dat(entries: [string, string][]): Buffer {
  const headerLength = 4 + entries.length * 17 + 4
  const parts: Buffer[] = []
  const header = Buffer.alloc(headerLength)
  header.writeInt32LE(entries.length + 1, 0)
  let offset = headerLength
  entries.forEach(([name, content], i) => {
    header.writeInt32LE(offset, 4 + i * 17)
    header.write(name, 4 + i * 17 + 4, 13, 'ascii')
    offset += Buffer.byteLength(content)
    parts.push(Buffer.from(content))
  })
  header.writeInt32LE(offset, 4 + entries.length * 17)
  return Buffer.concat([header, ...parts])
}

const text = (p: string): Promise<string> => readFile(p, 'utf-8')

// ── HTOO-676: pack import ────────────────────────────────────────────────────

describe('pack:import keeps each pack in its own folder (HTOO-676)', () => {
  beforeEach(async () => {
    await mkdir(join(root, 'work', 'victim'), { recursive: true })
    await writeFile(join(root, 'work', 'victim', 'floor00001.png'), 'ORIGINAL')
    await writeFile(join(root, 'work', 'victim.json'), '{"pack_id":"victim"}')
  })

  it('refuses pack_id "." and leaves the other project as it was', async () => {
    const datfPath = join(root, 'inbox', 'evil.datf')
    await writeFile(datfPath, await datf(manifest('.'), { 'victim/floor00001.png': 'OVERWRITTEN' }))

    await expect(packImport(ctx, datfPath, join(root, 'work'))).rejects.toThrow(/pack_id/)
    // force does not open it: the id is refused, not the overwrite.
    await expect(packImport(ctx, datfPath, join(root, 'work'), { force: true })).rejects.toThrow(
      /pack_id/
    )

    expect(await text(join(root, 'work', 'victim', 'floor00001.png'))).toBe('ORIGINAL')
    expect(existsSync(join(root, 'work', '..json'))).toBe(false)
  })

  it.each(['..', '...', '_palettes', '_Calibrations', '_frames', 'nul'])(
    'refuses pack_id %j',
    async (id) => {
      const datfPath = join(root, 'inbox', 'evil.datf')
      await writeFile(datfPath, await datf(manifest(id), { 'a.png': 'X' }))
      await expect(packImport(ctx, datfPath, join(root, 'work'))).rejects.toThrow(/pack_id/)
      expect((await readdir(join(root, 'work'))).sort()).toEqual(['victim', 'victim.json'])
    }
  )

  it('refuses an asset that exists already, even when no project file does', async () => {
    // A pack folder whose project file was removed: the old check looked only
    // at the project file, so it overwrote this asset with no prompt.
    await mkdir(join(root, 'work', 'orphan'), { recursive: true })
    await writeFile(join(root, 'work', 'orphan', 'a.png'), 'ORIGINAL')
    const datfPath = join(root, 'inbox', 'orphan.datf')
    await writeFile(datfPath, await datf(manifest('orphan'), { 'a.png': 'NEW', 'b.png': 'NEW' }))

    await expect(packImport(ctx, datfPath, join(root, 'work'))).rejects.toThrow(
      /already exist in .*orphan[\\/]a\.png.*force: true/
    )
    expect(await text(join(root, 'work', 'orphan', 'a.png'))).toBe('ORIGINAL')
    expect(existsSync(join(root, 'work', 'orphan', 'b.png'))).toBe(false)
    expect(existsSync(join(root, 'work', 'orphan.json'))).toBe(false)

    // An overwrite the user asked for still works.
    await packImport(ctx, datfPath, join(root, 'work'), { force: true })
    expect(await text(join(root, 'work', 'orphan', 'a.png'))).toBe('NEW')
    expect(await text(join(root, 'work', 'orphan', 'b.png'))).toBe('NEW')
  })

  it('imports a valid pack beside the other project and leaves no staging folder', async () => {
    const datfPath = join(root, 'inbox', 'fresh.datf')
    await writeFile(
      datfPath,
      await datf(manifest('fresh'), { 'floor00001.png': 'A', 'nested/x.png': 'B' })
    )

    const result = await packImport(ctx, datfPath, join(root, 'work'))

    expect(result).toEqual({ projectFilename: 'fresh.json', warnings: [] })
    expect(await text(join(root, 'work', 'fresh', 'floor00001.png'))).toBe('A')
    expect(await text(join(root, 'work', 'fresh', 'nested', 'x.png'))).toBe('B')
    expect(await text(join(root, 'work', 'victim', 'floor00001.png'))).toBe('ORIGINAL')
    expect((await readdir(join(root, 'work'))).sort()).toEqual([
      'fresh',
      'fresh.json',
      'victim',
      'victim.json'
    ])
  })

  it('skips an entry whose name is a device or a stream, with a warning', async () => {
    const datfPath = join(root, 'inbox', 'odd.datf')
    await writeFile(
      datfPath,
      await datf(manifest('odd'), { 'ok.png': 'A', 'nul.png': 'B', 'a.png:hidden': 'C' })
    )
    const result = await packImport(ctx, datfPath, join(root, 'work'))
    expect(result.warnings).toHaveLength(2)
    expect(await readdir(join(root, 'work', 'odd'))).toEqual(['ok.png'])
  })

  it('changes nothing when an entry fails to read part way through', async () => {
    // A forced re-import over a real project, whose last entry is damaged.
    // The first entries are read and staged before the failure; none of them
    // may reach the working files.
    await writeFile(join(root, 'work', 'victim', 'floor00002.png'), 'ORIGINAL')
    const datfPath = join(root, 'inbox', 'broken.datf')
    const good = await datf(manifest('victim'), {
      'floor00001.png': 'REPLACED',
      'floor00002.png': 'x'.repeat(4096)
    })
    await writeFile(datfPath, corruptLastEntry(good))

    await expect(packImport(ctx, datfPath, join(root, 'work'), { force: true })).rejects.toThrow()

    expect(await text(join(root, 'work', 'victim', 'floor00001.png'))).toBe('ORIGINAL')
    expect(await text(join(root, 'work', 'victim', 'floor00002.png'))).toBe('ORIGINAL')
    expect(await text(join(root, 'work', 'victim.json'))).toBe('{"pack_id":"victim"}')
    expect((await readdir(join(root, 'work'))).sort()).toEqual(['victim', 'victim.json'])
  })
})

// ── HTOO-677: Extract All ────────────────────────────────────────────────────

describe('Extract All writes only into the chosen folder (HTOO-677)', () => {
  beforeEach(async () => {
    await mkdir(join(root, 'work', 'extract'), { recursive: true })
    await writeFile(join(root, 'work', 'note.txt'), 'ORIGINAL')
  })

  it('writes nothing when one entry name leaves the folder', async () => {
    const archivePath = join(root, 'inbox', 'evil.dat')
    await writeFile(
      archivePath,
      dat([
        ['ok.txt', 'GOOD'],
        ['../note.txt', 'MARKER']
      ])
    )

    await expect(extractArchive(ctx, archivePath, join(root, 'work', 'extract'))).rejects.toThrow(
      /Nothing was extracted: 1 of 2 entries.*"\.\.\/note\.txt"/
    )
    expect(await text(join(root, 'work', 'note.txt'))).toBe('ORIGINAL')
    // Every name is checked before the first write.
    expect(await readdir(join(root, 'work', 'extract'))).toEqual([])
  })

  it.each([['..\\note.txt'], ['sub/a.txt'], ['C:x.txt'], ['nul'], ['']])(
    'refuses the entry name %j',
    async (name) => {
      const archivePath = join(root, 'inbox', 'evil.dat')
      await writeFile(archivePath, dat([[name, 'MARKER']]))
      await expect(extractArchive(ctx, archivePath, join(root, 'work', 'extract'))).rejects.toThrow(
        /Nothing was extracted/
      )
      expect(await readdir(join(root, 'work', 'extract'))).toEqual([])
    }
  )

  it('refuses two entries that name one file', async () => {
    const archivePath = join(root, 'inbox', 'twice.dat')
    await writeFile(
      archivePath,
      dat([
        ['a.txt', 'ONE'],
        ['A.TXT', 'TWO']
      ])
    )
    await expect(extractArchive(ctx, archivePath, join(root, 'work', 'extract'))).rejects.toThrow(
      /same name/
    )
  })

  it('extracts flat entries with their bytes', async () => {
    const archivePath = join(root, 'inbox', 'good.dat')
    await writeFile(
      archivePath,
      dat([
        ['mefc001.epf', 'EPF'],
        ['legend.pal', 'PAL']
      ])
    )
    await expect(extractArchive(ctx, archivePath, join(root, 'work', 'extract'))).resolves.toEqual({
      count: 2
    })
    expect(await text(join(root, 'work', 'extract', 'mefc001.epf'))).toBe('EPF')
    expect(await text(join(root, 'work', 'extract', 'legend.pal'))).toBe('PAL')
  })

  it('refuses an archive or a folder outside the allowed roots', async () => {
    await mkdir(join(root, 'outside'), { recursive: true })
    const archivePath = join(root, 'inbox', 'good.dat')
    await writeFile(archivePath, dat([['a.txt', 'A']]))
    await expect(extractArchive(ctx, archivePath, join(root, 'outside'))).rejects.toThrow(
      /not inside any allowed root/
    )
    await writeFile(join(root, 'outside', 'b.dat'), dat([['a.txt', 'A']]))
    await expect(
      extractArchive(ctx, join(root, 'outside', 'b.dat'), join(root, 'work', 'extract'))
    ).rejects.toThrow(/not inside any allowed root/)
  })
})
