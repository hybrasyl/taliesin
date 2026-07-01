// Renderer-side bridge to installed .datf pack overrides (static_tiles /
// world_maps). The main process resolves the highest-priority pack asset and
// returns a `data:image/png;base64,…` URL; we decode it to an ImageBitmap for
// canvas draw. Returns null when no pack covers (subtype, id) — callers fall
// back to legacy .dat art. Defensive against a missing `window.api` (tests) so
// map/worldmap rendering never breaks when packs are unavailable.

export async function resolvePackBitmap(
  subtype: string,
  id: number | string
): Promise<ImageBitmap | null> {
  let url: string | null
  try {
    url = await window.api.packResolveAsset(subtype, id)
  } catch {
    return null
  }
  if (!url) return null
  try {
    const blob = await (await fetch(url)).blob()
    return await createImageBitmap(blob)
  } catch {
    return null
  }
}

/** IDs a pack covers for a subtype, as a Set. [] on any failure (packs off/tests). */
export async function coveredIdSet<T extends number | string>(
  subtype: string,
  map: (id: number | string) => T
): Promise<Set<T>> {
  try {
    const ids = await window.api.packListCoveredIds(subtype)
    return new Set(ids.map(map))
  } catch {
    return new Set()
  }
}
