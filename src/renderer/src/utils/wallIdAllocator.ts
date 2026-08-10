import type { SotpFile } from '@eriscorp/dalib-ts'

// ── Wall (foreground) tile-ID allocation for minted static_tiles ──────────────
//
// Constraints (see docs/plans/complete/static-tile-manager.md — "authoritative DA tile
// geometry" and "Server-side constraints"):
//
//  - Client render filter (Brigid IsRenderedTileIndex):
//        (id > 10012) || ((id % 10000) > 12)
//    → IDs 0–12 and 10000–10012 are sentinels that never render; 13–9999 are the
//      legacy wall range and DO render.
//  - New IDs are minted ABOVE the sentinel/legacy range (> 10012) so they can't
//    collide with a legacy wall.
//  - Server hard ceiling: the embedded sotp.dat is 20,423 bytes, indexed 1-based
//    (byte for id N at [N-1]); a foreground id > 20423 indexes out of range and
//    CRASHES map load (unchecked). So 20423 is the inclusive maximum.
//
//  ⇒ mintable window = [10013, 20423].
//
// Walkability is fixed per-id by the same sotp.dat byte the map renderer already
// reads (mapRenderer.isTilePassable): low nibble 0x0f == 0 → passable, else
// blocking. A minted id inherits whatever byte its slot holds; the allocator
// surfaces that so authors don't ship walls players walk through (or vice-versa).

/** Lowest wall id that is safe to mint (above sentinels + legacy walls). */
export const WALL_ID_MINT_MIN = 10013
/** Highest wall id the server can index without crashing (sotp.dat length). */
export const WALL_ID_MINT_MAX = 20423

/**
 * Mirror of Brigid's `IsRenderedTileIndex`: which foreground ids the client
 * actually renders. IDs 0–12 and 10000–10012 are sentinels; everything else is
 * rendered (13–9999 legacy, 10013+ minted).
 */
export function isRenderedTileIndex(id: number): boolean {
  return id > 10012 || id % 10000 > 12
}

/** True when `id` is inside the mintable window [10013, 20423]. */
export function isMintableWallId(id: number): boolean {
  return Number.isInteger(id) && id >= WALL_ID_MINT_MIN && id <= WALL_ID_MINT_MAX
}

export type Walkability = 'blocking' | 'passable' | 'unknown'

/**
 * Per-id walkability from a parsed sotp.dat. Semantics match
 * mapRenderer.isTilePassable: collision is the low nibble (0x0f), 0 → passable,
 * non-zero → blocking. The property bit (0x80) does not affect collision, so
 * 0x80 alone is passable. Out-of-range or missing → unknown.
 *
 * The 1-based `id - 1` index now lives inside `SotpFile` rather than being
 * repeated here.
 */
export function wallWalkability(sotp: SotpFile | null | undefined, id: number): Walkability {
  if (!sotp) return 'unknown'
  // KEEP this range check explicit. dalib's getFlags returns 0 — i.e. PASSABLE —
  // for an id past the end of the table, so deferring to it would silently turn
  // every 'unknown' into 'passable'. The allocator needs the distinction: it
  // filters candidate ids by requested walkability, and an id nothing knows
  // about must not read as a free passable slot.
  if (id < 1 || id > sotp.maxTileId) return 'unknown'
  return sotp.getCollision(id) === 0 ? 'passable' : 'blocking'
}

export interface NextWallIdOptions {
  /** Ids already taken (existing pack slots + any reserved this session). */
  used?: Iterable<number>
  /** Parsed sotp.dat for walkability filtering. Omit to skip the filter. */
  sotp?: SotpFile | null
  /** Require the allocated id to have this walkability. */
  passability?: 'blocking' | 'passable'
  /** Override the window (defaults to the mintable window). */
  min?: number
  max?: number
}

/**
 * Lowest free mintable wall id satisfying the window, the used-set, and (when a
 * sotp table is supplied) the requested walkability. Returns null if the window
 * is exhausted.
 *
 * Degrades gracefully: if `passability` is requested but no `sotp` table is
 * available, the walkability filter is skipped (range-only allocation) — the
 * caller is expected to surface "walkability unknown" in that case.
 */
export function nextWallId(opts: NextWallIdOptions = {}): number | null {
  const min = opts.min ?? WALL_ID_MINT_MIN
  const max = opts.max ?? WALL_ID_MINT_MAX
  const used = opts.used instanceof Set ? opts.used : new Set<number>(opts.used ?? [])
  const filterWalk = !!opts.passability && !!opts.sotp

  for (let id = min; id <= max; id++) {
    if (used.has(id)) continue
    if (!isMintableWallId(id)) continue
    if (filterWalk && wallWalkability(opts.sotp, id) !== opts.passability) continue
    return id
  }
  return null
}
