/**
 * Regenerates `build/icons/` — the Linux hicolor icon set — from the shared
 * macOS/Linux master in the document repo, `docs/logos/macros/taliesin_fixed.png`.
 *
 * Sibling of `make-mac-icon.mjs`, and deliberately much simpler: that script
 * exists because the mac artwork needed its alpha channel reconstructed. This
 * one only resizes, because the `_fixed` variant already carries real alpha.
 *
 * Run by hand after the artwork changes, and COMMIT the output:
 *
 *   node scripts/make-linux-icons.mjs [path-to-source.png]
 *
 * `build/` is `directories.buildResources`, so nothing here is packaged into the
 * asar — electron-builder reads it at build time only. Committing the PNGs is
 * what keeps ImageMagick off CI, exactly as `build/icon.icns` already does.
 *
 * ## Why a directory of eight files rather than one PNG
 *
 * electron-builder resolves the Linux icon as `[linux.icon, mac.icon ?? icon]`
 * (`app-builder-lib/out/targets/LinuxTargetHelper.js`), so `mac.icon` OUTRANKS
 * the top-level `icon`. Taliesin sets `mac.icon`, so leaving `linux.icon` unset
 * shipped the macOS artwork on Linux — measured in `taliesin_2.9.0_amd64.deb`.
 *
 * And a single PNG is never resampled (`iconConverter.js`, `doConvertIcon`):
 * one PNG in, one hicolor entry out, at whatever size that file happens to be.
 * `hicolor`'s `index.theme` enumerates sizes up to 512, so pointing `linux.icon`
 * at the 1024 master would produce a `1024x1024` directory that no desktop
 * environment indexes — a blank document icon.
 *
 * That combination is why the naive fix makes this repo WORSE. Taliesin is one
 * of only two apps that currently ship a full eight-size set, because the
 * `.icns` fallback happens to contain one. It renders the wrong picture at the
 * right sizes; repointing `linux.icon` at a raster master without generating a
 * set first would take it to a blank page. Generate, then repoint.
 *
 * ## Why this master and not `build/icon.png`
 *
 * **`build/icon.png` is the WINDOWS artwork.** The macros tile is the macOS and
 * Linux one — the same artwork the mac icon descends from — so Linux takes it
 * here and the two platforms that share an icon convention share a master.
 * Pointing this at `build/icon.png` produces a plausible, verifiable, wrong
 * icon: it passes every check below and still ships the Windows art to Linux.
 *
 * Measured on the master, 2026-08-10: 1254x1254, alpha bbox `1254x1254+0+0`,
 * and an 8x8 alpha grid reading 255 across the whole interior and all four
 * mid-edges with only the corner cells softened — a full-bleed ROUNDED SQUARE,
 * which is the shape a desktop environment wants.
 *
 * **Nothing is cropped, and that is the point.** Oghma's generator crops
 * Apple's 100px inset off its mac tile, because that tile is inset. This master
 * is not: it is full-bleed already, so the inset is something `make-mac-icon.mjs`
 * would ADD for macOS rather than something Linux has to undo. Balor reached the
 * same arrangement after finding it had added a 100px transparent margin in one
 * command and removed it in the next. A crop step that is never needed is a trap
 * for whoever edits this next.
 *
 * Take the `_fixed` variant, never plain `taliesin.png`. The pair exists because
 * the plain one is exported without alpha — its corners are BLACK, not
 * transparent. `make-mac-icon.mjs` reconstructs the channel from the pixels;
 * this script does not, and does not need to, but it would happily resize a
 * black-cornered square if handed one. The alpha check below is what stops it.
 *
 * The master lives in the sibling document repo, exactly as
 * `make-mac-icon.mjs`'s source does. That is a dev-machine dependency only: the
 * eight PNGs are committed, so a build — and CI — never reaches for it.
 *
 * ## The invariant is full-bleed, and it is checked on the OUTPUT
 *
 * The rule HTOO-38 protects is that every written size reaches the edge of its
 * canvas, so the icon draws at the same weight as its neighbours. An inset
 * source draws ~12% small at every size and passes a size check — the subtler
 * half of that defect. So this verifies what it wrote rather than its arguments.
 *
 * The master's alpha already reaches all four edges, so no trim is applied and
 * its aspect ratio is untouched. The check below is what makes that durable
 * rather than a comment: a future master with a real inset fails here instead
 * of shipping, and so does one that lost its transparency.
 *
 * ## Reading alpha correctly
 *
 * `%[channels]` does NOT answer "does this have transparency": it reports
 * `srgba` for a fully opaque PNG32, which is exactly what an image editor
 * produces when it flattens on export. `%@` on the image does not answer it
 * either — that is a TRIM box, which trims on any uniform border colour, so a
 * flattened black-cornered copy trims identically to a correct one.
 *
 * `-alpha extract` is what separates them, and `%@` is only meaningful on ITS
 * output, where black means fully transparent and the trim box really is the
 * alpha bounding box. Both forms are used below, each on the right operand.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

/**
 * The shared macOS/Linux master in the document repo. Override with argv[2].
 *
 * NOT `build/icon.png` — that is the Windows artwork, and using it here ships a
 * plausible wrong icon that passes every check in this file.
 */
