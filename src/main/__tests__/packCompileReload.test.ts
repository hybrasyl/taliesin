/**
 * HTOO-421: a compiled .datf must be visible without a restart.
 *
 * `loadPacks` binds each pack's zip directory and entry map at scan time, so
 * writing a .datf over one main already holds changed nothing until relaunch.
 * This process is the one that wrote it, so it is the one that refreshes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'fs/promises'

const loadPacksSpy = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('../assetPacks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../assetPacks')>()
  return { ...actual, loadPacks: loadPacksSpy }
})

const { packCompile } = await import('../handlers')
type Ctx = Parameters<typeof packCompile>[0]

let dir: string
let ctx: Ctx

beforeEach(async () => {
  loadPacksSpy.mockClear()
  dir = await mkdtemp(join(tmpdir(), 'taliesin-compile-'))
  ctx = {
    settingsPath: dir,
    settingsRoots: new Set([dir]),
    blessedRoots: new Set<string>(),
    settingsManager: { load: async () => ({ brigidAssetsPath: dir, clientPath: null }) }
  } as unknown as Ctx
})

describe('pack:compile', () => {
  it('re-reads the pack set once the archive is written', async () => {
    const packDir = join(dir, 'pack')
    await mkdir(packDir, { recursive: true })
    await writeFile(join(packDir, 'floor00001.png'), 'PNG')

    await packCompile(
      ctx,
      packDir,
      {
        schema_version: 1,
        pack_id: 'p',
        pack_version: '1.0.0',
        content_type: 'static_tiles',
        priority: 100,
        covers: { static_tiles: {} }
      },
      ['floor00001.png'],
      join(dir, 'p.datf')
    )

    expect(loadPacksSpy).toHaveBeenCalledTimes(1)
    await rm(dir, { recursive: true, force: true })
  })

  it('reports the compile as successful even if the refresh fails', async () => {
    // The archive is on disk either way. Failing the compile because the
    // bookkeeping afterwards failed would be a worse answer than the old
    // behaviour, which was no refresh at all.
    loadPacksSpy.mockRejectedValueOnce(new Error('nope'))
    const packDir = join(dir, 'pack2')
    await mkdir(packDir, { recursive: true })
    await writeFile(join(packDir, 'floor00002.png'), 'PNG')

    await expect(
      packCompile(
        ctx,
        packDir,
        {
          schema_version: 1,
          pack_id: 'q',
          pack_version: '1.0.0',
          content_type: 'static_tiles',
          priority: 100,
          covers: { static_tiles: {} }
        },
        ['floor00002.png'],
        join(dir, 'q.datf')
      )
    ).resolves.toBeUndefined()

    await rm(dir, { recursive: true, force: true })
  })
})

describe('pack:compile always settles', () => {
  /**
   * The compile used to listen for 'close' on the output stream and 'error' on
   * the archive, and nothing else. A failure on the OUTPUT settled neither, so
   * the promise waited forever for a close that was not coming — the renderer's
   * Compile button spun with no error reported anywhere. On Windows that is one
   * file lock away.
   *
   * Every one of these would have hung before. `expect(...).rejects` is the
   * assertion; the test timing out is the failure.
   */

  it('rejects when the output path cannot be written', async () => {
    const packDir = join(dir, 'pack3')
    await mkdir(packDir, { recursive: true })
    await writeFile(join(packDir, 'floor00001.png'), 'PNG')
    // A directory where the archive expects a file: the stream errors, and
    // nothing else in the pipeline ever will.
    const out = join(dir, 'blocked.datf')
    await mkdir(out, { recursive: true })

    await expect(packCompile(ctx, packDir, manifest('r'), ['floor00001.png'], out)).rejects.toThrow(
      /cannot write/
    )
    await rm(dir, { recursive: true, force: true })
  })

  it('rejects when an asset went missing between save and compile', async () => {
    // Skipping it silently ships a pack short of art nobody asked it to drop.
    const packDir = join(dir, 'pack4')
    await mkdir(packDir, { recursive: true })
    await writeFile(join(packDir, 'floor00001.png'), 'PNG')

    await expect(
      packCompile(
        ctx,
        packDir,
        manifest('s'),
        ['floor00001.png', 'floor00002.png'],
        join(dir, 's.datf')
      )
    ).rejects.toThrow()
    await rm(dir, { recursive: true, force: true })
  })

  it('still writes every asset it was given', async () => {
    const packDir = join(dir, 'pack5')
    await mkdir(packDir, { recursive: true })
    await writeFile(join(packDir, 'floor00001.png'), 'PNG-1')
    await writeFile(join(packDir, 'wall09200.png'), 'PNG-2')
    const out = join(dir, 't.datf')

    await packCompile(ctx, packDir, manifest('t'), ['floor00001.png', 'wall09200.png'], out)

    // A zip, with something in it — the guard above must not have aborted a
    // healthy compile.
    const bytes = await readFile(out)
    expect(bytes.subarray(0, 2).toString()).toBe('PK')
    expect(bytes.length).toBeGreaterThan(100)
    await rm(dir, { recursive: true, force: true })
  })
})

