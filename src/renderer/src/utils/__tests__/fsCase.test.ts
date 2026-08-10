// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { matchNameIgnoringCase, resolveClientFile } from '../fsCase'

// HTOO-287. The renderer half of the same rule main's `fsCase.ts` carries: ask
// the directory for the real casing rather than guessing at the casings seen in
// the wild. The matcher is duplicated between the two processes on purpose —
// they reach the filesystem differently — so both copies are pinned.

const listDir = vi.fn()

beforeEach(() => {
  listDir.mockReset()
  ;(window as unknown as { api: { listDir: typeof listDir } }).api = { listDir }
})

/** `listDir` returns DirEntry[]; only files are candidates. */
function entries(...names: string[]) {
  return names.map((name) => ({ name, isDirectory: false }))
}

describe('matchNameIgnoringCase', () => {
  it('finds a name whatever its casing', () => {
    expect(matchNameIgnoringCase(['Legend.dat'], 'legend.dat')).toBe('Legend.dat')
    expect(matchNameIgnoringCase(['LEGEND.DAT'], 'legend.dat')).toBe('LEGEND.DAT')
  })

  it('prefers an exact match over a case-folded one', () => {
    expect(matchNameIgnoringCase(['Legend.dat', 'legend.dat'], 'legend.dat')).toBe('legend.dat')
  })

  it('returns null rather than a near miss', () => {
    expect(matchNameIgnoringCase(['khanpal.dat'], 'legend.dat')).toBeNull()
  })
})

describe('resolveClientFile', () => {
  it('resolves the installer’s mixed-case name', async () => {
    listDir.mockResolvedValue(entries('Legend.dat', 'khanpal.dat'))
    expect(await resolveClientFile('/client', 'legend.dat')).toBe('/client/Legend.dat')
  })

  it('ignores a DIRECTORY that happens to share the name', async () => {
    // `npc` is a real subdirectory of a client install, and the archive inside it
    // is `npc/npc.dat`. A resolver that matched directories could hand a caller a
    // path to a folder, and the read error that follows says nothing useful.
    listDir.mockResolvedValue([
      { name: 'Legend.dat', isDirectory: true },
      { name: 'legend.dat', isDirectory: false }
    ])
    expect(await resolveClientFile('/client', 'LEGEND.DAT')).toBe('/client/legend.dat')
  })

  it('honours the separator, because callers build Windows paths too', async () => {
    listDir.mockResolvedValue(entries('Legend.dat'))
    expect(await resolveClientFile('C:\\DA', 'legend.dat', '\\')).toBe('C:\\DA\\Legend.dat')
  })

  it('falls back to the requested name when nothing matches', async () => {
    listDir.mockResolvedValue(entries('khanpal.dat'))
    expect(await resolveClientFile('/client', 'legend.dat')).toBe('/client/legend.dat')
  })

  it('falls back when the directory cannot be listed', async () => {
    // A resolution step, not an existence check: the caller's own catch still
    // runs, and its message still names the file the caller asked for.
    listDir.mockRejectedValue(new Error('ENOENT'))
    expect(await resolveClientFile('/client', 'legend.dat')).toBe('/client/legend.dat')
  })
})
