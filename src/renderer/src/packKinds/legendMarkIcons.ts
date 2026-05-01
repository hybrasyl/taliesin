import { z } from 'zod'
import type { PackAsset, PackKind, SlotIdentity } from './types'

const LEGEND_RE = /^legend(\d{4})\.png$/i

const coversSchema = z.object({
  legend_mark_icons: z.object({}).strict()
})

function parseSlot(relPath: string): SlotIdentity | null {
  const m = LEGEND_RE.exec(relPath)
  if (!m) return null
  return { namespace: 'legend', id: parseInt(m[1], 10) }
}

// Legend mark IDs are 0-based — the raw byte from the wire protocol — so the
// first slot in an empty pack is `legend0000.png`, not legend0001.
function nextId(existing: PackAsset[]): number {
  let max = -1
  for (const a of existing) {
    const slot = parseSlot(a.filename)
    if (slot && slot.id > max) max = slot.id
  }
  return max + 1
}

export const legendMarkIconsKind: PackKind = {
  type: 'legend_mark_icons',
  label: 'Legend Mark Icons',
  description: 'Replaces legends.epf (palette 3 in national.dat). 0-based IDs match the wire-protocol byte. 20×20 or 21×20.',
  dimension: {
    label: '20×20 or 21×20',
    validate(width, height) {
      if (height !== 20) return `Expected height 20, got ${height}`
      if (width !== 20 && width !== 21) return `Expected width 20 or 21, got ${width}`
      return null
    }
  },
  defaultCovers: () => ({ legend_mark_icons: {} }),
  coversSchema,
  parseSlot,
  nextAssetPath({ existingAssets }) {
    const padded = String(nextId(existingAssets)).padStart(4, '0')
    const filename = `legend${padded}.png`
    return { zipPath: filename, relPath: filename }
  }
}
