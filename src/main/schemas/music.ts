import { z } from 'zod'

/**
 * Schema for `music:metadata:save` payload — keyed by music filename, with
 * per-track user metadata. Matches the renderer's `MusicMeta` global
 * interface in `src/renderer/src/env.d.ts`.
 */
export const musicMetaSchema = z.object({
  name: z.string().optional(),
  notes: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  duration: z.number().optional(),
  bitrate: z.number().optional(),
  sampleRate: z.number().optional(),
  channels: z.number().optional(),
  prompt: z.string().optional()
})

export const musicMetaDataSchema = z.record(z.string(), musicMetaSchema)

const musicPackTrackSchema = z.object({
  musicId: z.number().int(),
  sourceFile: z.string()
})

const musicPackSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  tracks: z.array(musicPackTrackSchema),
  createdAt: z.string(),
  updatedAt: z.string()
})

/** Schema for `music:packs:save` — array of MusicPack. */
export const musicPackArraySchema = z.array(musicPackSchema)

/**
 * Schema for the `pack` argument of `music:deploy-pack`. Permissive on
 * id/name (any non-empty string) since the renderer typically passes a
 * MusicPack snapshot through. The deploy code validates each track's
 * sourceFile path separately via assertInside.
 */
export const deployPackSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  tracks: z.array(musicPackTrackSchema),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
})
