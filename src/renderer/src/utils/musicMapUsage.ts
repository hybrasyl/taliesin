/**
 * Which maps play each music id (HTOO-358).
 *
 * The world index carries a map's `Music` attribute as `mapDetails[].music`
 * since hybindex-ts 1.3.0 (HTOO-357). The field is absent when the map does
 * not set it. 0 is a music id, not "no music", so 0 is a key like any other.
 */

/** The two fields of a world-index map detail that the join reads. */
export interface MapMusicDetail {
  name: string
  music?: number
}

/**
 * Map each music id to the names of the active maps that play it, sorted.
 *
 * Returns null when no map in the index carries a `music` field. That is an
 * index without the data (one built before 1.3.0, or a world where no map sets
 * Music), and the caller must show no column at all. An empty column would say
 * "no map plays this track", which the data does not support (HTOO-169).
 */
export function mapsByMusicId(
  details: readonly MapMusicDetail[] | null | undefined
): Map<number, string[]> | null {
  if (!details) return null
  const byId = new Map<number, string[]>()
  let carried = false
  for (const d of details) {
    if (d.music === undefined) continue
    carried = true
    const names = byId.get(d.music)
    if (names) names.push(d.name)
    else byId.set(d.music, [d.name])
  }
  if (!carried) return null
  for (const names of byId.values()) {
    names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }
  return byId
}
