import { z } from 'zod'

const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Expected #RRGGBB hex color')

const paletteEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  shadowColor: hexColorSchema,
  highlightColor: hexColorSchema,
  defaultDarkFactor: z.number().min(0).max(1).optional(),
  defaultLightFactor: z.number().min(0).max(1).optional(),
  defaultClampBlack: z.boolean().optional(),
  defaultClampWhite: z.boolean().optional(),
  category: z.string().optional(),
  notes: z.string().optional()
})

const variantDefSchema = z.object({
  id: z.string(),
  label: z.string(),
  darkFactor: z.number(),
  lightFactor: z.number(),
  midpointLow: z.number(),
  midpointHigh: z.number()
})

/**
 * Schema for `palette:save`. The MonoGame client only reads `id`, `entries[].id`,
 * `shadowColor`, `highlightColor`; everything else is Taliesin-side metadata.
 */
export const paletteSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.number(),
  lastModified: z.string(),
  entries: z.array(paletteEntrySchema),
  variants: z.array(variantDefSchema).optional(),
  testIconPath: z.string().optional()
})

const duotoneParamsShape = {
  darkFactor: z.number(),
  lightFactor: z.number(),
  midpointLow: z.number(),
  midpointHigh: z.number(),
  clampBlack: z.boolean().optional(),
  clampWhite: z.boolean().optional()
}

const entryCalibrationSchema = z.object({
  ...duotoneParamsShape,
  selectedVariantId: z.string().optional(),
  autoDetected: z.boolean().optional(),
  lastCalibrated: z.string()
})

const sourceCalibrationSchema = z.object({
  frame: z.string().optional(),
  entries: z.record(z.string(), entryCalibrationSchema)
})

/**
 * Schema for `palette:calibrationSave`. Outer key is the icon's source
 * filename (e.g. "eagle.png"); inner key is the palette entry id ("fire").
 */
export const calibrationFileSchema = z.record(z.string(), sourceCalibrationSchema)
