import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  filenameFromPath,
  dirnameFromPath,
  basenameFromPath,
  outputFilename,
  paletteFilePath,
  calibrationFilePath,
  framePath,
  scanPalettes,
  loadPalette,
  savePalette,
  deletePalette,
  loadCalibrations,
  saveCalibrations,
  scanFrames,
} from '../paletteIO'
import type { Palette, CalibrationFile } from '../paletteTypes'

// ── Pure path helpers ─────────────────────────────────────────────────────────

describe('filenameFromPath', () => {
  it('returns the last segment of a posix path', () => {
    expect(filenameFromPath('a/b/c.txt')).toBe('c.txt')
  })
  it('handles backslashes (Windows paths)', () => {
    expect(filenameFromPath('a\\b\\c.txt')).toBe('c.txt')
  })
  it('handles mixed separators', () => {
    expect(filenameFromPath('a\\b/c.txt')).toBe('c.txt')
  })
  it('returns the input when there is no separator', () => {
    expect(filenameFromPath('foo.json')).toBe('foo.json')
  })
})

describe('dirnameFromPath', () => {
  it('returns the parent directory portion (posix)', () => {
    expect(dirnameFromPath('a/b/c.txt')).toBe('a/b')
  })
  it('returns the parent directory portion (windows)', () => {
    expect(dirnameFromPath('a\\b\\c.txt')).toBe('a/b')
  })
  it('returns empty string when there is no directory', () => {
    expect(dirnameFromPath('foo.json')).toBe('')
  })
})

describe('basenameFromPath', () => {
  it('strips the extension', () => {
    expect(basenameFromPath('a/b/foo.json')).toBe('foo')
  })
  it('handles files with multiple dots (strips last extension only)', () => {
    expect(basenameFromPath('foo.tar.gz')).toBe('foo.tar')
  })
  it('returns the full name when the dot is at index 0 (dotfile)', () => {
    expect(basenameFromPath('.gitignore')).toBe('.gitignore')
  })
  it('returns the full name when there is no dot', () => {
    expect(basenameFromPath('README')).toBe('README')
  })
})

describe('outputFilename', () => {
  it('joins source/palette/entry with underscores and a .png extension', () => {
    expect(outputFilename('icon01', 'fire-pal', 'fire')).toBe('icon01_fire-pal_fire.png')
  })
})

describe('paletteFilePath', () => {
  it('builds <packDir>/_palettes/<id>.json', () => {
    expect(paletteFilePath('/tmp/pack', 'fire')).toBe('/tmp/pack/_palettes/fire.json')
  })
})

describe('calibrationFilePath', () => {
  it('builds <packDir>/_calibrations/<id>.json', () => {
    expect(calibrationFilePath('/tmp/pack', 'fire')).toBe('/tmp/pack/_calibrations/fire.json')
  })
})

describe('framePath', () => {
  it('builds <packDir>/_frames/<frame>', () => {
    expect(framePath('/tmp/pack', 'idle.png')).toBe('/tmp/pack/_frames/idle.png')
  })
})

// ── window.api wrappers ───────────────────────────────────────────────────────

interface ApiStub {
  paletteScan: ReturnType<typeof vi.fn>
  paletteLoad: ReturnType<typeof vi.fn>
  paletteSave: ReturnType<typeof vi.fn>
  paletteDelete: ReturnType<typeof vi.fn>
  paletteCalibrationLoad: ReturnType<typeof vi.fn>
  paletteCalibrationSave: ReturnType<typeof vi.fn>
  frameScan: ReturnType<typeof vi.fn>
}

let api: ApiStub

beforeEach(() => {
  api = {
    paletteScan: vi.fn(),
    paletteLoad: vi.fn(),
    paletteSave: vi.fn(),
    paletteDelete: vi.fn(),
    paletteCalibrationLoad: vi.fn(),
    paletteCalibrationSave: vi.fn(),
    frameScan: vi.fn(),
  }
  ;(globalThis as unknown as { window: { api: ApiStub } }).window = { api }
})

describe('scanPalettes', () => {
  it('delegates to window.api.paletteScan with the pack dir', async () => {
    api.paletteScan.mockResolvedValue([{ filename: 'a.json', id: 'a', name: 'A', entryCount: 1 }])
    const result = await scanPalettes('/p')
    expect(api.paletteScan).toHaveBeenCalledWith('/p')
    expect(result).toEqual([{ filename: 'a.json', id: 'a', name: 'A', entryCount: 1 }])
  })
})

describe('loadPalette', () => {
  it('builds the palette path and forwards to window.api.paletteLoad', async () => {
    const fake: Palette = { id: 'fire', name: 'Fire', version: 1, lastModified: '2024-01-01T00:00:00Z', entries: [] }
    api.paletteLoad.mockResolvedValue(fake)
    const result = await loadPalette('/p', 'fire')
    expect(api.paletteLoad).toHaveBeenCalledWith('/p/_palettes/fire.json')
    expect(result).toBe(fake)
  })
})

describe('savePalette', () => {
  it('uses the palette id as the filename', async () => {
    const palette: Palette = { id: 'water', name: 'Water', version: 1, lastModified: '2024-01-01T00:00:00Z', entries: [] }
    await savePalette('/p', palette)
    expect(api.paletteSave).toHaveBeenCalledWith('/p/_palettes/water.json', palette)
  })
})

describe('deletePalette', () => {
  it('targets the canonical palette file path', async () => {
    await deletePalette('/p', 'fire')
    expect(api.paletteDelete).toHaveBeenCalledWith('/p/_palettes/fire.json')
  })
})

describe('loadCalibrations', () => {
  it('returns the raw value when truthy', async () => {
    const cal = { source: 'thing' } as unknown as CalibrationFile
    api.paletteCalibrationLoad.mockResolvedValue(cal)
    expect(await loadCalibrations('/p', 'fire')).toBe(cal)
    expect(api.paletteCalibrationLoad).toHaveBeenCalledWith('/p', 'fire')
  })

  it('coerces null/undefined to an empty object (legacy-format normalization at line 58)', async () => {
    api.paletteCalibrationLoad.mockResolvedValue(null)
    expect(await loadCalibrations('/p', 'fire')).toEqual({})
    api.paletteCalibrationLoad.mockResolvedValue(undefined)
    expect(await loadCalibrations('/p', 'fire')).toEqual({})
  })
})

describe('saveCalibrations', () => {
  it('forwards packDir, paletteId, and data', async () => {
    const data = { x: 1 } as unknown as CalibrationFile
    await saveCalibrations('/p', 'fire', data)
    expect(api.paletteCalibrationSave).toHaveBeenCalledWith('/p', 'fire', data)
  })
})

describe('scanFrames', () => {
  it('forwards the pack dir to window.api.frameScan', async () => {
    api.frameScan.mockResolvedValue(['a.png', 'b.png'])
    expect(await scanFrames('/p')).toEqual(['a.png', 'b.png'])
    expect(api.frameScan).toHaveBeenCalledWith('/p')
  })
})
