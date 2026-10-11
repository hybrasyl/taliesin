import { z } from 'zod'

/**
 * `app:setMenuState` — what the macOS application menu greys out and marks
 * (HTOO-569). The renderer sends it whenever it changes; a bad report is logged
 * and dropped, and the menu keeps the last good one.
 *
 * - `page`: the page on screen. The Go menu marks it.
 * - `canSave`: an editor has unsaved edits. Save runs that editor's save.
 * - `canLaunchCompanion`: Creidhne was found. The nav bar's anvil is enabled.
 */
export const menuStateSchema = z.object({
  page: z.string().max(64),
  canSave: z.boolean(),
  canLaunchCompanion: z.boolean()
})

export type MenuState = z.infer<typeof menuStateSchema>
