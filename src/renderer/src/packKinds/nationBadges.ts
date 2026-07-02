import { z } from 'zod'
import type { PackKind, SlotIdentity } from './types'
import { nextSlotId } from './helpers'

const NATION_RE = /^nation(\d{4})\.png$/i

const coversSchema = z.object({
  nation_badges: z.object({}).strict()
})

function parseSlot(relPath: string): SlotIdentity | null {
  const m = NATION_RE.exec(relPath)
  if (!m) return null
  return { namespace: 'nation', id: parseInt(m[1], 10) }
}

export const nationBadgesKind: PackKind = {
  type: 'nation_badges',
  label: 'Nation Badges',
  description:
    'Replaces _nui_nat.spf. One PNG per nation ID; sized however the legacy badge was drawn.',
  dimension: {
    label: 'any',
    validate: () => null
  },
  defaultCovers: () => ({ nation_badges: {} }),
  coversSchema,
  parseSlot,
  nextAssetPath({ existingAssets }) {
    const padded = String(nextSlotId(existingAssets, parseSlot)).padStart(4, '0')
    const filename = `nation${padded}.png`
    return { zipPath: filename, relPath: filename }
  }
}
