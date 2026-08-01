import { HpfFile } from '@eriscorp/dalib-ts'
import type { MapAssets } from './mapRenderer'

// ── Legacy wall-height derivation ─────────────────────────────────────────────
//
// When a minted wall REPLACES a legacy wall id, its PNG height must match the
// legacy HPF's decoded pixel height (too tall floats above the floor, too short
// leaves a gap — see docs/plans/complete/static-tile-manager.md). The raw-size formula
// (fileSize−8)/28 is only valid for uncompressed HPFs and returns 0 for the
// common compressed case, so we must DECODE the entry and read its pixelHeight —
// exactly the path mapRenderer.getStcBitmap already uses to render walls.

/**
 * Decoded pixel height of the legacy HPF wall for `id`, or null when there is no
 * legacy wall for that id (a brand-new pack-only id carries no height
 * constraint — the renderer bottom-anchors any height) or the entry can't be
 * decoded. `assets` comes from loadMapAssets(clientPath).
 */
export function legacyWallHeight(assets: Pick<MapAssets, 'iaArchive'>, id: number): number | null {
  const entryName = `stc${String(id).padStart(5, '0')}.hpf`
  const entry = assets.iaArchive.get(entryName)
  if (!entry) return null
  try {
    const hpf = HpfFile.fromEntry(entry)
    return hpf.pixelHeight > 0 ? hpf.pixelHeight : null
  } catch {
    return null
  }
}
