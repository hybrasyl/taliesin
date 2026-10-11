import { readFileSync, readdirSync } from 'fs'
import { inflateSync } from 'zlib'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

// The Linux icon set is GENERATED but COMMITTED — CI has no ImageMagick, so
// electron-builder packages whatever is in the tree. That makes it exactly the
// kind of artifact that goes stale silently: change the master, forget
// `node scripts/make-linux-icons.mjs`, and the build stays green while the
// package ships the previous artwork at the previous sizes.
//
// This reads PNG headers directly rather than shelling out, so it needs no
// ImageMagick and runs in the ordinary suite. It therefore checks the two
// properties a header carries — geometry and colour type — and NOT the alpha
// bounding box, which needs pixel decoding. `make-linux-icons.mjs` asserts the
// bounding boxes itself at the moment it writes them, which is the right place
// for the check that needs a decoder.
//
// Ported from balor's `scripts/icons.test.mjs` (HTOO-38 / R-008).
const REPO_ROOT = join(import.meta.dirname, '..')
const BUILD = join(REPO_ROOT, 'build')
const ICONS = join(BUILD, 'icons')

/** hicolor's standard set, and the same list `make-linux-icons.mjs` writes. */
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512]
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
// PNG colour type 6 is truecolour WITH alpha. Type 2 is truecolour without, and
// that is the failure this catches: a master flattened onto black renders the
// rounded corners as a solid rectangle at every size, and still reports `srgba`
// to `magick identify -format "%[channels]"`.
const RGBA = 6

function readHeader(path) {
  const buf = readFileSync(path)
  expect(buf.subarray(0, 8), `${path} is not a PNG`).toEqual(PNG_SIGNATURE)
  expect(buf.subarray(12, 16).toString('ascii'), `${path} first chunk`).toBe('IHDR')
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colorType: buf.readUInt8(25)
  }
}

describe('committed Linux icon artifacts', () => {
  it('build/icons/ holds exactly the eight hicolor sizes and nothing else', () => {
    // "Nothing else" matters: `collectIconsFromDir` takes every file matching
    // /^(\d+)(?:x\d+)?\.png$/i, so a stray 1024x1024.png left behind by a hand
    // run would be installed as a hicolor entry outside the theme's index.
    expect(readdirSync(ICONS).sort()).toEqual(SIZES.map((n) => `${n}x${n}.png`).sort())
  })

  it.each(SIZES)('build/icons/%ix%i.png is that size and RGBA', (px) => {
    expect(readHeader(join(ICONS, `${px}x${px}.png`))).toEqual({
      width: px,
      height: px,
      colorType: RGBA
    })
  })

  it('the Windows master is left alone', () => {
    // build/icon.png is the WINDOWS artwork and nothing here derives from it.
    // Pinned so that a future edit pointing linux.icon at it — which would ship
    // a plausible, verifiable, wrong icon — has to change this line too.
    expect(readHeader(join(BUILD, 'icon.png'))).toEqual({
      width: 1024,
      height: 1024,
      colorType: RGBA
    })
  })
})

// The macOS icon sits on Apple's grid: an 824x824 body centred on a 1024x1024
// canvas, 100px of transparency on every side (HTOO-550). A full-bleed icon gets
// a light plate behind it in the Dock, which reads as a white border, and the
// header carries nothing that would catch it. So this one decodes the 1024
// chunk of build/icon.icns: zlib inflates the pixel data, and the per-row PNG
// filters are undone below. The pixel checks the other tests leave to the
// generator are cheap enough here for one image.

/** The PNG of one chunk type in an ICNS container. */
function icnsChunk(file, type) {
  const buf = readFileSync(file)
  for (let offset = 8; offset + 8 <= buf.length; ) {
    const length = buf.readUInt32BE(offset + 4)
    if (buf.subarray(offset, offset + 4).toString('ascii') === type) {
      return buf.subarray(offset + 8, offset + length)
    }
    offset += length
  }
  throw new Error(`${file} has no ${type} chunk`)
}

/** Decode an 8-bit RGBA, non-interlaced PNG to its alpha at (x, y). */
function alphaReader(png) {
  const { width, height, colorType } = {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    colorType: png.readUInt8(25)
  }
  expect([colorType, png.readUInt8(24), png.readUInt8(28)]).toEqual([RGBA, 8, 0])
  const idat = []
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset)
    if (png.subarray(offset + 4, offset + 8).toString('ascii') === 'IDAT') {
      idat.push(png.subarray(offset + 8, offset + 8 + length))
    }
    offset += length + 12
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * 4
  const pixels = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i]
      const a = i >= 4 ? pixels[y * stride + i - 4] : 0
      const b = y > 0 ? pixels[(y - 1) * stride + i] : 0
      const c = i >= 4 && y > 0 ? pixels[(y - 1) * stride + i - 4] : 0
      const p = a + b - c
      const pa = Math.abs(p - a)
      const pb = Math.abs(p - b)
      const pc = Math.abs(p - c)
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      const predictor = [0, a, b, (a + b) >> 1, paeth][filter]
      pixels[y * stride + i] = (x + predictor) & 0xff
    }
  }
  return { width, height, alphaAt: (px, py) => pixels[py * stride + px * 4 + 3] }
}

describe('the macOS icon (build/icon.icns)', () => {
  const { width, height, alphaAt } = alphaReader(icnsChunk(join(BUILD, 'icon.icns'), 'ic10'))

  it('is 1024x1024', () => {
    expect([width, height]).toEqual([1024, 1024])
  })

  it('puts the body on the grid, with 100px of transparency on every side', () => {
    // Transparent: the corner, and the inset on each side, just outside the body.
    for (const [x, y] of [
      [0, 0],
      [512, 95],
      [512, 928],
      [95, 512],
      [928, 512]
    ]) {
      expect(alphaAt(x, y), `alpha at ${x},${y}`).toBe(0)
    }
    // Opaque: the middle, and just inside each edge of the body.
    for (const [x, y] of [
      [512, 512],
      [512, 105],
      [512, 918],
      [105, 512],
      [918, 512]
    ]) {
      expect(alphaAt(x, y), `alpha at ${x},${y}`).toBe(255)
    }
  })
})
