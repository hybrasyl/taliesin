import { describe, it, expect, vi } from 'vitest'
import {
  selectVariant,
  runBatch,
  colorizedDir,
  manifestPathFor,
  type BatchDeps,
  type BatchOptions,
  type BatchProgress
} from '../batchPipeline'
import type {
  Palette,
  PaletteEntry,
  EntryCalibration,
  VariantDef,
  CalibrationFile
} from '../paletteTypes'
import type { PixelBuffer } from '../duotone'
import { DEFAULT_VARIANTS } from '../variants'

const ENTRY: PaletteEntry = {
  id: 'fire',
  name: 'Fire',
  shadowColor: '#7A1A00',
  highlightColor: '#FF8A3D'
}

const TINY: PixelBuffer = {
  data: new Uint8ClampedArray([128, 128, 128, 255]),
  width: 1,
  height: 1
}

const ALWAYS_PICK_BALANCED = () => ({
  bestVariantId: 'balanced',
  scores: []
})

const ALWAYS_PICK_STRONG = () => ({
  bestVariantId: 'strong',
  scores: []
})

const strongVariant = DEFAULT_VARIANTS.find((v) => v.id === 'strong')!

const baseOptions: BatchOptions = {
  useCalibration: true,
  autoDetect: true,
  regenerateMasters: false
}

// ── selectVariant ────────────────────────────────────────────────────────────

describe('selectVariant', () => {
  it('uses overrideVariantId when set and present in the variant set', () => {
    const detect = vi.fn(ALWAYS_PICK_STRONG)
    const result = selectVariant(
      TINY,
      ENTRY,
      undefined,
      { ...baseOptions, overrideVariantId: 'subtle' },
      DEFAULT_VARIANTS,
      detect
    )
    expect(result.variant.id).toBe('subtle')
    expect(result.calibrationSource).toBe('override')
    expect(detect).not.toHaveBeenCalled()
  })

  it('falls through to the rest of the chain when override id is unknown', () => {
    const detect = vi.fn(ALWAYS_PICK_BALANCED)
    const result = selectVariant(
      TINY,
      ENTRY,
      undefined,
      { useCalibration: false, autoDetect: true, overrideVariantId: 'mystery' },
      DEFAULT_VARIANTS,
      detect
    )
    expect(result.calibrationSource).toBe('auto')
    expect(detect).toHaveBeenCalledOnce()
  })

  it('uses saved calibration verbatim when useCalibration=true and saved exists', () => {
    const saved: EntryCalibration = {
      darkFactor: 0.42,
      lightFactor: 0.13,
      midpointLow: 0.22,
      midpointHigh: 0.78,
      clampBlack: true,
      clampWhite: false,
      selectedVariantId: 'subtle',
      lastCalibrated: '2026-04-25T00:00:00Z'
    }
    const detect = vi.fn(ALWAYS_PICK_STRONG)
    const result = selectVariant(
      TINY,
      ENTRY,
      saved,
      baseOptions,
      DEFAULT_VARIANTS,
      detect
    )
    expect(result.calibrationSource).toBe('saved')
    expect(result.variant.id).toBe('subtle')
    expect(result.params).toEqual({
      darkFactor: 0.42,
      lightFactor: 0.13,
      midpointLow: 0.22,
      midpointHigh: 0.78,
      clampBlack: true,
      clampWhite: false
    })
    expect(detect).not.toHaveBeenCalled()
  })

  it('runs auto-detect when no saved calibration and autoDetect=true', () => {
    const detect = vi.fn(ALWAYS_PICK_STRONG)
    const result = selectVariant(
      TINY,
      ENTRY,
      undefined,
      baseOptions,
      DEFAULT_VARIANTS,
      detect
    )
    expect(detect).toHaveBeenCalledOnce()
    expect(result.variant.id).toBe('strong')
    expect(result.calibrationSource).toBe('auto')
    expect(result.params).toEqual({
      darkFactor: strongVariant.darkFactor,
      lightFactor: strongVariant.lightFactor,
      midpointLow: strongVariant.midpointLow,
      midpointHigh: strongVariant.midpointHigh
    })
  })

  it('runs auto-detect when useCalibration=false but autoDetect=true (saved is ignored)', () => {
    const saved: EntryCalibration = {
      darkFactor: 0.99,
      lightFactor: 0.99,
      midpointLow: 0.1,
      midpointHigh: 0.9,
      selectedVariantId: 'simple',
      lastCalibrated: '2026-04-25T00:00:00Z'
    }
    const detect = vi.fn(ALWAYS_PICK_BALANCED)
    const result = selectVariant(
      TINY,
      ENTRY,
      saved,
      { useCalibration: false, autoDetect: true },
      DEFAULT_VARIANTS,
      detect
    )
    expect(detect).toHaveBeenCalledOnce()
    expect(result.calibrationSource).toBe('auto')
    expect(result.variant.id).toBe('balanced')
  })

  it('falls back to balanced default when both useCalibration and autoDetect are false', () => {
    const detect = vi.fn(ALWAYS_PICK_STRONG)
    const result = selectVariant(
      TINY,
      ENTRY,
      undefined,
      { useCalibration: false, autoDetect: false },
      DEFAULT_VARIANTS,
      detect
    )
    expect(result.variant.id).toBe('balanced')
    expect(result.calibrationSource).toBe('default')
    expect(detect).not.toHaveBeenCalled()
  })

  it('uses the first variant when no balanced exists in a custom variant set', () => {
    const customVariants: VariantDef[] = [
      { id: 'first', label: 'First', darkFactor: 0, lightFactor: 0, midpointLow: 0.25, midpointHigh: 0.75 },
      { id: 'second', label: 'Second', darkFactor: 0.5, lightFactor: 0.5, midpointLow: 0.25, midpointHigh: 0.75 }
    ]
    const result = selectVariant(
      TINY,
      ENTRY,
      undefined,
      { useCalibration: false, autoDetect: false },
      customVariants
    )
    expect(result.variant.id).toBe('first')
    expect(result.calibrationSource).toBe('default')
  })

  it('preserves balanced fallback when saved.selectedVariantId is missing from variants (custom)', () => {
    const saved: EntryCalibration = {
      darkFactor: 0.1,
      lightFactor: 0.2,
      midpointLow: 0.3,
      midpointHigh: 0.7,
      selectedVariantId: 'custom',
      lastCalibrated: '2026-04-25T00:00:00Z'
    }
    const result = selectVariant(TINY, ENTRY, saved, baseOptions, DEFAULT_VARIANTS)
    // saved still wins (calibrationSource='saved'); variant slot falls back to balanced
    expect(result.calibrationSource).toBe('saved')
    expect(result.variant.id).toBe('balanced')
    expect(result.params.darkFactor).toBe(0.1)
  })
})

