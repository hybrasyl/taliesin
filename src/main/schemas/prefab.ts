import { z } from 'zod'

const prefabTileSchema = z.object({
  background: z.number().int(),
  leftForeground: z.number().int(),
  rightForeground: z.number().int()
})

/**
 * Schema for `prefab:save`. `tiles.length` must equal `width * height` (row-
 * major). The renderer's `trimPrefab` enforces this invariant; we re-check
 * here so a malformed renderer-side bug doesn't write a corrupt prefab.
 */
export const prefabSchema = z
  .object({
    name: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    tiles: z.array(prefabTileSchema),
    createdAt: z.string(),
    updatedAt: z.string()
  })
  .refine((p) => p.tiles.length === p.width * p.height, {
    message: 'tiles.length must equal width * height'
  })
