import { z } from 'zod'

/**
 * Schema for `theme:save` payload — the user-named role-to-tile-id assignment
 * stored under `<settingsPath>/themes/`. Mirrors `TileTheme` in
 * `src/renderer/src/utils/tileThemeTypes.ts`.
 */
export const tileThemeSchema = z.object({
  name: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  primaryGround: z.number().int(),
  secondaryGround: z.number().int(),
  accentGround: z.number().int(),
  pathTile: z.number().int(),
  wallTile: z.number().int(),
  wallTileRight: z.number().int(),
  decorationTile: z.number().int(),
  edgeTile: z.number().int()
})
