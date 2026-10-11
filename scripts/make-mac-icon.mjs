/**
 * Regenerates `build/icon.icns` — the macOS app icon — from the mac-specific
 * artwork in the document repo's `docs/logos/macros/`.
 *
 * macOS gets its own artwork because its icon conventions are not the Windows
 * or Linux ones: the icon is a rounded square (an Apple squircle, not a
 * circular-cornered rectangle) and the OS does NOT mask it for you. Whatever is
 * in the corners of the file is what appears in the Dock.
 *
 * ## The icon sits on Apple's grid, not full-bleed
 *
 * A macOS icon is an 824x824 body centred on a 1024x1024 canvas, with 100px of
 * transparency on every side (the same proportion at every size). An icon that
 * fills the whole canvas renders about 24% larger than its Dock neighbours, and
 * recent macOS versions put it on a light rounded plate, which reads as a white
 * border (HTOO-550). So every ICNS chunk is the body scaled to the grid. The
 * 1024 master beside it, `build/icon-mac.png`, stays full-bleed: it is the input
 * for the next run, and a gridded master would shrink again each time.
 *
 * ## The source PNG has no alpha channel, and that matters
 *
 * `macros/taliesin.png` is exported as 1254x1254 RGB — colour type 2, no alpha.
 * The squircle's corners are therefore not transparent, they are BLACK, because
 * the export flattened them onto a black background. Handed to electron-builder
 * as-is, the shipped icon is a black square with a rounded navy shape painted
 * inside it — obviously wrong on a light Dock, and wrong against every other
 * app's icon.
 *
 * So the alpha channel is reconstructed here. That is exact rather than a
 * guess, because the file is precisely the icon composited over black:
 *
 *   stored_pixel = icon_colour * coverage        (coverage = the alpha we want)
 *
 * Outside the squircle the stored pixel is (0,0,0); on the boundary it is a
 * blend of black and the body navy; inside it is the artwork. The body navy is
 * a known constant, so the blue channel — which has the largest magnitude of
 * the three and therefore the best signal — recovers coverage directly:
 *
 *   coverage = min(1, stored_blue / NAVY_BLUE)
 *
 * The gold artwork has a much higher blue value than the navy, so it clamps to
 * fully opaque, which is correct: the gold is nowhere near the boundary.
 *
 * A geometric mask was tried first and rejected. Measuring the corner curve
 * against a circular arc of the same radius (193px at this size) shows the real
 * curve sitting ~10px outside it at every sampled angle — it is a superellipse,
 * so a `roundRectangle` mask would have shaved real artwork off all four
 * corners. Recovering the alpha from the pixels sidesteps the curve entirely and
 * cannot disagree with the artwork.
 *
 * ## Why the colour is flattened onto navy first
 *
 * The recovered coverage pairs with PREMULTIPLIED colour (the stored pixel is
 * already colour x coverage). Writing that straight into an RGBA PNG gives every
 * boundary pixel a second multiplication when a renderer composites it, i.e. the
 * classic dark fringe. Rather than dividing the colour back out — which is
 * numerically nasty near coverage 0 and leaves garbage in fully transparent
 * pixels — the artwork is composited onto the body navy first:
 *
 *   stored + navy * (1 - coverage) = navy * coverage + navy - navy * coverage = navy
 *
 * Boundary pixels become exactly navy, transparent pixels become navy too, and
 * the interior is untouched. Any bleed from a downscale is then navy against
 * navy, which is invisible.
 *
 * Resizing happens on that flattened image and on the coverage mask
 * independently, which is the correct way to scale this pair.
 *
 * ## ICNS assembly
 *
 * Written here rather than shelled out to `iconutil` (macOS only) or left to
 * electron-builder's PNG conversion (unverifiable from Windows). The container
 * is simple: the magic `icns`, a big-endian total length, then typed chunks of
 * `type` + big-endian length-including-header + a PNG. The type set matches what
 * the previous `build/icon.icns` already used, minus its two raw-ARGB chunks and
 * its `info` plist, neither of which macOS needs to render an icon.
 *
 * Needs ImageMagick 7 (`magick`) on PATH. Run by hand after the artwork changes:
 *
 *   node scripts/make-mac-icon.mjs [path-to-source.png]
 *
 * `build/` is `directories.buildResources`, so the output is never packaged into
 * the asar — electron-builder reads it at build time only.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

/** The mac-specific master in the document repo. Override with argv[2]. */
const DEFAULT_SOURCE = resolve(repoRoot, '../Comhaigne/docs/logos/macros/taliesin.png')

