/**
 * The release checks for staged maps (HTOO-634), from Creidhne's
 * `shared/staging.js` (HTOO-453). Pure: the Maps page supplies the staged list
 * from `listStagedMaps` and the live maps from the world index.
 */

/**
 * The key two map names collide on: hybindex's `nameCollisionKey`. The renderer
 * cannot import hybindex, which loads `fs`, so this is a copy, and
 * `mapStaging.test.ts` pins it to the package's function.
 */
export function mapNameKey(name: string): string {
  return name.normalize().toLowerCase()
}

/** One map that a Release moves. */
export interface ReleaseEntry {
  /** Relative to `.staging/maps/`. */
  rel: string
  /** The map's `<Name>`, or `''` when the staged list has none for it. */
  name: string
  id?: number
  /** False for the map the user chose. True for a map that a warp needs. */
  dependency: boolean
  /** For a dependency: the name (or file) of the map whose warp names it. */
  neededBy?: string
}

/**
 * The map to release, and every staged map that its warps need, followed in
 * turn: a released map can warp to a staged map, which can warp to another.
 *
 * A warp target that is live needs nothing. A target that is neither live nor
 * staged is an ordinary broken warp, and Release does not report it. When two
 * staged maps have the target's name, the first by path is taken; the clash
 * check then refuses nothing on that account, and the duplicate shows in the
 * editor.
 */
export function planRelease(
  rel: string,
  staged: readonly StagedMap[],
  liveNames: readonly string[]
): ReleaseEntry[] {
  const chosen = staged.find((m) => m.rel === rel)
  if (!chosen) return []
  const live = new Set(liveNames.map(mapNameKey))
  const byKey = new Map<string, StagedMap>()
  for (const m of [...staged].sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))) {
    if (m.name && !byKey.has(mapNameKey(m.name))) byKey.set(mapNameKey(m.name), m)
  }

  const release: ReleaseEntry[] = [
    { rel: chosen.rel, name: chosen.name ?? '', id: chosen.id, dependency: false }
  ]
  const taken = new Set([chosen.rel])
  let frontier: StagedMap[] = [chosen]
  while (frontier.length) {
    const next: StagedMap[] = []
    for (const m of frontier) {
      for (const target of m.targets) {
        const key = mapNameKey(target)
        if (live.has(key)) continue
        const dep = byKey.get(key)
        if (!dep || taken.has(dep.rel)) continue
        taken.add(dep.rel)
        release.push({
          rel: dep.rel,
          name: dep.name ?? '',
          id: dep.id,
          dependency: true,
          neededBy: m.name || m.rel
        })
        next.push(dep)
      }
    }
    frontier = next
  }
  return release
}

/** Why a map in a release must not move. */
export type ClashReason = 'live-name' | 'live-id' | 'batch-name' | 'batch-id'

export interface ReleaseClash extends ReleaseEntry {
  reason: ClashReason
}

/**
 * The maps of a release that must not move. The server keeps one map for each
 * name and one for each Id, so a map whose name or Id is already live, or is in
 * the release twice, would replace another map or be dropped.
 *
 * `live` is the active maps of the index (`mapDetails`). A map with no name or
 * no Id is not checked for that field.
 */
export function releaseClashes(
  release: readonly ReleaseEntry[],
  live: readonly { name: string; id: number }[]
): ReleaseClash[] {
  const liveNames = new Set(live.map((m) => mapNameKey(m.name)))
  const liveIds = new Set(live.map((m) => m.id))
  const count = <K>(keys: K[]): Map<K, number> => {
    const out = new Map<K, number>()
    for (const k of keys) out.set(k, (out.get(k) ?? 0) + 1)
    return out
  }
  const names = count(release.filter((r) => r.name).map((r) => mapNameKey(r.name)))
  const ids = count(release.filter((r) => r.id !== undefined).map((r) => r.id))

  const out: ReleaseClash[] = []
  for (const r of release) {
    const key = r.name ? mapNameKey(r.name) : null
    const reason: ClashReason | null =
      key !== null && liveNames.has(key)
        ? 'live-name'
        : r.id !== undefined && liveIds.has(r.id)
          ? 'live-id'
          : key !== null && names.get(key)! > 1
            ? 'batch-name'
            : r.id !== undefined && ids.get(r.id)! > 1
              ? 'batch-id'
              : null
    if (reason) out.push({ ...r, reason })
  }
  return out
}

/** One clash as a line in the refusal dialog. */
export function describeClash(c: ReleaseClash): string {
  switch (c.reason) {
    case 'live-name':
      return `${c.rel}: a live map is already named “${c.name}”`
    case 'live-id':
      return `${c.rel}: a live map already has Id ${c.id}`
    case 'batch-name':
      return `${c.rel}: “${c.name}” is in this release twice`
    case 'batch-id':
      return `${c.rel}: Id ${c.id} is in this release twice`
  }
}
