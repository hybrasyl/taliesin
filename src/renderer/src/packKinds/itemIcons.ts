import { z } from 'zod'
import type { PackKind, PackProject, SlotIdentity } from './types'
import { nextSlotId } from './helpers'
import ItemIconsPanel from '../components/assetpack/ItemIconsPanel'

const ITEM_RE = /^item(\d{5})\.png$/i

const coversSchema = z.object({
  item_icons: z.object({
    no_dye: z.array(z.number().int().nonnegative()).optional()
  })
})

function parseSlot(relPath: string): SlotIdentity | null {
  const m = ITEM_RE.exec(relPath)
  if (!m) return null
  return { namespace: 'item', id: parseInt(m[1], 10) }
}

export const itemIconsKind: PackKind = {
  type: 'item_icons',
  label: 'Item Icons',
  description:
    'Replaces item001..054.epf in legend.dat. 5-digit 1-based IDs. Dyeable surfaces use 6 canonical purples; flag undyeable items with no_dye.',
  dimension: {
    label: '16–32 × 16–32',
    validate(width, height) {
      if (width < 16 || width > 32) return `Expected width 16–32, got ${width}`
      if (height < 16 || height > 32) return `Expected height 16–32, got ${height}`
      return null
    }
  },
  defaultCovers: () => ({ item_icons: {} }),
  coversSchema,
  parseSlot,
  nextAssetPath({ existingAssets }) {
    const padded = String(nextSlotId(existingAssets, parseSlot)).padStart(5, '0')
    const filename = `item${padded}.png`
    return { zipPath: filename, relPath: filename }
  },
  assetMetaFields: () => ({
    noDye: {
      kind: 'boolean',
      label: 'No dye',
      help: 'This icon does not use the canonical purple dye palette.'
    }
  }),
  Panel: ItemIconsPanel,
  reduceCoversFromMeta(draft: PackProject) {
    const meta = draft.assetMeta ?? {}
    const noDyeIds: number[] = []
    for (const asset of draft.assets) {
      if (meta[asset.filename]?.noDye === true) {
        const slot = parseSlot(asset.filename)
        if (slot) noDyeIds.push(slot.id)
      }
    }
    noDyeIds.sort((a, b) => a - b)
    return noDyeIds.length > 0 ? { item_icons: { no_dye: noDyeIds } } : { item_icons: {} }
  }
}
