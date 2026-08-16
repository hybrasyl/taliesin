/**
 * Dropping the renderer's view of installed .datf packs (HTOO-421).
 *
 * A pack is cached in three places, and a compile invalidated none of them, so
 * the editors kept showing the previous art until Taliesin was restarted:
 *
 *  1. **Main holds the zip open.** `loadPacks` keeps an unzipper directory and
 *     an entry map per pack, bound at scan time. `window.api.packReload()` is
 *     what re-reads them.
 *  2. **The renderer holds decoded bitmaps.** `mapRenderer`'s asset sets and
 *     `worldMapRenderer`'s field bitmaps.
 *  3. **The renderer holds coverage snapshots** — which ids a pack overrides at
 *     all. This is the one that hides: a tile a pack has only just started
 *     covering is never even asked about, so dropping the bitmaps alone looks
 *     like a fix and is not. Both snapshots live inside the caches below
 *     (static tiles inside `MapAssets`, world maps in the field cache), so
 *     clearing those clears the coverage with them.
 *
 * Call `clearPackCaches` when this process wrote the pack — main reloads its own
 * registry at the end of `pack:compile`, so only the renderer half is left.
 * Call `reloadPacks` when something else did.
 */
import { clearAllCaches } from './mapRenderer'
import { clearFieldCache } from './worldMapRenderer'

/** Drop every renderer cache that can hold pack art or pack coverage. */
export function clearPackCaches(): void {
  clearAllCaches()
  clearFieldCache()
}

/**
 * Re-read the pack set in main, then drop the renderer caches.
 *
 * The order matters: clearing first would let a render that lands in between
 * re-populate the caches from the stale registry.
 *
 * A failed reload still clears. The caches are then merely cold, which costs a
 * re-decode and is strictly better than keeping art we have been told is out of
 * date.
 */
export async function reloadPacks(): Promise<void> {
  try {
    await window.api.packReload()
  } catch (err) {
    console.warn('[packs] reload failed:', err)
  }
  clearPackCaches()
}