/**
 * The squircle's body colour, and the constant the alpha recovery divides by.
 * Sampled from the middle of the artwork and from the edge midpoints, which
 * agree to within one unit: srgb(3,15,38).
 */
const NAVY = 'srgb(3,15,38)'
const NAVY_BLUE = 38

/** Apple's grid: the body's share of the canvas (824 of 1024), at every size. */
const BODY_RATIO = 824 / 1024

/**
 * ICNS chunk types, each holding a PNG at the given pixel size. `ic13`/`ic08`
 * and `ic14`/`ic09` are deliberately the same image under two types: the pairs
 * are the @2x and @1x entries for different logical sizes, which is what the
 * previous icns did too.
 */
const ICNS_ENTRIES = [
  ['ic11', 32],
  ['ic12', 64],
  ['ic07', 128],
  ['ic13', 256],
  ['ic08', 256],
  ['ic14', 512],
  ['ic09', 512],
  ['ic10', 1024]
]

const magick = (args) => execFileSync('magick', args, { stdio: ['ignore', 'pipe', 'inherit'] })

/** Assemble PNG buffers into an ICNS container. */
function buildIcns(chunks) {
  const body = []
  for (const [type, png] of chunks) {
    const header = Buffer.alloc(8)
    header.write(type, 0, 4, 'ascii')
    header.writeUInt32BE(png.length + 8, 4)
    body.push(header, png)
  }
  const payload = Buffer.concat(body)
  const head = Buffer.alloc(8)
  head.write('icns', 0, 4, 'ascii')
  head.writeUInt32BE(payload.length + 8, 4)
  return Buffer.concat([head, payload])
}

/** Re-read the container we just wrote and prove every chunk is a valid PNG. */
function verifyIcns(file) {
  const buf = readFileSync(file)
  if (buf.subarray(0, 4).toString() !== 'icns') throw new Error('bad magic')
  if (buf.readUInt32BE(4) !== buf.length) {
    throw new Error(`declared length ${buf.readUInt32BE(4)} != actual ${buf.length}`)
  }
  let offset = 8
  const seen = []
  while (offset + 8 <= buf.length) {
    const type = buf.subarray(offset, offset + 4).toString()
    const length = buf.readUInt32BE(offset + 4)
    if (length < 8 || offset + length > buf.length) throw new Error(`bad chunk length in ${type}`)
    const data = buf.subarray(offset + 8, offset + length)
    if (data.subarray(1, 4).toString() !== 'PNG') throw new Error(`${type} is not a PNG`)
    const width = data.readUInt32BE(16)
    const height = data.readUInt32BE(20)
    const expected = ICNS_ENTRIES.find(([t]) => t === type)?.[1]
    if (width !== expected || height !== expected) {
      throw new Error(`${type} is ${width}x${height}, expected ${expected}`)
    }
    // Colour type 6 is RGBA. An icon without an alpha channel is the whole bug
    // this script exists to prevent, so fail loudly rather than ship it.
    if (data[25] !== 6) throw new Error(`${type} has colour type ${data[25]}, expected 6 (RGBA)`)
    seen.push(`${type}:${width}`)
    offset += length
  }
  return seen
}

