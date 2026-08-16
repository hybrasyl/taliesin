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
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises'

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
