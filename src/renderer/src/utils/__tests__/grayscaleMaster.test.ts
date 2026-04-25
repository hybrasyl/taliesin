import { describe, it, expect, vi } from 'vitest'
import {
  masterPathFor,
  shouldRegenerate,
  ensureMasterFresh,
  type MasterIODeps
} from '../grayscaleMaster'
import type { PixelBuffer } from '../duotone'

const TINY: PixelBuffer = {
  data: new Uint8ClampedArray([10, 20, 30, 255]),
  width: 1,
  height: 1
}
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

function makeDeps(overrides: Partial<MasterIODeps> = {}): MasterIODeps {
  return {
    stat: vi.fn().mockResolvedValue(null),
    writeBytes: vi.fn().mockResolvedValue(undefined),
    loadPixels: vi.fn().mockResolvedValue(TINY),
    encodePng: vi.fn().mockResolvedValue(PNG_BYTES),
    ...overrides
  }
}

describe('masterPathFor', () => {
  it('places masters under {packDir}/_masters/ with the source basename + .png', () => {
    expect(masterPathFor('/pack', '/icons/eagle.png')).toBe('/pack/_masters/eagle.png')
  })

  it('handles Windows-style source paths', () => {
    expect(masterPathFor('/pack', 'C:\\icons\\eagle.png')).toBe('/pack/_masters/eagle.png')
  })

  it('strips only the source extension, preserving inner dots', () => {
    expect(masterPathFor('/pack', '/icons/foo.bar.png')).toBe('/pack/_masters/foo.bar.png')
  })
})

describe('shouldRegenerate', () => {
  it('returns true when force=true regardless of stats', () => {
    expect(shouldRegenerate({ mtimeMs: 100 }, { mtimeMs: 50 }, true)).toBe(true)
  })

  it('returns true when the master is missing', () => {
    expect(shouldRegenerate(null, { mtimeMs: 50 }, false)).toBe(true)
  })

  it('returns true when source mtime is newer than the master', () => {
    expect(shouldRegenerate({ mtimeMs: 100 }, { mtimeMs: 200 }, false)).toBe(true)
  })

  it('returns false when the master is at least as new as the source', () => {
    expect(shouldRegenerate({ mtimeMs: 200 }, { mtimeMs: 100 }, false)).toBe(false)
    expect(shouldRegenerate({ mtimeMs: 200 }, { mtimeMs: 200 }, false)).toBe(false)
  })

  it('returns false when source stat is unavailable but master exists (let read error surface)', () => {
    expect(shouldRegenerate({ mtimeMs: 100 }, null, false)).toBe(false)
  })
})

describe('ensureMasterFresh', () => {
  it('regenerates the master when none exists on disk', async () => {
    const deps = makeDeps({
      stat: vi
        .fn()
        .mockResolvedValueOnce(null) // master
        .mockResolvedValueOnce({ mtimeMs: 100, sizeBytes: 1 }) // source
    })
    const result = await ensureMasterFresh('/pack', '/icons/eagle.png', {}, deps)
    expect(result).toEqual({ masterPath: '/pack/_masters/eagle.png', regenerated: true })
    expect(deps.loadPixels).toHaveBeenCalledWith('/icons/eagle.png')
    expect(deps.encodePng).toHaveBeenCalled()
    expect(deps.writeBytes).toHaveBeenCalledWith('/pack/_masters/eagle.png', PNG_BYTES)
  })

  it('skips regeneration when the master is fresh (cache hit)', async () => {
    const deps = makeDeps({
      stat: vi
        .fn()
        .mockResolvedValueOnce({ mtimeMs: 200, sizeBytes: 1 }) // master
        .mockResolvedValueOnce({ mtimeMs: 100, sizeBytes: 1 }) // source (older)
    })
    const result = await ensureMasterFresh('/pack', '/icons/eagle.png', {}, deps)
    expect(result.regenerated).toBe(false)
    expect(deps.loadPixels).not.toHaveBeenCalled()
    expect(deps.encodePng).not.toHaveBeenCalled()
    expect(deps.writeBytes).not.toHaveBeenCalled()
  })

  it('regenerates when the source has been modified after the master', async () => {
    const deps = makeDeps({
      stat: vi
        .fn()
        .mockResolvedValueOnce({ mtimeMs: 100, sizeBytes: 1 }) // master (older)
        .mockResolvedValueOnce({ mtimeMs: 200, sizeBytes: 1 }) // source (newer)
    })
    const result = await ensureMasterFresh('/pack', '/icons/eagle.png', {}, deps)
    expect(result.regenerated).toBe(true)
    expect(deps.writeBytes).toHaveBeenCalledTimes(1)
  })

  it('regenerates unconditionally when force=true and skips the stat round-trip', async () => {
    const stat = vi.fn().mockResolvedValue({ mtimeMs: 999, sizeBytes: 1 })
    const deps = makeDeps({ stat })
    const result = await ensureMasterFresh('/pack', '/icons/eagle.png', { force: true }, deps)
    expect(result.regenerated).toBe(true)
    expect(stat).not.toHaveBeenCalled()
    expect(deps.writeBytes).toHaveBeenCalledTimes(1)
  })
})
