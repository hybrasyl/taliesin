// Palette JSON contract: Taliesin-only today. The MonoGame client does not
// read palette JSON — it consumes the pre-baked colorized PNGs directly.
//
// The format is kept deliberately simple (id + entries with shadowColor /
// highlightColor as the load-bearing fields) so that if a future client
// need arises (e.g. runtime shader tinting), the same JSON is likely
// ingestible as-is. All other fields are Taliesin authoring metadata and
// stay optional so any downstream parser can ignore them.
//
// If the schemas ever diverge, add a `palette:export` IPC that emits a
// slimmed copy (drop `notes`, `lastModified`, `description`, `testIconPath`,
// `defaultDarkFactor`, `defaultLightFactor`, `defaultClampBlack`,
// `defaultClampWhite`, `category`, `variants`) at a user-chosen path.

export interface PaletteEntry {
  id: string
  name: string
  shadowColor: string // hex "#RRGGBB"
  highlightColor: string // hex "#RRGGBB"
  defaultDarkFactor?: number // 0.0–1.0
  defaultLightFactor?: number // 0.0–1.0
  defaultClampBlack?: boolean // pure black at luminance 0
  defaultClampWhite?: boolean // pure white at luminance 1
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
  lastModified: string // ISO 8601
  entries: PaletteEntry[]
  variants?: VariantDef[] // optional per-palette override of DEFAULT_VARIANTS
  testIconPath?: string // optional canonical preview icon
}

export interface DuotoneParams {
  darkFactor: number
  lightFactor: number
  midpointLow: number
  midpointHigh: number
  clampBlack?: boolean // if true, luminance === 0 maps to pure #000
  clampWhite?: boolean // if true, luminance === 1 maps to pure #FFF
}

export interface EntryCalibration extends DuotoneParams {
  selectedVariantId?: string
  autoDetected?: boolean
  lastCalibrated: string // ISO 8601, minute precision
}

export interface SourceCalibration {
  frame?: string // filename of frame PNG within {packDir}/_frames/, or omitted for none
  entries: { [entryId: string]: EntryCalibration }
}

export type CalibrationFile = {
  [sourceFilename: string]: SourceCalibration
}
