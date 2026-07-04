import type { TileLayer } from './tileConvert'

// ── Animated / cycled tile pre-flight (Static Tile Manager, Phase 4) ──────────
//
// The Brigid client skips pack lookup for frame-animated tiles: a floor whose ID
// appears in gndani.tbl (seo.dat) or a wall whose ID appears in stcani.tbl
// (ia.dat) cycles through a legacy tile sequence, and the client keeps rendering
// that animation instead of a pack PNG. Shipping floor{id}.png / wall{id}.png for
// such an ID has NO effect and is silent — Brigid enforces nothing, so this
// warning at ID-assignment time is the only guard (replacing the authoring
// guide's "drop it in and see if it renders" workflow).

/** Minimal shape of a dalib TileAnimationTable — decoupled for testability. */
export interface AnimationTableLike {
  tryGetEntry(tileId: number): { tileSequence: number[] } | undefined
}

/** The two legacy animation tables, structurally (MapAssets satisfies this). */
export interface AnimationAssets {
  groundAnimationTable: AnimationTableLike | null
  stcAnimationTable: AnimationTableLike | null
}

export interface AnimationCheck {
  /** True when the id participates in a legacy animation cycle. */
  animated: boolean
  /** The full tile-ID cycle the id belongs to (empty when not animated). */
  sequence: number[]
}

/** Whether `id` is frame-animated per the given animation table. */
export function checkTileAnimated(
  table: AnimationTableLike | null | undefined,
  id: number
): AnimationCheck {
  const entry = table?.tryGetEntry(id)
  return entry
    ? { animated: true, sequence: entry.tileSequence }
    : { animated: false, sequence: [] }
}

/**
 * Pre-flight an about-to-be-assigned tile id against the loaded legacy animation
 * tables. Floor ids are checked against gndani.tbl, wall ids against stcani.tbl.
 * Returns `{ animated: false }` when no client is loaded (no table) — the caller
 * should treat that as "unknown / can't verify", not "safe".
 */
export function checkTileAnimatedForLayer(
  assets: AnimationAssets | null | undefined,
  layer: TileLayer,
  id: number
): AnimationCheck {
  if (!assets) return { animated: false, sequence: [] }
  const table = layer === 'wall' ? assets.stcAnimationTable : assets.groundAnimationTable
  return checkTileAnimated(table, id)
}
