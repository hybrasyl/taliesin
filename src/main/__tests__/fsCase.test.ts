import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'path'

// HTOO-287. A local `readdir` stub rather than the shared memory fs, for one
// reason worth stating: that helper lives under `src/renderer`, and importing it
// from a main-process test pulls a renderer file into the node tsconfig project,
// where the renderer's global types do not exist. The module under test touches
// exactly one fs function, so the stub is smaller than the coupling.
//
// Every case below is the case-SENSITIVE filesystem — Linux and macOS. On the
// real Windows filesystem these would pass without the code under test.
const readdir = vi.hoisted(() => vi.fn())
vi.mock('fs', () => ({ promises: { readdir } }))

const { matchNameIgnoringCase, resolveClientFile } = await import('../fsCase')

beforeEach(() => {
  readdir.mockReset()
})

describe('matchNameIgnoringCase', () => {
  it('finds a name whatever its casing', () => {
    expect(matchNameIgnoringCase(['Legend.dat'], 'legend.dat')).toBe('Legend.dat')
    expect(matchNameIgnoringCase(['LEGEND.DAT'], 'legend.dat')).toBe('LEGEND.DAT')
    expect(matchNameIgnoringCase(['legend.dat'], 'legend.dat')).toBe('legend.dat')
  })

  it('prefers an exact match over a case-folded one', () => {
    // Both can exist on a case-sensitive filesystem, and the order `readdir`
    // returns them in is not something to depend on. Asking for `legend.dat`
    // must get `legend.dat`.
    expect(matchNameIgnoringCase(['Legend.dat', 'legend.dat'], 'legend.dat')).toBe('legend.dat')
    expect(matchNameIgnoringCase(['legend.dat', 'Legend.dat'], 'Legend.dat')).toBe('Legend.dat')
  })

  it('returns null rather than a near miss', () => {
    expect(matchNameIgnoringCase(['khanpal.dat'], 'legend.dat')).toBeNull()
    expect(matchNameIgnoringCase([], 'legend.dat')).toBeNull()
  })
})

describe('resolveClientFile', () => {
  it('resolves the installer’s mixed-case name', async () => {
    readdir.mockResolvedValue(['Legend.dat', 'khanpal.dat'])
    expect(await resolveClientFile('/client', 'legend.dat')).toBe(join('/client', 'Legend.dat'))
  })

  it('falls back to the requested name when the directory has no match', async () => {
    // A resolution step, not an existence check. The caller's own error handling
    // still runs, and its message still names the file the caller asked for
    // rather than one this function invented.
    readdir.mockResolvedValue(['khanpal.dat'])
    expect(await resolveClientFile('/client', 'legend.dat')).toBe(join('/client', 'legend.dat'))
  })

  it('falls back when the directory cannot be read at all', async () => {
    readdir.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    expect(await resolveClientFile('/nowhere', 'legend.dat')).toBe(join('/nowhere', 'legend.dat'))
  })
})
