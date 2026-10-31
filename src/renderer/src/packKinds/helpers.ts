import type { PackAsset, SlotIdentity } from './types'

/**
 * Next free slot id for a pack kind, given its existing assets and the kind's
 * own `parseSlot`. Every kind previously hand-rolled this "max existing id + 1"
 * scan; the variations are captured by `opts`:
 *   - `namespace`       restrict the scan to one namespace (floor/wall, n/e, a
 *                       source-file group…); omit for flat kinds.
 *   - `caseInsensitive` fold namespace case when matching (ui_sprite_overrides).
 *   - `firstId`         id returned for an empty set: 1 for 1-based kinds, 0 for
 *                       0-based kinds (legend marks, ui-sprite frames).
 */
export function nextSlotId(
  existing: PackAsset[],
  parseSlot: (relPath: string) => SlotIdentity | null,
  opts?: { namespace?: string; caseInsensitive?: boolean; firstId?: number }
): number {
  const firstId = opts?.firstId ?? 1
  const ns = opts?.namespace
  const wantNs = ns !== undefined && opts?.caseInsensitive ? ns.toLowerCase() : ns
  let max = firstId - 1
  for (const a of existing) {
    const slot = parseSlot(a.filename)
    if (!slot) continue
    if (ns !== undefined) {
      const slotNs = opts?.caseInsensitive ? slot.namespace.toLowerCase() : slot.namespace
      if (slotNs !== wantNs) continue
    }
    if (slot.id > max) max = slot.id
  }
  return max + 1
}

/**
 * Why a `pack_id` can cause a problem in Brigid, or null when it cannot
 * (HTOO-598). Taliesin makes ids of lowercase letters, digits, `-` and `_`, and
 * the editor keeps them that way as you type; an id from an imported pack or a
 * hand-edited project can still be different.
 *
 * Brigid refuses a `ui_theme` pack whose id has other characters, and compares
 * ids without case, so it refuses a second pack whose id differs only in case.
 */
export function packIdProblem(packId: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(packId)) {
    return "Use only letters, digits, '-' and '_'. Brigid refuses a theme pack whose id has other characters."
  }
  if (packId !== packId.toLowerCase()) {
    return 'Use lowercase. Brigid compares pack ids without case, so it refuses a second pack whose id differs only in case.'
  }
  return null
}
