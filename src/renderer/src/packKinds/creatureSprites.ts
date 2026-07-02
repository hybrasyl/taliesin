import { z } from 'zod'
import type { AddAssetOptions, AssetTargetPath, PackKind, SlotIdentity } from './types'
import { nextSlotId } from './helpers'

// Matches the Brigid client's CreaturePack contract (phase 1, static): a single
// "stand" frame per direction-pair master at
//   creature_sprites/creature_{spriteId:D5}/stand/{n|e}_001.png
// The master faces N or E; the engine mirrors it horizontally for W and S
// respectively (flip = direction is Down or Left), so n covers N↔W and e covers
// E↔S. A creature may ship one master (used for all four directions) or both.
// The namespace is the master direction; the slot id is the creature sprite id.
const CREATURE_RE = /^creature_sprites[/\\]creature_(\d{5})[/\\]stand[/\\](n|e)_001\.png$/i

const coversSchema = z.object({
  creature_sprites: z.object({}).strict()
})

function parseSlot(relPath: string): SlotIdentity | null {
  const m = CREATURE_RE.exec(relPath)
  if (!m) return null
  return { namespace: m[2].toLowerCase(), id: parseInt(m[1], 10) }
}

export const creatureSpritesKind: PackKind = {
  type: 'creature_sprites',
  label: 'Creature Sprites (static)',
  description:
    'Static creature/NPC sprites, phase 1. Author the N-facing and/or E-facing master; the client mirrors them for W and S. One PNG per master at creature_sprites/creature_{id}/stand/{n|e}_001.png.',
  dimension: {
    label: 'any',
    validate: () => null
  },
  defaultCovers: () => ({ creature_sprites: {} }),
  coversSchema,
  parseSlot,
  nextAssetPath({ ctx, existingAssets }: AddAssetOptions): AssetTargetPath {
    const dir = ctx?.namespace === 'e' ? 'e' : 'n'
    const padded = String(nextSlotId(existingAssets, parseSlot, { namespace: dir })).padStart(
      5,
      '0'
    )
    const path = `creature_sprites/creature_${padded}/stand/${dir}_001.png`
    return { zipPath: path, relPath: path }
  },
  namespaces: () => ['n', 'e']
}
