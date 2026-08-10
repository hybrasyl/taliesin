import { readFileSync, readdirSync } from 'fs'
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