describe('pack:compile keeps the old pack until the new one is whole (HTOO-638)', () => {
  /**
   * Opening the output empties it at once. The compile used to write straight
   * into it, so a compile that failed after that left a broken .datf where a
   * working one had been — in Brigid's assets folder, the installed pack. It
   * writes beside the output now, and renames over it only on success.
   */

  it('leaves the old pack as it was when an asset is missing', async () => {
    const packDir = join(dir, 'pack6')
    await mkdir(packDir, { recursive: true })
    await writeFile(join(packDir, 'floor00001.png'), 'PNG')
    const out = join(dir, 'u.datf')
    await writeFile(out, 'OLD PACK')

    await expect(
      packCompile(ctx, packDir, manifest('u'), ['floor00001.png', 'gone.png'], out)
    ).rejects.toThrow(/cannot add an asset to the pack/)

    expect((await readFile(out)).toString()).toBe('OLD PACK')
    expect(await readdir(dir)).not.toContain('u.datf.tmp')
    await rm(dir, { recursive: true, force: true })
  })

  it('leaves no temporary file when the output cannot be written', async () => {
    const packDir = join(dir, 'pack7')
    await mkdir(packDir, { recursive: true })
    await writeFile(join(packDir, 'floor00001.png'), 'PNG')
    const out = join(dir, 'blocked2.datf')
    await mkdir(out, { recursive: true })

    await expect(packCompile(ctx, packDir, manifest('v'), ['floor00001.png'], out)).rejects.toThrow(
      /cannot write/
    )
    expect(await readdir(dir)).not.toContain('blocked2.datf.tmp')
    await rm(dir, { recursive: true, force: true })
  })

  it('replaces the old pack with one the reader opens, entry for entry', async () => {
    const packDir = join(dir, 'pack8')
    await mkdir(packDir, { recursive: true })
    // Compressible, so the entry shows whether deflate ran.
    const art = Buffer.from('ABCD'.repeat(2000))
    await writeFile(join(packDir, 'floor00001.png'), art)
    await mkdir(join(packDir, 'sub'), { recursive: true })
    await writeFile(join(packDir, 'sub', 'wall09200.png'), 'PNG-2')
    const out = join(dir, 'w.datf')
    await writeFile(out, 'OLD PACK')

    await packCompile(ctx, packDir, manifest('w'), ['floor00001.png', 'sub/wall09200.png'], out)

    expect(await readdir(dir)).not.toContain('w.datf.tmp')
    // The reader the app uses. unzipper ships no types, so this names only the
    // surface the test reads, as assetPacks.ts does.
    interface Entry {
      path: string
      compressedSize: number
      buffer(): Promise<Buffer>
    }
    const unzipper = (await import('unzipper')).default as unknown as {
      Open: { file(p: string): Promise<{ files: Entry[] }> }
    }
    const zip = await unzipper.Open.file(out)
    const byName = new Map(zip.files.map((f) => [f.path, f]))
    expect([...byName.keys()].sort()).toEqual([
      '_manifest.json',
      'floor00001.png',
      'sub/wall09200.png'
    ])
    expect(JSON.parse((await byName.get('_manifest.json')!.buffer()).toString())).toEqual(
      manifest('w')
    )
    expect(await byName.get('floor00001.png')!.buffer()).toEqual(art)
    expect((await byName.get('sub/wall09200.png')!.buffer()).toString()).toBe('PNG-2')
    expect(byName.get('floor00001.png')!.compressedSize).toBeLessThan(art.length / 10)
    await rm(dir, { recursive: true, force: true })
  })
})

function manifest(id: string): Record<string, unknown> {
  return {
    schema_version: 1,
    pack_id: id,
    pack_version: '1.0.0',
    content_type: 'static_tiles',
    priority: 100,
    covers: { static_tiles: {} }
  }
}
