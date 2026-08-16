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
    return await createImageBitmap(new Blob([new Uint8Array(res.bytes)], { type: res.mime }))
  } catch {
    return null
  }
}

/**
 * Bitmap resolution with the shared pack-override → legacy-fallback → cache
 * pattern used by every renderer (map floor/wall, world-map fields):
 *   1. return the cached bitmap if present;
 *   2. if `id` is in the coverage set, try the installed-pack override;
 *   3. otherwise (or if the override fails) render the legacy `.dat` art.
 * The resolved bitmap is cached under `cacheKey`. `renderLegacy` returning null
 * means "no art" (not cached); a throw propagates (used by renderField to show
 * an error). `id` (coverage/pack key) is separate from `cacheKey` because the
 * world-map cache keys by client-path while covering/resolving by field name.
 *
 * `onSource` reports which path produced the bitmap (HTOO-171). Step 2 falling
 * through to step 3 is silent otherwise: a pack that covers the id but fails to
 * decode looks exactly like a pack that was never installed, so a caller that
 * wants to name the source it used has to be told.
 */
export type OverrideSource = 'pack' | 'legacy' | 'cache'

export async function resolveWithPackOverride<I extends number | string, K>(
  subtype: string,
  id: I,
  coverage: ReadonlySet<I>,
  cache: Map<K, ImageBitmap>,
  cacheKey: K,
  renderLegacy: () => Promise<ImageBitmap | null>,
  onSource?: (source: OverrideSource) => void
): Promise<ImageBitmap | null> {
  const cached = cache.get(cacheKey)
  if (cached) {
    onSource?.('cache')
    return cached
  }

  if (coverage.has(id)) {
    const override = await resolvePackBitmap(subtype, id)
    if (override) {
      cache.set(cacheKey, override)
      onSource?.('pack')
      return override
    }
  }

  const bitmap = await renderLegacy()
  if (bitmap) {
    cache.set(cacheKey, bitmap)
    onSource?.('legacy')
  }
  return bitmap
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
