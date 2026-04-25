import { Palette, CalibrationFile } from './paletteTypes'

export interface PaletteSummary {
  filename: string
  id: string
  name: string
  entryCount: number
}

export function filenameFromPath(path: string): string {
  const norm = path.replace(/\\/g, '/')
  const slash = norm.lastIndexOf('/')
  return slash >= 0 ? norm.slice(slash + 1) : norm
}

export function dirnameFromPath(path: string): string {
  const norm = path.replace(/\\/g, '/')
  const slash = norm.lastIndexOf('/')
  return slash >= 0 ? norm.slice(0, slash) : ''
}

export function basenameFromPath(path: string): string {
  const file = filenameFromPath(path)
  const dot = file.lastIndexOf('.')
  return dot > 0 ? file.slice(0, dot) : file
}

export function outputFilename(sourceBasename: string, paletteId: string, entryId: string): string {
  return `${sourceBasename}_${paletteId}_${entryId}.png`
}

export function paletteFilePath(packDir: string, paletteId: string): string {
  return `${packDir}/_palettes/${paletteId}.json`
}

export function calibrationFilePath(packDir: string, paletteId: string): string {
  return `${packDir}/_calibrations/${paletteId}.json`
}

export async function scanPalettes(packDir: string): Promise<PaletteSummary[]> {
  return (await window.api.paletteScan(packDir)) as PaletteSummary[]
}

export async function loadPalette(packDir: string, paletteId: string): Promise<Palette> {
  return (await window.api.paletteLoad(paletteFilePath(packDir, paletteId))) as Palette
}

export async function savePalette(packDir: string, palette: Palette): Promise<void> {
  await window.api.paletteSave(paletteFilePath(packDir, palette.id), palette)
}

export async function deletePalette(packDir: string, paletteId: string): Promise<void> {
  await window.api.paletteDelete(paletteFilePath(packDir, paletteId))
}

export async function loadCalibrations(
  packDir: string,
  paletteId: string
): Promise<CalibrationFile> {
  // The on-disk shape may be the new SourceCalibration form or the pre-Phase-4
  // map-of-entries form; ColorizeView normalizes both at read time.
  const raw = await window.api.paletteCalibrationLoad(packDir, paletteId)
  return (raw ?? {}) as unknown as CalibrationFile
}

export async function saveCalibrations(
  packDir: string,
  paletteId: string,
  data: CalibrationFile
): Promise<void> {
  await window.api.paletteCalibrationSave(packDir, paletteId, data)
}

export async function scanFrames(packDir: string): Promise<string[]> {
  return window.api.frameScan(packDir)
}

export function framePath(packDir: string, frameName: string): string {
  return `${packDir}/_frames/${frameName}`
}
