/**
 * Renumbering a committed tile.
 *
 * For `static_tiles` the filename IS the tile id, so a run committed to the
 * wrong number used to mean deleting every tile and converting the art again.
 * This is the rename that replaces that.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'fs/promises'
import { packRenameAsset } from '../handlers'

type Ctx = Parameters<typeof packRenameAsset>[0]

let dir: string
let packDir: string
let ctx: Ctx

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'taliesin-rename-'))
  packDir = join(dir, 'pack')
  await mkdir(packDir, { recursive: true })
  ctx = {
    settingsPath: dir,
    settingsRoots: new Set([dir]),
    blessedRoots: new Set<string>()
  } as unknown as Ctx
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('packRenameAsset', () => {
  it('moves the art to the new number', async () => {
    await writeFile(join(packDir, 'floor00001.png'), 'ART')

    await packRenameAsset(ctx, packDir, 'floor00001.png', 'floor24000.png')

    expect(await readdir(packDir)).toEqual(['floor24000.png'])
    expect((await readFile(join(packDir, 'floor24000.png'))).toString()).toBe('ART')
  })

  it('refuses to overwrite, and leaves both files alone', async () => {
    // The art already at the target id is what this exists to protect: a
    // silent overwrite here destroys work while undoing a numbering mistake.
    await writeFile(join(packDir, 'floor00001.png'), 'MINE')
    await writeFile(join(packDir, 'floor00002.png'), 'THEIRS')

    await expect(packRenameAsset(ctx, packDir, 'floor00001.png', 'floor00002.png')).rejects.toThrow(
      /already exists/
    )

    expect((await readFile(join(packDir, 'floor00001.png'))).toString()).toBe('MINE')
    expect((await readFile(join(packDir, 'floor00002.png'))).toString()).toBe('THEIRS')
  })

  it('does nothing when the number has not changed', async () => {
    await writeFile(join(packDir, 'wall09200.png'), 'ART')
    await expect(
      packRenameAsset(ctx, packDir, 'wall09200.png', 'wall09200.png')
    ).resolves.toBeUndefined()
    expect((await readFile(join(packDir, 'wall09200.png'))).toString()).toBe('ART')
  })

  it('refuses a name that climbs out of the pack directory', async () => {
    await writeFile(join(packDir, 'floor00001.png'), 'ART')
    await writeFile(join(dir, 'outside.png'), 'NOT YOURS')

    await expect(
      packRenameAsset(ctx, packDir, 'floor00001.png', '../outside.png')
    ).rejects.toThrow()
    expect((await readFile(join(dir, 'outside.png'))).toString()).toBe('NOT YOURS')
  })

  it('refuses to read a source from outside the pack directory', async () => {
    await writeFile(join(dir, 'outside.png'), 'NOT YOURS')
    await expect(
      packRenameAsset(ctx, packDir, '../outside.png', 'floor00001.png')
    ).rejects.toThrow()
  })

  it('reports a missing source rather than creating an empty entry', async () => {
    await expect(
      packRenameAsset(ctx, packDir, 'floor00404.png', 'floor00001.png')
    ).rejects.toThrow()
    expect(await readdir(packDir)).toEqual([])
  })
})
