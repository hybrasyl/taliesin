/**
 * The real-path half of pathSafety (HTOO-675), on a real filesystem with real
 * links: a junction on Windows (no admin rights needed), a symlink elsewhere.
 * The string half is in pathSafety.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, sep } from 'path'
import {
  assertRealInside,
  assertRealInsideAnyRoot,
  realContains,
  realpathAllowMissing
} from '../pathSafety'

let base: string
let root: string
let outside: string

async function link(target: string, at: string): Promise<void> {
  await fs.symlink(target, at, process.platform === 'win32' ? 'junction' : 'dir')
}

beforeEach(async () => {
  base = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'taliesin-real-')))
  root = join(base, 'root')
  outside = join(base, 'outside')
  await fs.mkdir(root)
  await fs.mkdir(outside)
})

afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true })
})

describe('realpathAllowMissing', () => {
  it('resolves an existing path', async () => {
    expect(await realpathAllowMissing(root)).toBe(root)
  })

  it('judges a new path by the folder it goes into', async () => {
    await link(outside, join(root, 'door'))
    expect(await realpathAllowMissing(join(root, 'door', 'new', 'file.txt'))).toBe(
      join(outside, 'new', 'file.txt')
    )
  })

  it('keeps the missing tail in order', async () => {
    expect(await realpathAllowMissing(join(root, 'a', 'b', 'c'))).toBe(join(root, 'a', 'b', 'c'))
  })

  it('rethrows an error that is not "missing"', async () => {
    await expect(realpathAllowMissing('\0bad')).rejects.toThrow()
  })
})

describe('realContains', () => {
  it('is true for the folder itself and below it', () => {
    expect(realContains(root, root)).toBe(true)
    expect(realContains(root, join(root, 'x'))).toBe(true)
    expect(realContains(root + sep, join(root, 'x'))).toBe(true)
  })

  it('is false for a sibling with a longer name', () => {
    expect(realContains(root, root + '-evil')).toBe(false)
  })

  it.runIf(process.platform === 'win32')('folds case on Windows', () => {
    expect(realContains(root.toUpperCase(), join(root, 'x').toLowerCase())).toBe(true)
  })

  it('handles a filesystem root', () => {
    const top = process.platform === 'win32' ? root.slice(0, 3) : '/'
    expect(realContains(top, root)).toBe(true)
  })
})

describe('assertRealInside', () => {
  it('accepts a plain child and returns the string path', async () => {
    expect(await assertRealInside(root, 'a.txt')).toBe(join(root, 'a.txt'))
  })

  it('refuses a child reached through a link', async () => {
    await link(outside, join(root, 'door'))
    await expect(assertRealInside(root, join('door', 'a.txt'))).rejects.toThrow(/through a link/)
  })

  it('still refuses a string escape first', async () => {
    await expect(assertRealInside(root, '../x')).rejects.toThrow(/traversal/)
  })
})

describe('assertRealInsideAnyRoot', () => {
  it('accepts a path in a root, with its real path', async () => {
    expect(await assertRealInsideAnyRoot([root], join(root, 'a'))).toEqual({
      path: join(root, 'a'),
      real: join(root, 'a')
    })
  })

  it('refuses a link out of every root', async () => {
    await link(outside, join(root, 'door'))
    await expect(assertRealInsideAnyRoot([root], join(root, 'door', 'x'))).rejects.toThrow(
      /every allowed root through a link/
    )
  })

  it('accepts a link from one root into another', async () => {
    await link(outside, join(root, 'door'))
    const r = await assertRealInsideAnyRoot([root, outside], join(root, 'door', 'x'))
    expect(r.real).toBe(join(outside, 'x'))
  })

  it('accepts a root that is itself a link', async () => {
    const linked = join(base, 'linked')
    await link(outside, linked)
    expect((await assertRealInsideAnyRoot([linked], join(linked, 'x'))).path).toBe(
      join(linked, 'x')
    )
  })
})
