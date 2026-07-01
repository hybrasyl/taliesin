// Renderer-side bridge to installed .datf pack overrides (static_tiles /
// world_maps). The main process returns raw bytes + MIME; we wrap them in a Blob
// and decode to an ImageBitmap for canvas draw. Bytes (not a data: URL) because
// the app CSP blocks fetch(data:) via connect-src. Returns null when no pack
// covers (subtype, id) — callers fall back to legacy .dat art. Defensive against
// a missing `window.api` (tests) so rendering never breaks when packs are off.

export async function resolvePackBitmap(
  subtype: string,
  id: number | string
): Promise<ImageBitmap | null> {
  let res: { bytes: Uint8Array; mime: string } | null
  try {
    res = await window.api.packResolveAsset(subtype, id)
  } catch {
    return null
  }
  if (!res) return null
  try {
    return await createImageBitmap(new Blob([res.bytes], { type: res.mime }))
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
