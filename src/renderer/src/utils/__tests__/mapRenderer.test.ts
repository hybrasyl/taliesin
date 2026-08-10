import { describe, it, expect, vi } from 'vitest'
import {
  lruTouch,
  lruGet,
  _assetCacheSize,
  clearAllCaches,
  drawDiamond,
  isoCanvasSize
} from '../mapRenderer'
import { PREVIEW_BOX_HEIGHT } from '../../components/catalog/DimensionPickerDialog'

// The Dimension Picker measures its preview box, solves a scale to fit, and
// hands that scale to renderMap — which sizes the canvas from its OWN
// constants. If the two disagree the render's output feeds the next render's
// input and the dialog grows without bound. The equality below is what broke.
describe('isoCanvasSize ↔ the Dimension Picker scale computation', () => {
  const BOX_W = 520

  /** Exactly what DimensionPickerDialog.renderCanvas does. */
  function previewScale(w: number, h: number): number {
    const maxW = BOX_W - 2
    const maxH = PREVIEW_BOX_HEIGHT - 2
    const { w: nativeW, h: nativeH } = isoCanvasSize(w, h)
    return Math.min(maxW / nativeW, maxH / nativeH, 1)
  }

  it.each([
    [10, 10],
    [40, 40],
    [64, 32],
    [100, 100],
    [255, 255]
  ])('a %ix%i map renders no larger than the box it was scaled to fit', (w, h) => {
    const scale = previewScale(w, h)
    const { w: cw, h: ch } = isoCanvasSize(w, h, scale)
    // +1 each way for Math.ceil, which can only round up by under a pixel.
    expect(ch).toBeLessThanOrEqual(PREVIEW_BOX_HEIGHT - 2 + 1)
    expect(cw).toBeLessThanOrEqual(BOX_W - 2 + 1)
  })

  it('is idempotent — rendering the same size twice gives the same canvas', () => {
    // "Pick the same size twice in a row. The canvas is byte-identical, not one
    // row taller." The scale depends only on (w, h) and the box, never on what
    // was last drawn, so there is no feedback path left.
    const first = isoCanvasSize(80, 60, previewScale(80, 60))
    const second = isoCanvasSize(80, 60, previewScale(80, 60))
    expect(second).toEqual(first)
  })

  it('reproduces the ratchet if the foreground pad is understated', () => {
    // Pins WHY this broke rather than only that it is fixed. The dialog used
    // 480 where the renderer uses 512, so it solved scale against a shorter map
    // than the one renderMap would draw, and the canvas came back taller than
    // the box it had just measured — which then grew, and fed the next render.
    //
    // A SMALL map, because the fault only shows when height is the binding
    // constraint. Native height is about half native width plus the pad, so on
    // a large map width binds, the pad error never reaches the scale, and
    // nothing ratchets. 10x10 is where the 512 pad dominates.
    const [w, h] = [10, 10]
    const maxH = PREVIEW_BOX_HEIGHT - 2
    const wrongNativeH = (w + h) * 14 + 480 // the old hardcoded derivation
    const wrongScale = Math.min((BOX_W - 2) / ((w + h) * 28 + 56), maxH / wrongNativeH, 1)
    expect(wrongScale).toBe(maxH / wrongNativeH) // height really is binding
    expect(isoCanvasSize(w, h, wrongScale).h).toBeGreaterThan(maxH + 1)

    // And the corrected computation does not overshoot on the same map.
    expect(isoCanvasSize(w, h, previewScale(w, h)).h).toBeLessThanOrEqual(maxH + 1)
  })
})

