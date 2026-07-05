import type { TileLayer } from './tileConvert'
import { checkTileAnimatedForLayer, type AnimationAssets } from './tileAnimation'

// ── Static-tile render eligibility (Static Tile Manager, Phase 4) ─────────────
//
// The Brigid client silently skips pack art for a tile in two cases, so
// authoring a floor{id}.png / wall{id}.png for such an id has NO visible effect:
//
//   1. frame-animated — the id appears in gndani.tbl / stcani.tbl and the client
//      keeps cycling the legacy tile sequence (see tileAnimation.ts).
//   2. palette-cycled — the id HAS legacy data AND its palette carries cycling
//      entries, so Brigid renders the animated legacy palette instead of the pack
//      PNG (MapRenderer.cs phase 2.5).
//
// Neither case is enforced by the client — it just ignores the pack art — so a
// pre-flight warning at ID-assignment time is the only guard. This module folds
// both checks into one reusable eligibility call (kept structurally typed + pure
// so it can be unit-tested and reused by the map-authoring feature).

/** Why a pack PNG for a tile id won't render (undefined ⇒ it will). */
export type Ineligibility = 'animated' | 'cycled'

/** Human label for an ineligibility reason (for warnings / batch summaries). */
export function describeIneligibility(reason: Ineligibility): string {
  return reason === 'animated' ? 'frame-animated' : 'palette-cycled'
}

export interface TileEligibility {
  /** True when a pack PNG for this id will actually render. */
  eligible: boolean
  /** Present only when `eligible` is false — which skip rule fired. */
  reason?: Ineligibility
  /** The legacy tile-ID cycle (animated case only). */
  sequence?: number[]
}

/** Minimal shape of a dalib PaletteTable — decoupled for testability. */
export interface PaletteTableLike {
  getPaletteNumber(id: number): number
  getCyclingEntries(paletteNumber: number): readonly unknown[] | undefined
}

/** Minimal shape of a dalib DataArchive — decoupled for testability. */
export interface ArchiveLike {
  get(name: string): unknown
}

/**
 * Everything `checkTileEligibility` needs, structurally (MapAssets satisfies
 * this). Extends AnimationAssets with the palette tables + legacy-existence data.
 */
export interface EligibilityAssets extends AnimationAssets {
  groundTileCount: number
  groundPaletteTable: PaletteTableLike
  iaArchive: ArchiveLike
  stcPaletteTable: PaletteTableLike
}

/**
 * Whether `id`'s palette carries cycling entries, per Brigid's rule:
 * `getCyclingEntries(getPaletteNumber(id + 1)) != null`. The `+1` offset matches
 * `mapRenderer.getGroundBitmap`/`getStcBitmap`. Pure — the caller gates this on
 * legacy existence (a pack-only id is never cycled-skipped).
 */
export function isPaletteCycled(palTable: PaletteTableLike, id: number): boolean {
  return palTable.getCyclingEntries(palTable.getPaletteNumber(id + 1)) != null
}

/** Whether a floor `id` has legacy TILEA.BMP data (1-based, ≤ tile count). */
export function hasLegacyFloor(assets: { groundTileCount: number }, id: number): boolean {
  return id >= 1 && id <= assets.groundTileCount
}

/** Whether a wall `id` has a legacy stc HPF in ia.dat. */
export function hasLegacyWall(assets: { iaArchive: ArchiveLike }, id: number): boolean {
  return assets.iaArchive.get(`stc${String(id).padStart(5, '0')}.hpf`) != null
}

/**
 * Pre-flight an about-to-be-assigned tile id against the loaded legacy tables.
 * Order matches Brigid: frame-animated first (takes precedence), then
 * palette-cycled (gated on legacy existence — a minted id with no legacy
 * tile/HPF always renders regardless of palette), else eligible.
 *
 * Returns `{ eligible: true }` when no client is loaded (no tables to check) —
 * the caller should surface a separate "can't verify" note, not imply "safe".
 */
export function checkTileEligibility(
  assets: EligibilityAssets | null | undefined,
  layer: TileLayer,
  id: number
): TileEligibility {
  if (!assets) return { eligible: true }

  const anim = checkTileAnimatedForLayer(assets, layer, id)
  if (anim.animated) return { eligible: false, reason: 'animated', sequence: anim.sequence }

  const hasLegacy = layer === 'wall' ? hasLegacyWall(assets, id) : hasLegacyFloor(assets, id)
  if (hasLegacy) {
    const palTable = layer === 'wall' ? assets.stcPaletteTable : assets.groundPaletteTable
    if (isPaletteCycled(palTable, id)) return { eligible: false, reason: 'cycled' }
  }

  return { eligible: true }
}