function main() {
  const source = resolve(process.argv[2] ?? DEFAULT_SOURCE)
  if (!existsSync(source)) {
    console.error(`Source artwork not found: ${source}`)
    process.exit(1)
  }

  const tmp = mkdtempSync(join(tmpdir(), 'taliesin-macicon-'))
  try {
    const size = magick([source, '-format', '%wx%h', 'info:']).toString().trim()
    const hasAlpha = magick([source, '-format', '%A', 'info:']).toString().trim() !== 'Undefined'
    console.log(`source ${source} (${size}, alpha ${hasAlpha ? 'present' : 'absent'})`)

    const mask = join(tmp, 'mask.png')
    const flat = join(tmp, 'flat.png')

    if (hasAlpha) {
      // Already an RGBA master, which build/icon-mac.png is. Take its channels
      // as they stand: running the recovery below on it would read the flattened
      // navy underneath the transparent corners and return an opaque square.
      magick([source, '-alpha', 'extract', mask])
      magick([source, '-alpha', 'off', flat])
    } else {
      // 1. Coverage mask: the blue channel, stretched so the body navy reaches
      //    full white. Anything brighter than the navy clamps, which is what we
      //    want for the gold.
      const white = `${((NAVY_BLUE / 255) * 100).toFixed(4)}%`
      magick([
        source,
        '-alpha',
        'off',
        '-channel',
        'B',
        '-separate',
        '+channel',
        '-level',
        `0%,${white}`,
        mask
      ])

      // 2. Flatten the artwork onto the navy so no premultiplication survives.
      const fill = join(tmp, 'fill.png')
      magick([
        '-size',
        size,
        `xc:${NAVY}`,
        '(',
        mask,
        '-negate',
        ')',
        '-compose',
        'Multiply',
        '-composite',
        fill
      ])
      magick([source, '-alpha', 'off', fill, '-compose', 'Plus', '-composite', flat])
    }

    // 3. Scale the colour and the coverage independently, then recombine. A
    //    chunk puts the body on the grid (`body` < `canvas`); the master does not.
    const render = (canvas, body, out) => {
      const rgb = join(tmp, `rgb-${canvas}-${body}.png`)
      const alpha = join(tmp, `a-${canvas}-${body}.png`)
      magick([flat, '-filter', 'Lanczos', '-resize', `${body}x${body}!`, rgb])
      magick([mask, '-filter', 'Lanczos', '-resize', `${body}x${body}!`, alpha])
      magick([
        '(',
        rgb,
        '-channel',
        'R',
        '-separate',
        '+channel',
        ')',
        '(',
        rgb,
        '-channel',
        'G',
        '-separate',
        '+channel',
        ')',
        '(',
        rgb,
        '-channel',
        'B',
        '-separate',
        '+channel',
        ')',
        alpha,
        '-channel',
        'RGBA',
        '-combine',
        '-colorspace',
        'sRGB',
        '-background',
        'none',
        '-gravity',
        'center',
        '-extent',
        `${canvas}x${canvas}`,
        '-strip',
        `PNG32:${out}`
      ])
      return readFileSync(out)
    }

    const chunks = []
    for (const [type, px] of ICNS_ENTRIES) {
      const body = Math.round(px * BODY_RATIO)
      chunks.push([type, render(px, body, join(tmp, `${type}-${px}.png`))])
    }

    // 4. Check the 1024 chunk before anyone ships it: transparent corners, an
    //    opaque body, and ink exactly in the grid box.
    const check = join(tmp, 'check-1024.png')
    writeFileSync(check, chunks.find(([type]) => type === 'ic10')[1])
    const inset = (1024 - Math.round(1024 * BODY_RATIO)) / 2
    const body1024 = 1024 - 2 * inset
    const inkBox = magick([check, '-format', '%@', 'info:']).toString().trim()
    const alphaAt = (x, y) =>
      // -alpha extract first: this ImageMagick reads `p{}.a` as the red channel.
      magick([check, '-alpha', 'extract', '-format', `%[fx:round(255*p{${x},${y}})]`, 'info:'])
        .toString()
        .trim()
    const checks = [
      ['body on the grid', inkBox, `${body1024}x${body1024}+${inset}+${inset}`],
      ['corner alpha', alphaAt(0, 0), '0'],
      ['body alpha', alphaAt(512, 512), '255']
    ]
    for (const [label, actual, expected] of checks) {
      console.log(`  ${label.padEnd(16)} ${expected} -> ${actual}`)
      if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`)
    }

    const icns = join(repoRoot, 'build', 'icon.icns')
    writeFileSync(icns, buildIcns(chunks))
    const seen = verifyIcns(icns)
    console.log(`wrote ${icns}`)
    console.log(`verified ${seen.length} chunks: ${seen.join(' ')}`)

    // Keep the 1024 RGBA master beside it, full-bleed: it is what a future
    // conversion should start from, and it is the only place the recovered alpha
    // is stored.
    const master = join(repoRoot, 'build', 'icon-mac.png')
    writeFileSync(master, render(1024, 1024, join(tmp, 'master-1024.png')))
    console.log(`wrote ${master}`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

main()
