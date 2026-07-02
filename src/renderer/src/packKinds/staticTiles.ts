import { z } from 'zod'
import type { AddAssetOptions, AssetTargetPath, PackKind, SlotIdentity } from './types'
import { nextSlotId } from './helpers'

// Matches the Brigid client's StaticTilePack contract: floor{tileId:D5}.png and
// wall{tileId:D5}.png at the zip root. tileId is the value stored directly in
// MapTile.Background (floor) / LeftForeground|RightForeground (wall) — no offset.
// "Static" excludes palette-cycled and frame-animated tiles; the client skips
// pack lookup for those, so shipping one here has no effect.
const FLOOR_RE = /^floor(\d{5})\.png$/i
const WALL_RE = /^wall(\d{5})\.png$/i

const coversSchema = z.object({
  static_tiles: z.object({}).strict()
})

function parseSlot(relPath: string): SlotIdentity | null {
  const floor = FLOOR_RE.exec(relPath)
  if (floor) return { namespace: 'floor', id: parseInt(floor[1], 10) }
  const wall = WALL_RE.exec(relPath)
  if (wall) return { namespace: 'wall', id: parseInt(wall[1], 10) }
  return null
}

export const staticTilesKind: PackKind = {
  type: 'static_tiles',
  label: 'Static Tiles (floor / wall)',
  description:
    'Replaces non-animated ground (floor) and wall tiles by tile ID — the raw MapTile value, no offset. Floor tiles are 28×28; walls share the 28px width but vary in height. Skip palette-cycled/animated IDs (the client ignores pack art for them).',
  dimension: {
    label: 'any',
    validate: () => null
  },
  defaultCovers: () => ({ static_tiles: {} }),
  coversSchema,
  parseSlot,
  nextAssetPath({ ctx, existingAssets }: AddAssetOptions): AssetTargetPath {
    const ns = ctx?.namespace === 'wall' ? 'wall' : 'floor'
    const padded = String(nextSlotId(existingAssets, parseSlot, { namespace: ns })).padStart(5, '0')
    const filename = `${ns}${padded}.png`
    return { zipPath: filename, relPath: filename }
  },
  namespaces: () => ['floor', 'wall']
}
