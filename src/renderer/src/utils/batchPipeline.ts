// Batch colorization pipeline.
//
// Walks an arbitrary set of source PNGs × all entries of a palette, picks a
// duotone variant per pair (override > saved calibration > auto-detect >
// balanced default), renders, writes outputs to {packDir}/_colorized/, and
// emits a manifest.json so downstream tooling can map outputs back to sources
// without scraping filenames.
//
// Rendering happens in the renderer using the same Canvas-based primitives
// the single-icon flow uses; per-pair progress is reported via callback so
// the BatchView can render a live progress strip.

import {
  Palette,
  PaletteEntry,
  VariantDef,
  DuotoneParams,
  CalibrationFile,
  EntryCalibration
} from './paletteTypes'
import { applyDuotone, PixelBuffer } from './duotone'
import { DEFAULT_VARIANTS, autoDetectBest, variantToParams, AutoDetectResult } from './variants'
import {
  loadPalette as defaultLoadPalette,
  loadCalibrations as defaultLoadCalibrations,
  basenameFromPath,
  filenameFromPath,
  outputFilename
} from './paletteIO'
import {
  loadMasterPixels as defaultLoadMasterPixels
} from './grayscaleMaster'
import { pixelBufferToPngBytes } from './imageLoader'

export interface BatchOptions {
  /** Use saved per-(source, entry) calibration when present. Default: true. */
  useCalibration: boolean
  /** Auto-detect best variant for pairs without saved calibration. Default: true. */
  autoDetect: boolean
  /** When set, ignore calibration and use this variant for everything. */
  overrideVariantId?: string
  /** Force-regenerate grayscale masters even when mtime says they're fresh. */
  regenerateMasters: boolean
}

export type CalibrationSource = 'override' | 'saved' | 'auto' | 'default'

export interface BatchManifestEntry {
  /** Absolute source path, normalized to forward slashes. */
  source: string
  entryId: string
  /** Filename within {packDir}/_colorized/. */
  output: string
  variantId: string
  calibrationSource: CalibrationSource
}

export interface BatchManifest {
  paletteId: string
  ranAt: string
  sourceCount: number
  entryCount: number
  entries: BatchManifestEntry[]
}

export interface BatchProgress {
  index: number
  total: number
  source: string
  entryId: string
  status: 'rendering' | 'ok' | 'fail'
  error?: string
}

export interface BatchResult {
  manifest: BatchManifest
  outputDir: string
  manifestPath: string
  failures: { source: string; entryId: string; error: string }[]
}

export interface VariantSelection {
  variant: VariantDef
  params: DuotoneParams
  calibrationSource: CalibrationSource
}

const DEFAULT_VARIANT_ID = 'balanced'

const normalizePath = (p: string): string => p.replace(/\\/g, '/')

/**
 * Resolve which variant + params to apply for a single (source, entry) pair.
 * Pure: the auto-detect call is injected so tests can assert without
 * triggering full duotone scoring.
 */
export function selectVariant(
  source: PixelBuffer,
  entry: PaletteEntry,
  saved: EntryCalibration | undefined,
  options: Pick<BatchOptions, 'useCalibration' | 'autoDetect' | 'overrideVariantId'>,
  variants: VariantDef[],
  detect: (
    source: PixelBuffer,
    entry: PaletteEntry,
    variants: VariantDef[]
  ) => AutoDetectResult = autoDetectBest
): VariantSelection {
  if (options.overrideVariantId) {
    const v = variants.find((x) => x.id === options.overrideVariantId)
    if (v) return { variant: v, params: variantToParams(v), calibrationSource: 'override' }
    // Override id not found in this palette's variant set — fall through to
    // the rest of the resolution chain rather than silently mismatching.
  }

  if (options.useCalibration && saved) {
    const matched = variants.find((x) => x.id === saved.selectedVariantId)
    const variant = matched ?? variants.find((v) => v.id === DEFAULT_VARIANT_ID) ?? variants[0]
    const params: DuotoneParams = {
      darkFactor: saved.darkFactor,
      lightFactor: saved.lightFactor,
      midpointLow: saved.midpointLow,
      midpointHigh: saved.midpointHigh,
      clampBlack: saved.clampBlack,
      clampWhite: saved.clampWhite
    }
    return { variant, params, calibrationSource: 'saved' }
  }

  if (options.autoDetect) {
    const result = detect(source, entry, variants)
    const variant = variants.find((v) => v.id === result.bestVariantId) ?? variants[0]
    return { variant, params: variantToParams(variant), calibrationSource: 'auto' }
  }

  const fallback = variants.find((v) => v.id === DEFAULT_VARIANT_ID) ?? variants[0]
  return { variant: fallback, params: variantToParams(fallback), calibrationSource: 'default' }
}

