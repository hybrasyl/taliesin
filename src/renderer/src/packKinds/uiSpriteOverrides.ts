import { z } from 'zod'
import type { PackAsset, PackKind, SlotIdentity } from './types'

// ui_sprite_overrides nest a 4-digit frame index inside a folder named after
// the legacy source file (e.g. 'mile.spf/0001.png'). The folder is the
// namespace; the frame index is the slot id (0-based).
const UI_SPRITE_RE = /^([^/\\]+\.[a-z0-9]+)[/\\](\d{4})\.png$/i

const coversSchema = z.object({
  ui_sprite_overrides: z.object({}).strict()
})

function parseSlot(relPath: string): SlotIdentity | null {
  const m = UI_SPRITE_RE.exec(relPath)
  if (!m) return null
  return { namespace: m[1], id: parseInt(m[2], 10) }
}

function nextIdInNamespace(existing: PackAsset[], namespace: string): number {
  let max = -1
  const nsLower = namespace.toLowerCase()
  for (const a of existing) {
    const slot = parseSlot(a.filename)
    if (slot && slot.namespace.toLowerCase() === nsLower && slot.id > max) max = slot.id
  }
  return max + 1
}

function uniqueNamespaces(existing: PackAsset[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const a of existing) {
    const slot = parseSlot(a.filename)
    if (!slot) continue
    const key = slot.namespace.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(slot.namespace)
  }
  return out
}

export const uiSpriteOverridesKind: PackKind = {
  type: 'ui_sprite_overrides',
  label: 'UI Sprite Overrides',
  description: 'Replaces specific frames inside legacy EPF/SPF files (e.g. setoa.dat, cious.dat). One pack can override many source files; frame index is 0-based.',
  dimension: {
    label: 'any',
    validate: () => null
  },
  defaultCovers: () => ({ ui_sprite_overrides: {} }),
  coversSchema,
  parseSlot,
  nextAssetPath({ ctx, existingAssets }) {
    const namespace = String(ctx?.namespace ?? '').trim()
    if (!namespace) {
      throw new Error('ui_sprite_overrides nextAssetPath requires ctx.namespace (the source filename)')
    }
    const padded = String(nextIdInNamespace(existingAssets, namespace)).padStart(4, '0')
    const path = `${namespace}/${padded}.png`
    return { zipPath: path, relPath: path }
  },
  namespaces: (existing) => uniqueNamespaces(existing),
  customNamespacePrompt: {
    menuLabel: 'New source file…',
    dialogTitle: 'Add source file group',
    dialogHelp: 'Filename of the legacy source the pack should override (e.g. mile.spf, nation.spf).'
  }
}
