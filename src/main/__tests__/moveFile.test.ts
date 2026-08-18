/**
 * Renaming a file in place, including the rename that only changes capitals.
 *
 * The editors used to ask `fs:exists` before a rename and refuse a destination
 * that answered yes. On Windows that question is answered case-insensitively,
 * so renaming `abel.xml` to `Abel.xml` was refused as a collision **with
 * itself** — the rename a person most often wants, and the one that could not
 * be done at all (HTOO-379).
 *
 * The check moved into `moveFile`, where identity is decided by `realpath`
 * rather than by whether a path answers to a name.
 *
 * These tests run on whatever filesystem the machine has. The case-only rename
 * is therefore two different journeys with one destination: on Windows and
 * macOS the destination already answers to the new name and identity is what
 * allows the move; on Linux nothing is there at all. Both must end with one
 * file, spelled the new way.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { mkdtemp, rm, writeFile, readFile, readdir } from 'fs/promises'
import { moveFile } from '../handlers'

type Ctx = Parameters<typeof moveFile>[0]

let dir: string
let ctx: Ctx

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'taliesin-move-'))
  ctx = {
    settingsPath: dir,
    settingsRoots: new Set([dir]),
    blessedRoots: new Set<string>()
  } as unknown as Ctx
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('moveFile', () => {
  it('renames a file', async () => {
    await writeFile(join(dir, 'abel.xml'), 'MAP')

    await moveFile(ctx, join(dir, 'abel.xml'), join(dir, 'piet.xml'))

    expect(await readdir(dir)).toEqual(['piet.xml'])
    expect((await readFile(join(dir, 'piet.xml'))).toString()).toBe('MAP')
  })

  it('performs a rename that only changes capitals', async () => {
    // The whole point of the card. On a case-insensitive filesystem the
    // destination "exists" before the move and is the source itself.
    await writeFile(join(dir, 'abel.xml'), 'MAP')

    await moveFile(ctx, join(dir, 'abel.xml'), join(dir, 'Abel.xml'))

    const after = await readdir(dir)
    expect(after).toHaveLength(1)
    expect(after[0]).toBe('Abel.xml')
    expect((await readFile(join(dir, 'Abel.xml'))).toString()).toBe('MAP')
  })

  it('refuses a destination held by a different file, and touches neither', async () => {
    await writeFile(join(dir, 'abel.xml'), 'ABEL')
    await writeFile(join(dir, 'piet.xml'), 'PIET')

    await expect(moveFile(ctx, join(dir, 'abel.xml'), join(dir, 'piet.xml'))).rejects.toThrow(
      /"piet\.xml" already exists/
    )

    expect((await readdir(dir)).sort()).toEqual(['abel.xml', 'piet.xml'])
    expect((await readFile(join(dir, 'abel.xml'))).toString()).toBe('ABEL')
    expect((await readFile(join(dir, 'piet.xml'))).toString()).toBe('PIET')
  })

  it('names the file in the message, so the editor can show it as it is', async () => {
    await writeFile(join(dir, 'abel.xml'), 'ABEL')
    await writeFile(join(dir, 'Mileth Inn.xml'), 'INN')

    await expect(moveFile(ctx, join(dir, 'abel.xml'), join(dir, 'Mileth Inn.xml'))).rejects.toThrow(
      '"Mileth Inn.xml" already exists in that folder'
    )
  })

  it('moves into a folder that does not exist yet', async () => {
    await writeFile(join(dir, 'abel.xml'), 'MAP')

    await moveFile(ctx, join(dir, 'abel.xml'), join(dir, 'towns', 'abel.xml'))

    expect(await readdir(join(dir, 'towns'))).toEqual(['abel.xml'])
  })

  it('refuses a source outside the allowed roots', async () => {
    // The roots check runs before anything else, as it did before.
    await expect(
      moveFile(ctx, join(tmpdir(), 'elsewhere.xml'), join(dir, 'a.xml'))
    ).rejects.toThrow()
  })

  it('refuses a destination outside the allowed roots', async () => {
    await writeFile(join(dir, 'abel.xml'), 'MAP')
    await expect(
      moveFile(ctx, join(dir, 'abel.xml'), join(tmpdir(), 'elsewhere.xml'))
    ).rejects.toThrow()
    expect(await readdir(dir)).toEqual(['abel.xml'])
  })

  it('reports the source being absent as a move failure, not as a collision', async () => {
    // A missing source must not be reported as "already exists": the identity
    // check cannot resolve either path, and saying the wrong thing about why a
    // rename failed is what this card is about.
    await expect(moveFile(ctx, join(dir, 'gone.xml'), join(dir, 'new.xml'))).rejects.toThrow(
      /ENOENT/
    )
  })
})