export interface BatchDeps {
  loadPalette: (packDir: string, paletteId: string) => Promise<Palette>
  loadCalibrations: (packDir: string, paletteId: string) => Promise<CalibrationFile>
  loadMasterPixels: (
    packDir: string,
    sourcePath: string,
    opts?: { force?: boolean }
  ) => Promise<PixelBuffer>
  encodePng: (buf: PixelBuffer) => Promise<Uint8Array>
  writeBytes: (path: string, data: Uint8Array) => Promise<void>
  writeFile: (path: string, content: string) => Promise<void>
  ensureDir: (path: string) => Promise<void>
  detect?: (
    source: PixelBuffer,
    entry: PaletteEntry,
    variants: VariantDef[]
  ) => AutoDetectResult
}

const defaultDeps = (): BatchDeps => ({
  loadPalette: defaultLoadPalette,
  loadCalibrations: defaultLoadCalibrations,
  loadMasterPixels: (packDir, sourcePath, opts) =>
    defaultLoadMasterPixels(packDir, sourcePath, opts),
  encodePng: pixelBufferToPngBytes,
  writeBytes: (p, d) => window.api.writeBytes(p, d),
  writeFile: (p, c) => window.api.writeFile(p, c),
  ensureDir: (p) => window.api.ensureDir(p)
})

export function colorizedDir(packDir: string): string {
  return `${packDir}/_colorized`
}

export function manifestPathFor(packDir: string): string {
  return `${colorizedDir(packDir)}/manifest.json`
}

/**
 * Run the batch. Errors on individual (source, entry) pairs are collected as
 * failures and reported in the result without aborting the whole run; the
 * caller decides whether to surface them. A thrown error here means the run
 * could not start at all (e.g. palette load failed).
 */
export async function runBatch(
  packDir: string,
  paletteId: string,
  sources: string[],
  options: BatchOptions,
  onProgress: (p: BatchProgress) => void,
  deps: BatchDeps = defaultDeps()
): Promise<BatchResult> {
  const palette = await deps.loadPalette(packDir, paletteId)
  const calibrations = await deps.loadCalibrations(packDir, paletteId)
  const variants = palette.variants ?? DEFAULT_VARIANTS
  const outDir = colorizedDir(packDir)
  await deps.ensureDir(outDir)

  const total = sources.length * palette.entries.length
  const manifestEntries: BatchManifestEntry[] = []
  const failures: { source: string; entryId: string; error: string }[] = []
  let index = 0

  for (const sourcePath of sources) {
    const normSource = normalizePath(sourcePath)
    const sourceKey = filenameFromPath(normSource)
    const sourceCalibration = calibrations[sourceKey]
    const sourceBasename = basenameFromPath(normSource)

    let masterPixels: PixelBuffer | null = null
    try {
      masterPixels = await deps.loadMasterPixels(packDir, sourcePath, {
        force: options.regenerateMasters
      })
    } catch (err) {
      // If we can't load the source at all, every entry for this source fails.
      const message = err instanceof Error ? err.message : String(err)
      for (const entry of palette.entries) {
        failures.push({ source: normSource, entryId: entry.id, error: message })
        onProgress({
          index: index++,
          total,
          source: normSource,
          entryId: entry.id,
          status: 'fail',
          error: message
        })
      }
      continue
    }

    for (const entry of palette.entries) {
      onProgress({
        index,
        total,
        source: normSource,
        entryId: entry.id,
        status: 'rendering'
      })

      try {
        const saved = sourceCalibration?.entries[entry.id]
        const selection = selectVariant(masterPixels, entry, saved, options, variants, deps.detect)
        const out = applyDuotone(masterPixels, entry, selection.params)
        const png = await deps.encodePng(out)
        const filename = outputFilename(sourceBasename, paletteId, entry.id)
        const outputPath = `${outDir}/${filename}`
        await deps.writeBytes(outputPath, png)

        manifestEntries.push({
          source: normSource,
          entryId: entry.id,
          output: filename,
          variantId: selection.variant.id,
          calibrationSource: selection.calibrationSource
        })

        onProgress({
          index: index++,
          total,
          source: normSource,
          entryId: entry.id,
          status: 'ok'
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        failures.push({ source: normSource, entryId: entry.id, error: message })
        onProgress({
          index: index++,
          total,
          source: normSource,
          entryId: entry.id,
          status: 'fail',
          error: message
        })
      }
    }
  }

  const manifest: BatchManifest = {
    paletteId,
    ranAt: new Date().toISOString(),
    sourceCount: sources.length,
    entryCount: palette.entries.length,
    entries: manifestEntries
  }
  const manifestPath = manifestPathFor(packDir)
  await deps.writeFile(manifestPath, JSON.stringify(manifest, null, 2))

  return { manifest, outputDir: outDir, manifestPath, failures }
}