const DEFAULT_SOURCE = resolve(repoRoot, '../Comhaigne/docs/logos/macros/taliesin_fixed.png')

/**
 * hicolor's standard set. `collectIconsFromDir` accepts `NxN.png` or `N.png`;
 * the `NxN` form matches the installed `hicolor/<size>/apps/` layout and is what
 * every sibling that has done this uses.
 */
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512]

const magick = (args) => execFileSync('magick', args, { stdio: ['ignore', 'pipe', 'inherit'] })
const probe = (args) => magick(args).toString().trim()

/** Levels > 1 with a minimum of 0 means real transparency, not just a channel. */
function assertRealAlpha(file, label) {
  const [levels, minima] = probe([file, '-alpha', 'extract', '-format', '%k %[fx:minima]', 'info:'])
    .split(/\s+/)
    .map(Number)
  if (!(levels > 1 && minima === 0)) {
    throw new Error(
      `${label} has no real transparency (levels=${levels}, minima=${minima}). ` +
        'A flattened master passes a %[channels] check and still ships an icon ' +
        'sitting on a visible rectangle of its own background.'
    )
  }
  return levels
}

function main() {
  const source = resolve(process.argv[2] ?? DEFAULT_SOURCE)
  if (!existsSync(source)) {
    console.error(`Source artwork not found: ${source}`)
    process.exit(1)
  }

  const size = probe([source, '-format', '%wx%h', 'info:'])
  const levels = assertRealAlpha(source, 'source')
  const bbox = probe([source, '-alpha', 'extract', '-format', '%@', 'info:'])
  console.log(`source ${source} (${size}, alpha levels ${levels}, alpha bbox ${bbox})`)

  const outDir = join(repoRoot, 'build', 'icons')

  // Generate into a temp directory and only move into place once all eight
  // verify. Writing straight to build/icons/ and checking afterwards leaves a
  // failed run's bad output on disk under the right filenames, where the next
  // `git add` commits it — which is worse than not checking, because the error
  // scrolls past and the files look generated.
  const tmp = mkdtempSync(join(tmpdir(), 'taliesin-linuxicons-'))
  const written = []
  try {
    for (const px of SIZES) {
      const out = join(tmp, `${px}x${px}.png`)
      // `!` forces the exact square. The master is square, so this is a
      // sub-pixel correction rather than a distortion.
      magick([source, '-filter', 'Lanczos', '-resize', `${px}x${px}!`, '-strip', `PNG32:${out}`])
      written.push([px, out])
    }

    const report = verifyAll(written)

    mkdirSync(outDir, { recursive: true })
    for (const [px, file] of written) {
      copyFileSync(file, join(outDir, `${px}x${px}.png`))
    }

    console.log(`wrote ${written.length} icons to ${outDir}`)
    console.log(`verified full-bleed RGBA at every size: ${report.join(' ')}`)
    console.log(
      '\nCommit build/icons/ — .gitignore has `build/*`, so check `git ls-files build/icons`.'
    )
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

/** Verify what was written, not what was asked for. Throws on the first fault. */
function verifyAll(written) {
  const report = []
  for (const [px, file] of written) {
    const buf = readFileSync(file)
    if (buf.subarray(1, 4).toString() !== 'PNG') throw new Error(`${file} is not a PNG`)
    const width = buf.readUInt32BE(16)
    const height = buf.readUInt32BE(20)
    if (width !== px || height !== px) {
      throw new Error(`${file} is ${width}x${height}, expected ${px}x${px}`)
    }
    // Colour type 6 is RGBA. An icon that lost its alpha renders on a visible
    // rectangle, which is the failure this whole file is about.
    if (buf[25] !== 6) throw new Error(`${file} has colour type ${buf[25]}, expected 6 (RGBA)`)

    const alphaBox = probe([file, '-alpha', 'extract', '-format', '%@', 'info:'])
    if (alphaBox !== `${px}x${px}+0+0`) {
      throw new Error(
        `${file} is not full-bleed: alpha bbox ${alphaBox}, expected ${px}x${px}+0+0. ` +
          'An inset icon draws small at every size and passes a size check.'
      )
    }
    report.push(`${px}:${buf.length}B`)
  }
  return report
}

main()
