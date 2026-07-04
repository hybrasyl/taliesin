import { WangBit, WangScheme, WangSchemeId, describeMask } from './wangSlicer'

// ── Wang sidecar mapping (Static Tile Manager, Phase 3) ───────────────────────
//
// When a wang set is committed to a static_tiles pack, the pack itself stays a
// plain set of floor{id}.png tiles (no format change). Alongside them we emit a
// small informational sidecar that records which adjacency mask each minted tile
// ID represents, so a future autotile-aware map editor can pick the right variant
// at placement time. This iteration only *produces* the mapping.

export const WANG_SIDECAR_VERSION = 1

export interface WangSidecarEntry {
  /** Adjacency mask (interpret via `bits`). */
  mask: number
  /** Human-readable mask, e.g. "N|E|S". */
  label: string
  /** The minted floor tile ID this variant maps to. */
  tileId: number
}

export interface WangSidecar {
  version: typeof WANG_SIDECAR_VERSION
  scheme: WangSchemeId
  /** Optional terrain name (a pack may carry several wang sets — grass, dirt…). */
  terrain?: string
  /** Bit legend so a consumer can interpret masks without this module. */
  bits: WangBit[]
  /** One entry per minted tile, ascending by mask. */
  tiles: WangSidecarEntry[]
}

/** A mask paired with the floor tile ID it was committed as. */
export interface WangAssignment {
  mask: number
  tileId: number
}

/**
 * Build the sidecar for a committed wang set. Duplicate masks keep the LAST
 * assignment (a later commit overrides an earlier one for the same variant), and
 * entries are sorted ascending by mask for stable output.
 */
export function buildWangSidecar(
  scheme: WangScheme,
  assignments: WangAssignment[],
  terrain?: string
): WangSidecar {
  const byMask = new Map<number, number>()
  for (const a of assignments) byMask.set(a.mask, a.tileId)

  const tiles: WangSidecarEntry[] = [...byMask.entries()]
    .sort(([a], [b]) => a - b)
    .map(([mask, tileId]) => ({ mask, label: describeMask(scheme, mask), tileId }))

  const sidecar: WangSidecar = {
    version: WANG_SIDECAR_VERSION,
    scheme: scheme.id,
    bits: scheme.bits,
    tiles
  }
  if (terrain && terrain.trim()) sidecar.terrain = terrain.trim()
  return sidecar
}

/** Sidecar filename at the pack root: `wang_{terrain|scheme}.json`. */
export function wangSidecarFilename(scheme: WangSchemeId, terrain?: string): string {
  const stem = terrain && terrain.trim() ? terrain.trim() : scheme
  const safe = stem.replace(/[^A-Za-z0-9_-]+/g, '_').toLowerCase()
  return `wang_${safe}.json`
}