describe('drawDiamond', () => {
  function mockCtx() {
    return {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn()
    } as unknown as CanvasRenderingContext2D
  }

  it('traces the four diamond corners at scale 1 (HTILE_W=28, half-height 14)', () => {
    const ctx = mockCtx()
    drawDiamond(ctx, 100, 50, 1)
    expect(ctx.beginPath).toHaveBeenCalledOnce()
    expect(ctx.moveTo).toHaveBeenCalledWith(100, 36) // top: cy - hv
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 128, 50) // right: cx + hw
    expect(ctx.lineTo).toHaveBeenNthCalledWith(2, 100, 64) // bottom: cy + hv
    expect(ctx.lineTo).toHaveBeenNthCalledWith(3, 72, 50) // left: cx - hw
    expect(ctx.closePath).toHaveBeenCalledOnce()
  })

  it('scales the diamond half-extents by the scale factor', () => {
    const ctx = mockCtx()
    drawDiamond(ctx, 0, 0, 0.5) // hw = 14, hv = 7
    expect(ctx.moveTo).toHaveBeenCalledWith(0, -7)
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 14, 0)
    expect(ctx.lineTo).toHaveBeenNthCalledWith(2, 0, 7)
    expect(ctx.lineTo).toHaveBeenNthCalledWith(3, -14, 0)
  })

  it('defaults scale to 1', () => {
    const ctx = mockCtx()
    drawDiamond(ctx, 0, 0)
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 28, 0)
  })
})

describe('lruTouch', () => {
  it('inserts a new key', () => {
    const m = new Map<string, number>()
    lruTouch(m, 'a', 1, 3)
    expect([...m.entries()]).toEqual([['a', 1]])
  })

  it('refreshes an existing key to MRU position', () => {
    const m = new Map<string, number>([
      ['a', 1],
      ['b', 2],
      ['c', 3]
    ])
    lruTouch(m, 'a', 1, 3)
    expect([...m.keys()]).toEqual(['b', 'c', 'a'])
  })

  it('evicts the oldest entry when over the limit', () => {
    const m = new Map<string, number>()
    lruTouch(m, 'a', 1, 2)
    lruTouch(m, 'b', 2, 2)
    lruTouch(m, 'c', 3, 2) // should evict 'a'
    expect([...m.keys()]).toEqual(['b', 'c'])
    expect(m.size).toBe(2)
  })

  it('honors limit=1 (only keeps the most recent)', () => {
    const m = new Map<string, number>()
    lruTouch(m, 'a', 1, 1)
    lruTouch(m, 'b', 2, 1)
    expect([...m.keys()]).toEqual(['b'])
  })

  it('overwriting a key with a new value updates the value AND bumps to MRU', () => {
    const m = new Map<string, number>([
      ['a', 1],
      ['b', 2]
    ])
    lruTouch(m, 'a', 99, 3)
    expect(m.get('a')).toBe(99)
    expect([...m.keys()]).toEqual(['b', 'a'])
  })

  it('repeated insertion past limit caps the cache size', () => {
    const m = new Map<string, number>()
    for (let i = 0; i < 50; i++) lruTouch(m, `k${i}`, i, 2)
    expect(m.size).toBe(2)
    expect([...m.keys()]).toEqual(['k48', 'k49'])
  })
})

describe('lruGet', () => {
  it('returns the value for an existing key', () => {
    const m = new Map<string, number>([
      ['a', 1],
      ['b', 2]
    ])
    expect(lruGet(m, 'a')).toBe(1)
  })

  it('returns undefined for a missing key', () => {
    const m = new Map<string, number>()
    expect(lruGet(m, 'missing')).toBeUndefined()
  })

  it('bumps the read key to MRU', () => {
    const m = new Map<string, number>([
      ['a', 1],
      ['b', 2],
      ['c', 3]
    ])
    lruGet(m, 'a')
    expect([...m.keys()]).toEqual(['b', 'c', 'a'])
  })

  it('does not insert when the key is missing (no side effects)', () => {
    const m = new Map<string, number>([['a', 1]])
    lruGet(m, 'b')
    expect(m.size).toBe(1)
    expect(m.has('b')).toBe(false)
  })
})

describe('clearAllCaches / _assetCacheSize', () => {
  it('clearAllCaches resets the asset cache to size 0', () => {
    clearAllCaches()
    expect(_assetCacheSize()).toBe(0)
  })
})
