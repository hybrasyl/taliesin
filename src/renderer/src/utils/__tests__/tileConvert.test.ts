import { describe, it, expect } from 'vitest'
import { convertOrthoTile, resampleTile } from '../tileConvert'
import { PixelBuffer } from '../duotone'
import { GROUND_TILE_WIDTH, GROUND_TILE_HEIGHT, ISO_HTILE_W } from '../mapRenderer'

// ── Fixtures (follow the solidSource() PixelBuffer pattern from duotone.test) ──

function solidSource(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a = 255
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = a
  }
  return { data, width, height }
}

/** Left half one colour, right half another — used to probe corner sampling. */
function splitSource(
  width: number,
  height: number,
  left: [number, number, number],
  right: [number, number, number]
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = x < width / 2 ? left : right
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return { data, width, height }
}

function px(buf: PixelBuffer, x: number, y: number): [number, number, number, number] {
  const i = (y * buf.width + x) * 4
  return [buf.data[i], buf.data[i + 1], buf.data[i + 2], buf.data[i + 3]]
}

describe('convertOrthoTile — floor geometry', () => {
  it('emits a 56×27 footprint at scale 1', () => {
    const out = convertOrthoTile(solidSource(32, 32, 10, 20, 30), { layer: 'floor' })
    expect(out.width).toBe(GROUND_TILE_WIDTH)
    expect(out.height).toBe(GROUND_TILE_HEIGHT)
    expect(out.width).toBe(56)
    expect(out.height).toBe(27)
  })

  it('emits a 112×54 footprint at scale 2', () => {
    const out = convertOrthoTile(solidSource(32, 32, 10, 20, 30), { layer: 'floor', scale: 2 })
    expect(out.width).toBe(112)
    expect(out.height).toBe(54)
  })

  it('rejects scales outside {1, 2}', () => {
    // exercising the runtime guard with an out-of-enum value
    const badOpts = { layer: 'floor', scale: 3 } as unknown as Parameters<
      typeof convertOrthoTile
    >[1]
    expect(() => convertOrthoTile(solidSource(4, 4, 0, 0, 0), badOpts)).toThrow()
  })
})

describe('convertOrthoTile — floor is fully opaque', () => {
  it('every output pixel has alpha 255 for a solid source', () => {
    const out = convertOrthoTile(solidSource(16, 16, 200, 100, 50), { layer: 'floor' })
    for (let i = 3; i < out.data.length; i += 4) {
      expect(out.data[i]).toBe(255)
    }
  })

  it('forces alpha 255 even when the source carries transparency', () => {
    // A source with a transparent border must still yield an opaque floor — the
    // 56×27 diamond carries real surface in the corners, not alpha.
    const src = solidSource(16, 16, 200, 100, 50, 0)
    const out = convertOrthoTile(src, { layer: 'floor' })
    for (let i = 3; i < out.data.length; i += 4) {
      expect(out.data[i]).toBe(255)
    }
  })

  it('reproduces the source colour at the diamond centre', () => {
    const out = convertOrthoTile(solidSource(16, 16, 123, 45, 67), { layer: 'floor' })
    const [r, g, b] = px(out, GROUND_TILE_WIDTH / 2, Math.floor(GROUND_TILE_HEIGHT / 2))
    expect(r).toBe(123)
    expect(g).toBe(45)
    expect(b).toBe(67)
  })
})

describe('convertOrthoTile — floor is deterministic', () => {
  it('same input → identical output', () => {
    const src = solidSource(24, 24, 33, 66, 99)
    const a = convertOrthoTile(src, { layer: 'floor' })
    const b = convertOrthoTile(src, { layer: 'floor' })
    expect(Array.from(a.data)).toEqual(Array.from(b.data))
  })
})

describe('convertOrthoTile — floor corner fill (wrap vs clamp)', () => {
  const RED: [number, number, number] = [255, 0, 0]
  const BLUE: [number, number, number] = [0, 0, 255]
  // Left half red, right half blue. The top-left corner triangle maps to a
  // negative source-u; wrap pulls it back into the right (blue) half — i.e. the
  // opposite edge's content — while clamp pins it to the left (red) edge.
  const src = splitSource(16, 16, RED, BLUE)

  it('wrap fills the top-left corner from the opposite (right) edge', () => {
    const out = convertOrthoTile(src, { layer: 'floor', corner: 'wrap', supersample: 1 })
    const [r, , b] = px(out, 0, 0)
    expect(b).toBeGreaterThan(r) // blue-dominant → came from the right half
  })

  it('clamp fills the top-left corner from the nearest (left) edge', () => {
    const out = convertOrthoTile(src, { layer: 'floor', corner: 'clamp', supersample: 1 })
    const [r, , b] = px(out, 0, 0)
    expect(r).toBeGreaterThan(b) // red-dominant → clamped to the left edge
  })

  it('wrap and clamp agree in the diamond interior', () => {
    const wrap = convertOrthoTile(src, { layer: 'floor', corner: 'wrap', supersample: 1 })
    const clamp = convertOrthoTile(src, { layer: 'floor', corner: 'clamp', supersample: 1 })
    const cx = GROUND_TILE_WIDTH / 2
    const cy = Math.floor(GROUND_TILE_HEIGHT / 2)
    expect(px(wrap, cx, cy)).toEqual(px(clamp, cx, cy))
  })
})

