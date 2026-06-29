import { z } from 'zod'
import type { AssetTargetPath, PackKind, SlotIdentity } from './types'

// Matches the Brigid client's WorldMapPack contract: {fieldName}.png at the zip
// root, where fieldName is the server ClientMap string verbatim (named, not
// numeric — e.g. field001). One image per field; the field name is the identity.
const WORLDMAP_RE = /^([^/\\]+)\.png$/i

const coversSchema = z.object({
  world_maps: z.object({}).strict()
})

function parseSlot(relPath: string): SlotIdentity | null {
  const m = WORLDMAP_RE.exec(relPath)
  if (!m) return null
  // single image per field — the field name is the identity, so id is a constant 0
  return { namespace: m[1], id: 0 }
}

export const worldMapsKind: PackKind = {
  type: 'world_maps',
  label: 'World Maps',
  description:
    'Full-screen overworld (field) backgrounds, one PNG per field name (the server ClientMap, e.g. field001). Replaces the legacy field###.epf art; author ≥1280×960 for crispness — the client scales it.',
  dimension: {
    label: 'any',
    validate: () => null
  },
  defaultCovers: () => ({ world_maps: {} }),
  coversSchema,
  parseSlot,
  nextAssetPath({ ctx }): AssetTargetPath {
    const namespace = String(ctx?.namespace ?? '').trim()
    if (!namespace) {
      throw new Error('world_maps nextAssetPath requires ctx.namespace (the field name)')
    }
    const filename = `${namespace}.png`
    return { zipPath: filename, relPath: filename }
  },
  customNamespacePrompt: {
    menuLabel: 'New field…',
    dialogTitle: 'Add world map field',
    dialogHelp: 'The server ClientMap name for this field, used as the PNG filename (e.g. field001).',
    inputLabel: 'Field name'
  }
}
