import { describe, it, expect } from 'vitest'
import { convertOrthoTile, resampleTile } from '../tileConvert'
import { padBelow, splitWallHeight } from '../tileShape'
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

describe('convertOrthoTile — floor is a diamond (matches legacy)', () => {
  it('masks the four corners transparent', () => {
    const out = convertOrthoTile(solidSource(16, 16, 200, 100, 50), { layer: 'floor' })
    // corners of the 56×27 box are outside the inscribed diamond → transparent
    expect(px(out, 0, 0)[3]).toBe(0)
    expect(px(out, out.width - 1, 0)[3]).toBe(0)
    expect(px(out, 0, out.height - 1)[3]).toBe(0)
    expect(px(out, out.width - 1, out.height - 1)[3]).toBe(0)
  })

  it('is opaque at the diamond centre and reproduces the source colour', () => {
    const out = convertOrthoTile(solidSource(16, 16, 123, 45, 67), { layer: 'floor' })
    const [r, g, b, a] = px(out, GROUND_TILE_WIDTH / 2, Math.floor(GROUND_TILE_HEIGHT / 2))
    expect(a).toBe(255)
    expect([r, g, b]).toEqual([123, 45, 67])
  })

  it('forces opaque inside the diamond, ignoring source alpha', () => {
    // A DA ground tile is palette indices with no alpha channel: DALib builds
    // every palette entry with the 3-byte `new SKColor(r,g,b)` ctor, so it is
    // always opaque. A translucent floor is not representable in the target
    // format, and emitting one draws gridlines (see floorRowSpan).
    const out = convertOrthoTile(solidSource(16, 16, 123, 45, 67, 128), { layer: 'floor' })
    const [r, g, b, a] = px(out, GROUND_TILE_WIDTH / 2, Math.floor(GROUND_TILE_HEIGHT / 2))
    expect(a).toBe(255)
    expect([r, g, b]).toEqual([123, 45, 67]) // colour un-premultiplied cleanly
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

  it("leaves the 'left'-face transparent triangle in the top-left corner", () => {
    const out = convertOrthoTile(src, { layer: 'wall', wallHeight: 56, wallFace: 'left' })
    expect(px(out, 0, 0)[3]).toBe(0)
  })

  it("mirrors the transparent triangle to the top-right for the 'right' face", () => {
    const out = convertOrthoTile(src, { layer: 'wall', wallHeight: 56, wallFace: 'right' })
    expect(px(out, out.width - 1, 0)[3]).toBe(0)
  })

  it('keeps the face interior opaque and carrying the source colour', () => {
    const out = convertOrthoTile(src, { layer: 'wall', wallHeight: 56, wallFace: 'left' })
    const [r, g, b, a] = px(out, 14, 28) // safely inside the parallelogram
    expect(a).toBe(255)
    expect([r, g, b]).toEqual([100, 150, 200])
  })

  it('preserves colour (not just alpha) for a semi-transparent source', () => {
    // Premultiplied averaging must not inflate colour when alpha < 255.
    const semi = solidSource(16, 42, 100, 150, 200, 128)
    const out = convertOrthoTile(semi, { layer: 'wall', wallHeight: 56, wallFace: 'left' })
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
  it('resizes an iso floor source to a 56×27 diamond (transparent corners)', () => {
    const src = solidSource(64, 32, 70, 80, 90)
    const out = resampleTile(src, { layer: 'floor' })
    expect(out.width).toBe(56)
    expect(out.height).toBe(27)
    expect(px(out, 0, 0)[3]).toBe(0) // corner masked
    const [r, g, b, a] = px(out, 28, 13) // centre
    expect(a).toBe(255)
    expect([r, g, b]).toEqual([70, 80, 90])
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

// ── Raising a wall off its base (HTOO-418) ────────────────────────────────────
//
// The blank rows belong to the CONVERTED tile. These tests are the pair: the
// first states why the source cannot carry them, the rest state what works.

describe('blank rows below a wall', () => {
  /** The lowest row that still has paint. −1 for a fully transparent tile. */
  function lastPaintedRow(buf: PixelBuffer): number {
    for (let y = buf.height - 1; y >= 0; y--) {
      for (let x = 0; x < buf.width; x++) {
        if (buf.data[(y * buf.width + x) * 4 + 3] > 0) return y
      }
    }
    return -1
  }

  /** Empty rows between the lowest paint and the tile base — the raise. */
  function baseGap(buf: PixelBuffer): number {
    return buf.height - 1 - lastPaintedRow(buf)
  }

  const RAISE = 14
  const source = solidSource(28, 42, 200, 100, 50)
  /** The tile with no raise: 42 tall, art sitting on the base. */
  const unraised = convertOrthoTile(source, { layer: 'wall', wallHeight: 42 })

  it('is not the raise asked for when the rows are padded onto the source', () => {
    expect(baseGap(unraised)).toBe(0)
    // Pad the source, and take the taller tile the height field then derives.
    const padded = convertOrthoTile(padBelow(source, RAISE), { layer: 'wall', wallHeight: 56 })
    // The projection maps the whole source down the face, so the empty rows are
    // scaled with it: the art lifts by a fraction of the rows, and stretches to
    // cover the difference. Neither the raise nor the art is what was asked for.
    expect(baseGap(padded)).toBeGreaterThan(0)
    expect(baseGap(padded)).toBeLessThan(RAISE)
  })

  it('raises by exactly the rows asked for when they are added to the converted tile', () => {
    // The tile total stays 56 — a legacy replacement cannot grow — so the art
    // takes 42 of it and the last 14 rows are empty.
    const { art, blank } = splitWallHeight(56, RAISE)
    expect({ art, blank }).toEqual({ art: 42, blank: RAISE })
    const out = padBelow(convertOrthoTile(source, { layer: 'wall', wallHeight: art }), blank)
    expect(out.height).toBe(56)
    expect(baseGap(out)).toBe(RAISE)
  })

  it('leaves the art itself untouched — the same face, moved up', () => {
    const { art, blank } = splitWallHeight(56, RAISE)
    const out = padBelow(convertOrthoTile(source, { layer: 'wall', wallHeight: art }), blank)
    // The first 42 rows are the unraised tile, byte for byte: raising places the
    // art, it does not resample it.
    expect(Array.from(out.data.subarray(0, unraised.data.length))).toEqual(
      Array.from(unraised.data)
    )
  })

  it('scales the blank rows with the tile, so 2× raises by the same amount', () => {
    const { art, blank } = splitWallHeight(56, RAISE)
    const scale = 2
    const out = padBelow(
      convertOrthoTile(source, { layer: 'wall', wallHeight: art, scale }),
      blank * scale
    )
    expect(out.height).toBe(56 * scale)
    expect(baseGap(out)).toBe(RAISE * scale)
  })
})

describe('interpolation modes', () => {
  /** A 2×2 source: left column black, right column white. */
  function halfAndHalf(): PixelBuffer {
    const data = new Uint8ClampedArray(2 * 2 * 4)
    for (const i of [0, 8]) data.set([0, 0, 0, 255], i) // (0,0) and (0,1)
    for (const i of [4, 12]) data.set([255, 255, 255, 255], i) // (1,0) and (1,1)
    return { data, width: 2, height: 2 }
  }

  it('nearest emits only source colours — no blending anywhere', () => {
    const out = resampleTile(halfAndHalf(), {
      layer: 'wall',
      wallHeight: 28,
      interpolation: 'nearest'
    })
    for (let i = 0; i < out.data.length; i += 4) {
      expect([0, 255]).toContain(out.data[i])
      expect(out.data[i]).toBe(out.data[i + 1]) // stays grey-neutral
    }
  })

  it('linear blends across the colour boundary', () => {
    const out = resampleTile(halfAndHalf(), {
      layer: 'wall',
      wallHeight: 28,
      interpolation: 'linear'
    })
    let blended = 0
    for (let i = 0; i < out.data.length; i += 4) {
      if (out.data[i] > 16 && out.data[i] < 240) blended++
    }
    expect(blended).toBeGreaterThan(0)
  })

  it('nearest reproduces a solid source exactly, floors included', () => {
    const out = convertOrthoTile(solidSource(16, 16, 123, 45, 67), {
      layer: 'floor',
      interpolation: 'nearest'
    })
    const [r, g, b, a] = px(out, GROUND_TILE_WIDTH / 2, Math.floor(GROUND_TILE_HEIGHT / 2))
    expect([r, g, b, a]).toEqual([123, 45, 67, 255])
  })

  it('nearest steps the floor diamond edge hard — alpha is 0 or 255 only', () => {
    const out = convertOrthoTile(solidSource(16, 16, 10, 20, 30), {
      layer: 'floor',
      interpolation: 'nearest'
    })
    for (let i = 3; i < out.data.length; i += 4) {
      expect([0, 255]).toContain(out.data[i])
    }
  })

  it('area steps the floor diamond edge hard too — alpha is never partial', () => {
    // The diamond edge must NOT antialias. The (28,14) lattice tessellates
    // exactly, so a partly transparent edge pixel has no neighbour beneath it
    // and composites onto the background, drawing a line at every tile seam.
    // `area` still smooths COLOUR (covered by the blending test above); it just
    // may not smooth alpha.
    const out = convertOrthoTile(solidSource(16, 16, 10, 20, 30), { layer: 'floor' })
    for (let i = 3; i < out.data.length; i += 4) {
      expect([0, 255]).toContain(out.data[i])
    }
  })

  it('linear wall output keeps the exact tile dimensions', () => {
    const out = convertOrthoTile(solidSource(30, 60, 5, 5, 5), {
      layer: 'wall',
      wallHeight: 56,
      interpolation: 'linear'
    })
    expect(out.width).toBe(ISO_HTILE_W)
    expect(out.height).toBe(56)
  })
})

// ── Floor alpha / mask must match DALib exactly ───────────────────────────────
//
// Regression cover for the gridline bug: floor output used an antialiased
// inscribed diamond, which (a) left 28 px per tile transparent that the client
// draws, and (b) gave edge pixels partial alpha. Because the (28,14) lattice
// tessellates exactly, a partly transparent edge pixel has no neighbour beneath
// it and composites onto the background, drawing a dark line at every seam.

/** DALib Graphics.RenderTile: row r spans [margin, W-margin), margin=|13-r|*2. */
function dalibSpan(row: number, scale: 1 | 2): { start: number; end: number } {
  const margin = Math.abs((GROUND_TILE_HEIGHT - 1) / 2 - Math.floor(row / scale)) * 2 * scale
  return { start: margin, end: GROUND_TILE_WIDTH * scale - margin }
}

function alphaReport(buf: PixelBuffer, scale: 1 | 2) {
  let inDiamondNotOpaque = 0
  let outsideNotClear = 0
  let partial = 0
  let opaque = 0
  for (let y = 0; y < buf.height; y++) {
    const { start, end } = dalibSpan(y, scale)
    for (let x = 0; x < buf.width; x++) {
      const a = px(buf, x, y)[3]
      if (a > 0 && a < 255) partial++
      if (a === 255) opaque++
      const inside = x >= start && x < end
      if (inside && a !== 255) inDiamondNotOpaque++
      if (!inside && a !== 0) outsideNotClear++
    }
  }
  return { inDiamondNotOpaque, outsideNotClear, partial, opaque }
}

describe('floor alpha matches the DALib diamond', () => {
  for (const scale of [1, 2] as const) {
    it(`convertOrthoTile: binary alpha on the exact diamond at scale ${scale}`, () => {
      const out = convertOrthoTile(solidSource(32, 32, 90, 120, 60), { layer: 'floor', scale })
      const r = alphaReport(out, scale)
      expect(r.partial).toBe(0)
      expect(r.inDiamondNotOpaque).toBe(0)
      expect(r.outsideNotClear).toBe(0)
      expect(r.opaque).toBe(784 * scale * scale)
    })

    it(`resampleTile: binary alpha on the exact diamond at scale ${scale}`, () => {
      const out = resampleTile(solidSource(56, 27, 90, 120, 60), { layer: 'floor', scale })
      const r = alphaReport(out, scale)
      expect(r.partial).toBe(0)
      expect(r.inDiamondNotOpaque).toBe(0)
      expect(r.outsideNotClear).toBe(0)
      expect(r.opaque).toBe(784 * scale * scale)
    })
  }

  it('every drawn pixel carries real colour, never a black hole', () => {
    const out = convertOrthoTile(solidSource(32, 32, 90, 120, 60), { layer: 'floor' })
    for (let y = 0; y < out.height; y++) {
      const { start, end } = dalibSpan(y, 1)
      for (let x = start; x < end; x++) {
        const [r, g, b, a] = px(out, x, y)
        expect(a).toBe(255)
        expect(r + g + b).toBeGreaterThan(0)
      }
    }
  })

  it('an already-iso source with transparent corners still fills the diamond', () => {
    // Mimics an authored diamond: opaque inside DALib's span, clear outside.
    const src = solidSource(GROUND_TILE_WIDTH, GROUND_TILE_HEIGHT, 200, 40, 40, 0)
    for (let y = 0; y < GROUND_TILE_HEIGHT; y++) {
      const { start, end } = dalibSpan(y, 1)
      for (let x = start; x < end; x++) src.data[(y * GROUND_TILE_WIDTH + x) * 4 + 3] = 255
    }
    const out = resampleTile(src, { layer: 'floor' })
    const r = alphaReport(out, 1)
    expect(r.partial).toBe(0)
    expect(r.inDiamondNotOpaque).toBe(0)
    expect(r.opaque).toBe(784)
  })

  it('walls keep their antialiased slant (floors-only change)', () => {
    // convertOrthoTile adds the iso slant, so the out-of-face corners are
    // transparent and the slant edge antialiases. That is correct for walls:
    // they composite over whatever is behind them, unlike floors.
    const out = convertOrthoTile(solidSource(28, 28, 10, 200, 10), {
      layer: 'wall',
      wallHeight: 28
    })
    expect(out.width).toBe(ISO_HTILE_W)
    let partial = 0
    for (let i = 3; i < out.data.length; i += 4) {
      if (out.data[i] > 0 && out.data[i] < 255) partial++
    }
    expect(partial).toBeGreaterThan(0)
  })
})
