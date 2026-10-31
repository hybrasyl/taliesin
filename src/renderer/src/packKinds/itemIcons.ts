import { z } from 'zod'
import type { PackKind, PackProject, SlotIdentity } from './types'
import { nextSlotId } from './helpers'
import { dyeableList } from './itemIconsDye'
import ItemIconsPanel from '../components/assetpack/ItemIconsPanel'

const ITEM_RE = /^item(\d{5})\.png$/i

/**
 * The first modern item id (BRIG-77). An id below it replaces a legacy icon
 * from `legend.dat`; an id at or above it is a new, modern icon. Brigid reads
 * modern icons from 20001, and never ramp-dyes one (mask dye is BRIG-112).
 */
export const FIRST_MODERN_ITEM_ID = 20001

/**
 * The highest item id the client can show. The item `Sprite` is a signed 16-bit
 * value on the wire once the `0x8000` flag is removed.
 */
export const MAX_ITEM_ID = 32767

const coversSchema = z.object({
  item_icons: z.object({
    no_dye: z.array(z.number().int().nonnegative()).optional(),
    // The exact dyeable set. Only the old hand-made scaffold packs write it;
    // when present, Brigid uses it and ignores no_dye. Taliesin never writes a
    // new one, but keeps an imported one (HTOO-599).
    dyeable: z.array(z.number().int().nonnegative()).optional()
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
    'Ids 1–20000 replace the legacy icons in legend.dat (item001..054.epf). New icons get modern ids from 20001 to 32767. Dyeable surfaces use 6 canonical purples; flag undyeable items with no_dye.',
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
    // A new icon is a modern icon (BRIG-77): one past the highest modern id in
    // the pack, from 20001. A legacy id in the pack does not move it.
    const id = nextSlotId(existingAssets, parseSlot, { firstId: FIRST_MODERN_ITEM_ID })
    if (id > MAX_ITEM_ID) {
      throw new Error(`No item id is free: ${MAX_ITEM_ID} is the highest id the client can show`)
    }
    const filename = `item${String(id).padStart(5, '0')}.png`
    return { zipPath: filename, relPath: filename }
  },
  assetMetaFields: () => ({
    noDye: {
      kind: 'boolean',
      label: 'No dye',
      help: 'An id below 20001 is dyeable when its PNG has a pixel of the canonical purple ramp, unless it is marked No dye. An id of 20001 or more is never ramp-dyed, so No dye has no effect on it (mask dye is BRIG-112).'
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
    const itemCovers: Record<string, unknown> = {}
    // Keep an imported explicit list, or the round trip drops the dye set of an
    // old scaffold pack (HTOO-599).
    const dyeable = dyeableList(draft.covers)
    if (dyeable) itemCovers.dyeable = dyeable
    if (noDyeIds.length > 0) itemCovers.no_dye = noDyeIds
    return { item_icons: itemCovers }
  }
}
