// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveWithPackOverride } from '../packOverride'

// Distinct sentinels so we can tell which path produced the bitmap.
const CACHED = { tag: 'cached' } as unknown as ImageBitmap
const OVERRIDE = { tag: 'override' } as unknown as ImageBitmap
const LEGACY = { tag: 'legacy' } as unknown as ImageBitmap

// resolvePackBitmap (same module) decodes window.api.packResolveAsset bytes via
// createImageBitmap; stub both so the override path yields OVERRIDE.
const packResolveAsset = vi.fn()

beforeEach(() => {
  packResolveAsset.mockReset()
  ;(window as unknown as { api: { packResolveAsset: typeof packResolveAsset } }).api = {
    packResolveAsset
  }
  globalThis.createImageBitmap = vi.fn(async () => OVERRIDE) as typeof createImageBitmap
})

describe('resolveWithPackOverride', () => {
  it('returns the cached bitmap without touching coverage/pack/legacy', async () => {
    const cache = new Map<number, ImageBitmap>([[5, CACHED]])
    const legacy = vi.fn(async () => LEGACY)

    const out = await resolveWithPackOverride('floor', 5, new Set([5]), cache, 5, legacy)

    expect(out).toBe(CACHED)
    expect(legacy).not.toHaveBeenCalled()
    expect(packResolveAsset).not.toHaveBeenCalled()
  })

  it('uncovered id skips the pack and renders + caches legacy art', async () => {
    const cache = new Map<number, ImageBitmap>()
    const legacy = vi.fn(async () => LEGACY)

    const out = await resolveWithPackOverride('floor', 7, new Set<number>(), cache, 7, legacy)

    expect(out).toBe(LEGACY)
    expect(packResolveAsset).not.toHaveBeenCalled()
    expect(cache.get(7)).toBe(LEGACY)
  })

  it('covered id resolves the pack override and caches it (legacy untouched)', async () => {
    packResolveAsset.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), mime: 'image/png' })
    const cache = new Map<number, ImageBitmap>()
    const legacy = vi.fn(async () => LEGACY)

    const out = await resolveWithPackOverride('wall', 42, new Set([42]), cache, 42, legacy)

    expect(out).toBe(OVERRIDE)
    expect(legacy).not.toHaveBeenCalled()
    expect(cache.get(42)).toBe(OVERRIDE)
  })

  it('falls back to legacy when a covered override fails to resolve', async () => {
    packResolveAsset.mockResolvedValue(null)
    const cache = new Map<number, ImageBitmap>()
    const legacy = vi.fn(async () => LEGACY)

    const out = await resolveWithPackOverride('wall', 42, new Set([42]), cache, 42, legacy)

    expect(out).toBe(LEGACY)
    expect(cache.get(42)).toBe(LEGACY)
  })

  it('does not cache when legacy returns null (no art)', async () => {
    const cache = new Map<number, ImageBitmap>()
    const legacy = vi.fn(async () => null)

    const out = await resolveWithPackOverride('floor', 9, new Set<number>(), cache, 9, legacy)

    expect(out).toBeNull()
    expect(cache.has(9)).toBe(false)
  })

  it('keys the cache separately from the coverage/pack id (world-map case)', async () => {
    packResolveAsset.mockResolvedValue({ bytes: new Uint8Array([9]), mime: 'image/png' })
    const cache = new Map<string, ImageBitmap>()
    const legacy = vi.fn(async () => LEGACY)

    const out = await resolveWithPackOverride(
      'world_maps',
      'field001',
      new Set(['field001']),
      cache,
      '/client/path/field001',
      legacy
    )

    expect(out).toBe(OVERRIDE)
    expect(packResolveAsset).toHaveBeenCalledWith('world_maps', 'field001')
    expect(cache.get('/client/path/field001')).toBe(OVERRIDE)
  })
})
