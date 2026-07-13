import { z } from 'zod'
import type { AddAssetOptions, AssetTargetPath, PackKind, SlotIdentity } from './types'

// Matches the Brigid client's TownMapPack contract: town_{mapId:D5}.png at the
// zip root, where mapId is the real server map ID (a short) — the value passed
// to UiRenderer.GetTownMapImage(short). One full-panel image per town map; the
// client (v1) draws it as-is, no player marker/POI overlay yet.
const TOWNMAP_RE = /^town_(\d{5})\.png$/i

// Authoring size. The client town-map panel is 568×406; higher-res art is an
// integer multiple of that (same factor on both axes) so it scales cleanly.
// TODO: revisit multi-resolution town-map sizing once the client's town-map
// rendering (marker/POI panel, auto-baker) lands beyond v1.
const BASE_W = 568
const BASE_H = 406

const coversSchema = z.object({
  town_maps: z.object({}).strict()
})

function parseSlot(relPath: string): SlotIdentity | null {
  const m = TOWNMAP_RE.exec(relPath)
  if (!m) return null
  return { namespace: 'town', id: parseInt(m[1], 10) }
}

export const townMapsKind: PackKind = {
  type: 'town_maps',
  label: 'Town Maps',
  description:
    'Full-panel town map replacement, one PNG per server map ID (town_00500.png). Authored at 568×406, or an integer multiple (1136×812, 1704×1218…) for higher resolution. The client draws the image as-is (no player marker/POI overlay in v1).',
  dimension: {
    label: '568×406 (or an integer multiple)',
    validate: (width, height) => {
      if (width % BASE_W !== 0 || height % BASE_H !== 0 || width / BASE_W !== height / BASE_H) {
        return `town maps must be 568×406 or an integer multiple of it (e.g. 1136×812); got ${width}×${height}`
      }
      return null
    }
  },
  defaultCovers: () => ({ town_maps: {} }),
  coversSchema,
  parseSlot,
  nextAssetPath({ ctx }: AddAssetOptions): AssetTargetPath {
    const raw = String(ctx?.namespace ?? '').trim()
    // The Add flow prompts for the real server map ID (see customNamespacePrompt
    // below); it arrives here as ctx.namespace. Validate it's a usable 1–5 digit
    // map ID before padding to the town_{mapId:D5}.png contract.
    if (!/^\d+$/.test(raw)) {
      throw new Error(`town_maps requires a numeric map ID; got "${raw}"`)
    }
    const id = parseInt(raw, 10)
    if (id < 1 || id > 99999) {
      throw new Error(`town map ID must be between 1 and 99999; got ${id}`)
    }
    const filename = `town_${String(id).padStart(5, '0')}.png`
    return { zipPath: filename, relPath: filename }
  },
  customNamespacePrompt: {
    menuLabel: 'New town map…',
    dialogTitle: 'Add town map',
    dialogHelp: 'The server map ID for this town — used as the filename, e.g. town_00500.png.',
    inputLabel: 'Map ID'
  }
}
