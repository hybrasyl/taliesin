import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { readFileSync } from 'fs'
import { dialogDefaultPath, pickedFolder, pickerStartPath } from '../pickerStart'

const onDisk = new Set([
  join('/client'),
  join('/client', 'legend.dat'),
  join('/home/me/Documents'),
  join('/home/me')
])
const exists = (p: string): boolean => onDisk.has(p)

describe('pickerStartPath', () => {
  it('takes the first candidate that exists', () => {
    expect(pickerStartPath([join('/client'), join('/home/me')], exists)).toBe(join('/client'))
  })

  it('skips a stale setting, an empty string and a missing value', () => {
    expect(
      pickerStartPath([null, undefined, '', join('/moved'), join('/home/me/Documents')], exists)
    ).toBe(join('/home/me/Documents'))
  })

  it('returns undefined when nothing exists, so the dialog gets no defaultPath', () => {
    expect(pickerStartPath([join('/nope')], exists)).toBeUndefined()
    expect(pickerStartPath([], exists)).toBeUndefined()
  })
})

describe('pickedFolder', () => {
  it('keeps a picked folder, and takes the parent of a picked file', () => {
    expect(pickedFolder(join('/client'), true)).toBe(join('/client'))
    expect(pickedFolder(join('/client', 'legend.dat'), false)).toBe(join('/client'))
  })
})

describe('dialogDefaultPath', () => {
  const start = join('/home/me/Documents')

  it('uses the start folder when the renderer names nothing', () => {
    expect(dialogDefaultPath(undefined, start, { exists })).toBe(start)
    expect(dialogDefaultPath(null, start, { exists })).toBe(start)
    expect(dialogDefaultPath('', start, { exists })).toBe(start)
  })

  it('keeps an absolute path whose target or parent exists', () => {
    expect(dialogDefaultPath(join('/client'), start, { exists })).toBe(join('/client'))
    expect(dialogDefaultPath(join('/client', 'new.datf'), start, { exists })).toBe(
      join('/client', 'new.datf')
    )
  })

  it('puts a bare save name in the start folder, not in Downloads', () => {
    expect(dialogDefaultPath('map.png', start, { keepName: true, exists })).toBe(
      join(start, 'map.png')
    )
  })

  it('moves a stale save path to the start folder and keeps its name', () => {
    expect(dialogDefaultPath(join('/moved', 'pack.datf'), start, { keepName: true, exists })).toBe(
      join(start, 'pack.datf')
    )
  })

  it('drops the name of a stale folder for an open dialog', () => {
    expect(dialogDefaultPath(join('/moved', 'packs'), start, { exists })).toBe(start)
  })

  it('passes the request through when there is no start folder', () => {
    expect(dialogDefaultPath('map.png', undefined, { exists })).toBe('map.png')
    expect(dialogDefaultPath(undefined, undefined, { exists })).toBeUndefined()
  })
})

// A picker added later without a defaultPath opens in Downloads on Electron 43+,
// and nothing else would notice.
describe('every picker in handlers.ts passes a defaultPath', () => {
  const src = readFileSync(join(__dirname, '..', 'handlers.ts'), 'utf8')
  const calls = [...src.matchAll(/dialog\.show(?:Open|Save)Dialog\(/g)].map((m) => {
    // The options object: from the call to its closing `})`.
    const rest = src.slice(m.index)
    return rest.slice(0, rest.indexOf('})') + 2)
  })

  it('finds the pickers (guard the guard)', () => {
    expect(calls.length).toBeGreaterThanOrEqual(4)
  })

  it('gives each one a start folder', () => {
    const missing = calls.filter((c) => !/defaultPath\s*:/.test(c))
    expect(missing).toEqual([])
  })
})