// ── path helpers ─────────────────────────────────────────────────────────────

describe('colorizedDir / manifestPathFor', () => {
  it('places the colorized output under {packDir}/_colorized', () => {
    expect(colorizedDir('/pack')).toBe('/pack/_colorized')
  })
  it('places the manifest at {packDir}/_colorized/manifest.json', () => {
    expect(manifestPathFor('/pack')).toBe('/pack/_colorized/manifest.json')
  })
})

// ── runBatch ─────────────────────────────────────────────────────────────────

const PALETTE: Palette = {
  id: 'elements',
  name: 'Elements',
  version: 1,
  lastModified: '2026-04-25T00:00:00Z',
  entries: [
    { id: 'fire', name: 'Fire', shadowColor: '#7A1A00', highlightColor: '#FF8A3D' },
    { id: 'water', name: 'Water', shadowColor: '#0A2E5C', highlightColor: '#4DA8FF' }
  ]
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

function makeDeps(overrides: Partial<BatchDeps> = {}): BatchDeps {
  return {
    loadPalette: vi.fn().mockResolvedValue(PALETTE),
    loadCalibrations: vi.fn().mockResolvedValue({} as CalibrationFile),
    loadMasterPixels: vi.fn().mockResolvedValue(TINY),
    encodePng: vi.fn().mockResolvedValue(PNG_BYTES),
    writeBytes: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    ensureDir: vi.fn().mockResolvedValue(undefined),
    detect: vi.fn(ALWAYS_PICK_BALANCED),
    ...overrides
  }
}

describe('runBatch', () => {
  it('renders every (source, entry) pair, writes outputs, and emits progress', async () => {
    const deps = makeDeps()
    const progress: BatchProgress[] = []
    const result = await runBatch(
      '/pack',
      'elements',
      ['/icons/eagle.png', '/icons/wolf.png'],
      baseOptions,
      (p) => progress.push(p),
      deps
    )

    expect(deps.ensureDir).toHaveBeenCalledWith('/pack/_colorized')
    expect(deps.writeBytes).toHaveBeenCalledTimes(4) // 2 sources × 2 entries

    const writePaths = (deps.writeBytes as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(writePaths).toContain('/pack/_colorized/eagle_elements_fire.png')
    expect(writePaths).toContain('/pack/_colorized/eagle_elements_water.png')
    expect(writePaths).toContain('/pack/_colorized/wolf_elements_fire.png')
    expect(writePaths).toContain('/pack/_colorized/wolf_elements_water.png')

    // Progress: rendering+ok per pair = 8 events; final ok count = 4
    const okEvents = progress.filter((p) => p.status === 'ok')
    expect(okEvents.length).toBe(4)
    expect(okEvents.map((p) => p.index).sort()).toEqual([0, 1, 2, 3])
    expect(progress.every((p) => p.total === 4)).toBe(true)

    expect(result.failures).toEqual([])
    expect(result.manifest.entries).toHaveLength(4)
    expect(result.manifestPath).toBe('/pack/_colorized/manifest.json')
    expect(deps.writeFile).toHaveBeenCalledOnce()
    const writtenManifest = JSON.parse(
      (deps.writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1]
    )
    expect(writtenManifest.paletteId).toBe('elements')
    expect(writtenManifest.entries).toHaveLength(4)
  })

  it('uses saved calibration when present and useCalibration=true', async () => {
    const calibrations: CalibrationFile = {
      'eagle.png': {
        entries: {
          fire: {
            darkFactor: 0.5,
            lightFactor: 0.5,
            midpointLow: 0.25,
            midpointHigh: 0.75,
            selectedVariantId: 'strong',
            lastCalibrated: '2026-04-25T00:00:00Z'
          }
        }
      }
    }
    const deps = makeDeps({
      loadCalibrations: vi.fn().mockResolvedValue(calibrations),
      detect: vi.fn(ALWAYS_PICK_BALANCED) // would be picked if auto ran
    })
    const result = await runBatch(
      '/pack',
      'elements',
      ['/icons/eagle.png'],
      baseOptions,
      () => {},
      deps
    )
    const eagleFire = result.manifest.entries.find(
      (e) => e.source.endsWith('/eagle.png') && e.entryId === 'fire'
    )
    expect(eagleFire?.calibrationSource).toBe('saved')
    expect(eagleFire?.variantId).toBe('strong')
    // Water entry has no calibration; falls through to auto-detect
    const eagleWater = result.manifest.entries.find(
      (e) => e.source.endsWith('/eagle.png') && e.entryId === 'water'
    )
    expect(eagleWater?.calibrationSource).toBe('auto')
    expect(eagleWater?.variantId).toBe('balanced')
  })

  it('records every pair as a failure when the source master cannot be loaded', async () => {
    const deps = makeDeps({
      loadMasterPixels: vi.fn().mockRejectedValue(new Error('bad image'))
    })
    const progress: BatchProgress[] = []
    const result = await runBatch(
      '/pack',
      'elements',
      ['/icons/broken.png'],
      baseOptions,
      (p) => progress.push(p),
      deps
    )
    expect(result.failures).toEqual([
      { source: '/icons/broken.png', entryId: 'fire', error: 'bad image' },
      { source: '/icons/broken.png', entryId: 'water', error: 'bad image' }
    ])
    expect(deps.writeBytes).not.toHaveBeenCalled()
    expect(progress.filter((p) => p.status === 'fail')).toHaveLength(2)
    // Manifest still writes (with zero successful entries)
    expect(deps.writeFile).toHaveBeenCalledOnce()
    expect(result.manifest.entries).toEqual([])
  })

  it('continues after a per-entry render failure and records it as a failure', async () => {
    const writeBytes = vi
      .fn()
      .mockResolvedValueOnce(undefined) // eagle/fire ok
      .mockRejectedValueOnce(new Error('disk full')) // eagle/water fails
    const deps = makeDeps({ writeBytes })
    const result = await runBatch(
      '/pack',
      'elements',
      ['/icons/eagle.png'],
      baseOptions,
      () => {},
      deps
    )
    expect(result.failures).toEqual([
      { source: '/icons/eagle.png', entryId: 'water', error: 'disk full' }
    ])
    expect(result.manifest.entries).toHaveLength(1)
    expect(result.manifest.entries[0].entryId).toBe('fire')
  })

  it('passes regenerateMasters through to loadMasterPixels', async () => {
    const deps = makeDeps()
    await runBatch(
      '/pack',
      'elements',
      ['/icons/eagle.png'],
      { ...baseOptions, regenerateMasters: true },
      () => {},
      deps
    )
    expect(deps.loadMasterPixels).toHaveBeenCalledWith('/pack', '/icons/eagle.png', {
      force: true
    })
  })

  it('normalizes Windows-style source paths in manifest entries', async () => {
    const deps = makeDeps()
    const result = await runBatch(
      '/pack',
      'elements',
      ['C:\\icons\\eagle.png'],
      baseOptions,
      () => {},
      deps
    )
    expect(result.manifest.entries[0].source).toBe('C:/icons/eagle.png')
  })
})