describe('convertOrthoTile — wall geometry', () => {
  it('emits a 28-wide face whose height EXACTLY equals wallHeight (legacy match)', () => {
    // Real legacy walls are 28 wide with heights that are multiples of 14; a
    // replacement must match that height exactly, so the slant is carved inside
    // the box rather than added to it.
    const out = convertOrthoTile(solidSource(16, 42, 10, 20, 30), {
      layer: 'wall',
      wallHeight: 56
    })
    expect(out.width).toBe(ISO_HTILE_W)
    expect(out.width).toBe(28)
    expect(out.height).toBe(56)
  })

  it('defaults wall height to the source height', () => {
    const out = convertOrthoTile(solidSource(16, 42, 10, 20, 30), { layer: 'wall' })
    expect(out.height).toBe(42)
  })

  it('doubles width and height at scale 2', () => {
    const out = convertOrthoTile(solidSource(16, 42, 10, 20, 30), {
      layer: 'wall',
      scale: 2,
      wallHeight: 56
    })
    expect(out.width).toBe(56)
    expect(out.height).toBe(112)
  })
})

describe('convertOrthoTile — wall transparency outside the face', () => {
  const src = solidSource(16, 42, 100, 150, 200)

  it("leaves the 'left'-slant transparent triangle in the top-left corner", () => {
    const out = convertOrthoTile(src, { layer: 'wall', wallHeight: 56, wallSlant: 'left' })
    expect(px(out, 0, 0)[3]).toBe(0)
  })

  it("mirrors the transparent triangle to the top-right for 'right' slant", () => {
    const out = convertOrthoTile(src, { layer: 'wall', wallHeight: 56, wallSlant: 'right' })
    expect(px(out, out.width - 1, 0)[3]).toBe(0)
  })

  it("fills the whole 28×H rectangle for 'none' slant (no transparent triangles)", () => {
    const out = convertOrthoTile(src, { layer: 'wall', wallHeight: 56, wallSlant: 'none' })
    expect(px(out, 0, 0)[3]).toBe(255)
    expect(px(out, out.width - 1, 0)[3]).toBe(255)
  })

  it('keeps the face interior opaque and carrying the source colour', () => {
    const out = convertOrthoTile(src, { layer: 'wall', wallHeight: 56, wallSlant: 'left' })
    const [r, g, b, a] = px(out, 14, 28) // safely inside the parallelogram
    expect(a).toBe(255)
    expect([r, g, b]).toEqual([100, 150, 200])
  })

  it('preserves colour (not just alpha) for a semi-transparent source', () => {
    // Premultiplied averaging must not inflate colour when alpha < 255.
    const semi = solidSource(16, 42, 100, 150, 200, 128)
    const out = convertOrthoTile(semi, { layer: 'wall', wallHeight: 56, wallSlant: 'left' })
    const [r, g, b, a] = px(out, 14, 28)
    expect([r, g, b]).toEqual([100, 150, 200])
    expect(a).toBe(128)
  })
})

describe('convertOrthoTile — wall is deterministic', () => {
  it('same input → identical output', () => {
    const src = solidSource(16, 24, 40, 80, 120)
    const a = convertOrthoTile(src, { layer: 'wall' })
    const b = convertOrthoTile(src, { layer: 'wall' })
    expect(Array.from(a.data)).toEqual(Array.from(b.data))
  })
})

describe('resampleTile — already-isometric normalize (no reprojection)', () => {
  it('resizes an iso floor source to an opaque 56×27 without a diamond mask', () => {
    // A source with transparent corners would keep them if reprojected; resample
    // just resizes and forces opacity, so every pixel ends up alpha 255.
    const src = solidSource(64, 32, 70, 80, 90)
    const out = resampleTile(src, { layer: 'floor' })
    expect(out.width).toBe(56)
    expect(out.height).toBe(27)
    for (let i = 3; i < out.data.length; i += 4) expect(out.data[i]).toBe(255)
    expect(px(out, 28, 13).slice(0, 3)).toEqual([70, 80, 90])
  })

  it('resizes an iso wall source to 28×wallHeight preserving alpha', () => {
    const src = solidSource(32, 40, 10, 20, 30, 128)
    const out = resampleTile(src, { layer: 'wall', wallHeight: 40 })
    expect(out.width).toBe(28)
    expect(out.height).toBe(40) // no iso slant added on the iso path
    expect(px(out, 14, 20)).toEqual([10, 20, 30, 128])
  })

  it('doubles the footprint at scale 2', () => {
    const out = resampleTile(solidSource(64, 32, 1, 2, 3), { layer: 'floor', scale: 2 })
    expect(out.width).toBe(112)
    expect(out.height).toBe(54)
  })
})
