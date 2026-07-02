import { z } from 'zod'
import type { AssetTargetPath, PackKind, PackProject, SlotIdentity } from './types'
import NpcPortraitsPanel from '../components/assetpack/NpcPortraitsPanel'

// Matches the Brigid client's NpcPortraitPack contract: uniform square PNGs at
// the zip root, keyed by the literal Hybrasyl XML `Portrait` value (verbatim —
// e.g. 'inn.spf' or 'Gobalt'). The client reads a covers.npc_portraits.portraits
// {key → filename} map plus a square covers.npc_portraits.dimensions [W,W]; any
// portrait whose decoded size differs from that is ignored at runtime. We use the
// portrait key as the filename stem (key 'Gobalt' → 'Gobalt.png') and rebuild the
// portraits map from the asset list at compile time via reduceCoversFromMeta.
const PORTRAIT_RE = /^([^/\\]+)\.png$/i

// Default uniform square size when a pack is first created; the author adjusts it
// in the panel to match their art (Brigid validates each image against this).
export const DEFAULT_PORTRAIT_SIZE = 256

export interface NpcPortraitsCovers {
  dimensions: [number, number]
  portraits?: Record<string, string>
}

const coversSchema = z.object({
  npc_portraits: z.object({
    dimensions: z
      .tuple([z.number().int().positive(), z.number().int().positive()])
      .refine(([w, h]) => w === h, { message: 'Portrait dimensions must be square' }),
    portraits: z.record(z.string(), z.string()).optional()
  })
})

function parseSlot(relPath: string): SlotIdentity | null {
  const m = PORTRAIT_RE.exec(relPath)
  if (!m) return null
  // one image per portrait — the portrait key (filename stem) is the identity.
  return { namespace: m[1], id: 0 }
}

/** Reads the current square size from a draft's covers, falling back to the default. */
export function portraitSizeOf(covers: Record<string, unknown>): number {
  const entry = covers.npc_portraits as NpcPortraitsCovers | undefined
  const dims = entry?.dimensions
  return Array.isArray(dims) && typeof dims[0] === 'number' && dims[0] > 0
    ? dims[0]
    : DEFAULT_PORTRAIT_SIZE
}

export const npcPortraitsKind: PackKind = {
  type: 'npc_portraits',
  label: 'NPC Portraits',
  description:
    'Replaces legacy npcbase.dat illustrations with uniform square PNGs, one per NPC Portrait value (verbatim, e.g. Gobalt or inn.spf). Set the square size in the panel; every portrait must match it.',
  dimension: {
    label: 'square',
    validate(width, height) {
      if (width !== height) return `Portraits must be square, got ${width}×${height}`
      if (width <= 0) return `Invalid size ${width}×${height}`
      return null
    }
  },
  defaultCovers: () => ({
    npc_portraits: { dimensions: [DEFAULT_PORTRAIT_SIZE, DEFAULT_PORTRAIT_SIZE], portraits: {} }
  }),
  coversSchema,
  parseSlot,
  nextAssetPath({ ctx }): AssetTargetPath {
    const key = String(ctx?.namespace ?? '').trim()
    if (!key) {
      throw new Error('npc_portraits nextAssetPath requires ctx.namespace (the portrait key)')
    }
    const filename = `${key}.png`
    return { zipPath: filename, relPath: filename }
  },
  customNamespacePrompt: {
    menuLabel: 'New portrait…',
    dialogTitle: 'Add NPC portrait',
    dialogHelp:
      "The NPC's Portrait value as the server publishes it (verbatim, e.g. Gobalt or inn.spf).",
    inputLabel: 'Portrait key'
  },
  Panel: NpcPortraitsPanel,
  reduceCoversFromMeta(draft: PackProject) {
    const size = portraitSizeOf(draft.covers)
    const portraits: Record<string, string> = {}
    for (const asset of draft.assets) {
      const slot = parseSlot(asset.filename)
      if (slot) portraits[slot.namespace] = asset.filename
    }
    return { npc_portraits: { dimensions: [size, size], portraits } }
  }
}
