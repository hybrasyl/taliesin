import { z } from 'zod'

const sfxAnnotationSchema = z.object({
  name: z.string().optional(),
  comment: z.string().optional()
})

/**
 * Schema for `sfx:index:save` — keyed by SFX entry name (e.g. "31.mp3"),
 * value is the user-editable annotation written to
 * `<library>/../sfx-index.json`.
 */
export const sfxIndexSchema = z.record(z.string(), sfxAnnotationSchema)
