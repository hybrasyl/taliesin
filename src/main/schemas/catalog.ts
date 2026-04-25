import { z } from 'zod'

const catalogMetaSchema = z.object({
  name: z.string().optional(),
  notes: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional()
})

/**
 * Schema for `catalog:save` — keyed by `.map` filename, value is the
 * user-editable metadata for that map. Mirrors `CatalogData` in
 * `src/renderer/src/hooks/useCatalog.ts`.
 */
export const catalogDataSchema = z.record(z.string(), catalogMetaSchema)
