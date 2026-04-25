// Palette JSON contract: the MonoGame client reads only `id`, `entries[].id`,
// `shadowColor`, and `highlightColor`. All other fields are Taliesin-side
// metadata and must stay optional so the client parser can ignore them.

export interface PaletteEntry {
  id: string
  name: string
  shadowColor: string       // hex "#RRGGBB"
  highlightColor: string    // hex "#RRGGBB"
  defaultDarkFactor?: number   // 0.0–1.0
  defaultLightFactor?: number  // 0.0–1.0
  defaultClampBlack?: boolean  // pure black at luminance 0
  defaultClampWhite?: boolean  // pure white at luminance 1
  category?: string
  notes?: string
}

export interface VariantDef {
  id: string
  label: string
  darkFactor: number
  lightFactor: number
  midpointLow: number
  midpointHigh: number
}

export interface Palette {
  id: string
  name: string
  description?: string
  version: number
  lastModified: string        // ISO 8601
  entries: PaletteEntry[]
  variants?: VariantDef[]     // optional per-palette override of DEFAULT_VARIANTS
  testIconPath?: string       // optional canonical preview icon
}

export interface DuotoneParams {
  darkFactor: number
  lightFactor: number
  midpointLow: number
  midpointHigh: number
  clampBlack?: boolean     // if true, luminance === 0 maps to pure #000
  clampWhite?: boolean     // if true, luminance === 1 maps to pure #FFF
}

export interface EntryCalibration extends DuotoneParams {
  selectedVariantId?: string
  autoDetected?: boolean
  lastCalibrated: string      // ISO 8601, minute precision
}

export type CalibrationFile = {
  [sourceFilename: string]: {
    [entryId: string]: EntryCalibration
  }
}
