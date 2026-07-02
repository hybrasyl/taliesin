import { z } from 'zod'
import type { PackKind, SlotIdentity } from './types'
import { nextSlotId } from './helpers'

const SKILL_RE = /^skill(\d{4})\.png$/i
const SPELL_RE = /^spell(\d{4})\.png$/i

const coversSchema = z.object({
  ability_icons: z.object({
    dimensions: z.tuple([z.literal(32), z.literal(32)])
  })
})

function parseSlot(relPath: string): SlotIdentity | null {
  const skill = SKILL_RE.exec(relPath)
  if (skill) return { namespace: 'skill', id: parseInt(skill[1], 10) }
  const spell = SPELL_RE.exec(relPath)
  if (spell) return { namespace: 'spell', id: parseInt(spell[1], 10) }
  return null
}

export const abilityIconsKind: PackKind = {
  type: 'ability_icons',
  label: 'Ability Icons (skill / spell)',
  description:
    'Replaces skill001/002/003.epf and spell001/002/003.epf. 32×32 PNGs, one per ability ID.',
  dimension: {
    label: '32×32',
    validate(width, height) {
      if (width !== 32 || height !== 32) return `Expected 32×32, got ${width}×${height}`
      return null
    }
  },
  defaultCovers: () => ({ ability_icons: { dimensions: [32, 32] } }),
  coversSchema,
  parseSlot,
  nextAssetPath({ ctx, existingAssets }) {
    const ns = (ctx?.namespace === 'spell' ? 'spell' : 'skill') as 'skill' | 'spell'
    const id = nextSlotId(existingAssets, parseSlot, { namespace: ns })
    const padded = String(id).padStart(4, '0')
    const filename = `${ns}${padded}.png`
    return { zipPath: filename, relPath: filename }
  },
  namespaces: () => ['skill', 'spell']
}
