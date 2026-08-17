import type { SotpFile } from '@eriscorp/dalib-ts'

// ── Wall (foreground) tile-ID allocation for static_tiles ─────────────────────
//
// There are exactly two hard limits on a wall id. Both come from something that
// breaks if you cross it:
//
//  - **Client render filter** (Brigid `IsRenderedTileIndex`):
//        (id > 10012) || ((id % 10000) > 12)
//    Ids 0–12 and 10000–10012 never draw. Art committed there is dead: the pack
//    compiles and the client ignores it.
//  - **Server ceiling.** The embedded `sotp.dat` is 20,423 bytes, indexed
//    1-based, and the server reads `Game.Collisions[id - 1]` unchecked. An id
//    above 20,423 throws and takes down map load. 20,423 is the maximum.
//
// Everything between those is a legal target.
//
// This file used to declare a "mintable window" of [10013, 20423], on the
// reasoning that a new id must sit above the whole legacy range so it cannot
// collide with a legacy wall. **There is no such window, and 10,000 is not a
// boundary.** Do not reintroduce one, and do not repeat the claim that the
// window belongs somewhere else instead — it belongs nowhere.
//
// The space below 10,000 is not more crowded than the space above it. It is
// less. WLD-44 counts 19,432 static tiles against a 20,423 ceiling, and the
// missing 992 are one contiguous block at **9008–9999** — the largest run of
// ids with no legacy art anywhere in the table, and it is below 10,000. The
// same card identifies 2,938 further ids that are free to take new art, and
// they start at 24.
//
// What IS true is that many ids already carry legacy art that some map places,
// so picking one at random overwrites something a player can see. That is a
// question of WHICH id, not of which range, and RECLAIMABLE_WALL_IDS answers
// it.
//
// Walkability is fixed per-id by the same sotp.dat byte the map renderer reads
// (mapRenderer.isTilePassable): low nibble 0x0f == 0 → passable, else blocking.
// An id inherits whatever byte its slot holds; the allocator surfaces that so
// authors don't ship walls players walk through, or flowers they collide with.

/** Lowest wall id the client draws. */
export const WALL_ID_MIN = 13
/** Highest wall id the server can index without crashing (sotp.dat length). */
export const WALL_ID_MAX = 20423

/**
 * Mirror of Brigid's `IsRenderedTileIndex`: which foreground ids the client
 * actually draws. Ids 0–12 and 10000–10012 are sentinels and never draw.
 */
export function isRenderedTileIndex(id: number): boolean {
  return id > 10012 || id % 10000 > 12
}

/**
 * True when art committed to `id` can reach a player: an integer the client
 * draws, at or below the id the server can index.
 *
 * This is the whole rule. There is no separate rule for a new tile and a
 * replacement — the client and the server do not know which one you meant.
 */
export function isCommittableWallId(id: number): boolean {
  return Number.isInteger(id) && id > 0 && id <= WALL_ID_MAX && isRenderedTileIndex(id)
}

/**
 * The empty band: ids the legacy client has no art for at all.
 *
 * `ia.dat` holds 19,432 tiles against a 20,423 ceiling, and the 992 missing are
 * one contiguous run (WLD-44). There is nothing at these ids to overwrite, no
 * duplicate to dedup and no cell to clear, which makes them the cheapest ids in
 * the table — cheaper than the reviewed pool below, where each id at least
 * *has* legacy art even if no map places it.
 */
export const EMPTY_WALL_ID_BAND: readonly [number, number] = [9008, 9999]

/**
 * Ids that are free to take new art.
 *
 * Two sources, both from WLD-44. The empty band above, and its "Preferred for
 * overwrite" list — reviewed against `ia.dat`, every one exists, and none is
 * placed in a loaded map, so overwriting one changes nothing a player sees
 * today. The 45 ids WLD-44 lists as still placed are excluded: they need their
 * cells cleared first, so they are not something to hand out by default.
 *
 * Each entry is an inclusive range, sorted and non-overlapping.
 *
 * This is a starting pool, not a limit. Any id `isCommittableWallId` accepts is
 * a legal target; this is the set that costs nothing to take.
 */
export const RECLAIMABLE_WALL_IDS: readonly (readonly [number, number])[] = [
  [25, 26],
  [35, 38],
  [47, 48],
  [2901, 2901],
  [2907, 2907],
  [2920, 2920],
  [2926, 2926],
  [2937, 2937],
  [2942, 2943],
  [2949, 2949],
  [2955, 2955],
  [2968, 2968],
  [2974, 2974],
  [2984, 2985],
  [2990, 2991],
  [2997, 2997],
  [3003, 3003],
  [3016, 3016],
  [3022, 3022],
  [3132, 3132],
  [3175, 3175],
  [3317, 3369],
  [5898, 5909],
  [5914, 5920],
  [6159, 6160],
  [6453, 6497],
  [6641, 6645],
  [7422, 7423],
  [8111, 8158],
  [8558, 8560],
  [8581, 8582],
  [8587, 8588],
  // The empty band. No legacy art at any of these — see EMPTY_WALL_ID_BAND.
  EMPTY_WALL_ID_BAND,
  [14324, 14508],
  [14567, 14579],
  [14632, 14651],
  [14697, 14739],
  [14742, 14748],
  [14751, 14758],
  [14769, 14789],
  [15091, 15262],
  [15406, 15425],
  [15438, 15525],
  [18487, 18546],
  [18549, 18571],
  [18650, 18674],
  [18676, 18791],
  [19006, 19061],
  [19129, 19290]
]

/** How many ids the reclaimable pool holds. */
export function reclaimableWallIdCount(): number {
  return RECLAIMABLE_WALL_IDS.reduce((n, [lo, hi]) => n + (hi - lo + 1), 0)
}

/** True when `id` is in the reclaimable pool. */
export function isReclaimableWallId(id: number): boolean {
  return RECLAIMABLE_WALL_IDS.some(([lo, hi]) => id >= lo && id <= hi)
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
  /**
   * Search the whole legal range instead of the reclaimable pool. Every id it
   * can return is legal, but most of them carry legacy art a map still places.
   */
  anyId?: boolean
}

/**
 * The lowest free wall id, taken from the reclaimable pool by default.
 *
 * Returns null when the pool is exhausted, or when nothing in it matches the
 * requested walkability.
 *
 * Degrades gracefully: if `passability` is requested but no `sotp` table is
 * available, the walkability filter is skipped — the caller is expected to
 * surface "walkability unknown" in that case.
 */
export function nextWallId(opts: NextWallIdOptions = {}): number | null {
  const used = opts.used instanceof Set ? opts.used : new Set<number>(opts.used ?? [])
  const filterWalk = !!opts.passability && !!opts.sotp
  const ranges: readonly (readonly [number, number])[] = opts.anyId
    ? [[WALL_ID_MIN, WALL_ID_MAX]]
    : RECLAIMABLE_WALL_IDS

  for (const [lo, hi] of ranges) {
    for (let id = lo; id <= hi; id++) {
      if (used.has(id)) continue
      if (!isCommittableWallId(id)) continue
      if (filterWalk && wallWalkability(opts.sotp, id) !== opts.passability) continue
      return id
    }
  }
  return null
}
