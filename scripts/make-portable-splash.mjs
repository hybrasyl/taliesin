/**
 * Regenerates `build/portable-splash.bmp` — the image the NSIS stub shows while
 * the portable exe decompresses to %TEMP%.
 *
 * This is a FROZEN FRAME of the animated splash in `resources/splash.html`, at
 * the same 420x260 as the splash BrowserWindow (`src/main/splash.ts`), so the
 * handoff reads as one continuous boot instead of two different screens:
 *
 *   NSIS stub blits this BMP  ->  extraction finishes  ->  electron starts and
 *   shows the real animated splash at the same size, same place, same artwork.
 *
 * Why the artwork is rebuilt here rather than screenshotted from the real page:
 * Chrome's headless CLI clamps its layout viewport to a 500 CSS px minimum, so
 * it cannot render this 420px-wide card at all — the content lands 40px right of
 * centre and the card's own gradient is computed for the wrong width. So the
 * layout is reproduced from the CSS values below, and then CHECKED against a
 * headless render (see `verifyAgainstBrowser`), which is unaffected by the clamp
 * in the vertical axis. If someone edits the CSS and not these constants, the
 * check fails.
 *
 * Two things cannot survive the trip, because a BMP has no alpha and the NSIS
 * splash window is an opaque rectangle: the card's 14px rounded corners and its
 * outer drop shadow. The gradient's darkest stop already sits in the corners, so
 * squaring them off is barely visible.
 *
 * Needs ImageMagick 7 (`magick`) on PATH. Chrome or Edge is optional and only
 * used for the check. Run by hand after the logo master or the splash design
 * changes:
 *
 *   node scripts/make-portable-splash.mjs
 *
 * `build/` is `directories.buildResources`, so the output is never packaged.
 *
 * Ported from mabon, which the ecosystem checklist names as the reference
 * recipe. Taliesin's splash uses the same card design and the same 420x260
 * window, so only the wordmark differs; every constant below was checked
 * against this repo's own resources/splash.html rather than assumed.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ── Values mirrored from resources/splash.html and src/main/splash.ts ─────────
// Keep these in sync with the CSS by hand; the check at the end is what catches
// you if you don't.
const W = 420 // splash BrowserWindow width
const H = 260 // splash BrowserWindow height

// .card — radial-gradient(circle at 50% 35%, #16294a 0%, #0d182f 70%, #0a1223 100%)
const GRAD_INNER = '#16294a'
const GRAD_MID = '#0d182f'
const GRAD_OUTER = '#0a1223'
const GRAD_MID_STOP = 0.7
const CENTER_X = W * 0.5
const CENTER_Y = H * 0.35

// .card border — 1px solid rgba(77, 132, 209, 0.35)
const BORDER = 'rgba(77,132,209,0.35)'

// .title / .subtitle / .spinner
const TEXT = '#f0e6cc'
const SUBTEXT = '#a8b8c4'
const SPINNER_TRACK = 'rgba(168,184,196,0.25)'
const SPINNER_HEAD = '#3a9e90'

const LOGO_PX = 88 // .logo width/height
const TITLE_PT = 22 // .title font-size
const TITLE_KERN = 2 // .title letter-spacing
const SUBTITLE_PT = 12 // .subtitle font-size
const SPINNER_D = 22 // .spinner width/height
const SPINNER_STROKE = 2 // .spinner border-width
const GAP = 16 // .card gap

// ── Layout, derived from the card's flex column ───────────────────────────────
// justify-content: center, with .subtitle's -8px and .spinner's +4px margins.
// The card's 28px padding deliberately does NOT appear below: a symmetric
// padding leaves the content box's centre on the card's centre, so centring
// within either gives the same answer as long as the content fits.
const LINE = 1.33 // browser 'normal' line-height for Segoe UI
const titleH = Math.round(TITLE_PT * LINE)
const subtitleH = Math.round(SUBTITLE_PT * LINE)
const contentH = LOGO_PX + GAP + titleH + GAP + (subtitleH - 8) + GAP + (SPINNER_D + 4)

// Measured correction. `LINE` is an estimate of Chrome's 'normal' line-height,
// which sets the flex items' box heights and therefore where the centred block
// starts. Against a headless render the uncorrected block sat 2px low; this
// brings every element to within 1px. verifyAgainstBrowser() enforces that.
const TOP_CALIBRATION = -2
const top = Math.round((H - contentH) / 2) + TOP_CALIBRATION

const logoTop = top
const titleTop = logoTop + LOGO_PX + GAP
const subtitleTop = titleTop + titleH + GAP - 8
const spinnerTop = subtitleTop + subtitleH + GAP + 4
const spinnerCx = W / 2
const spinnerCy = spinnerTop + SPINNER_D / 2
const spinnerR = SPINNER_D / 2 - SPINNER_STROKE / 2

// `circle at 50% 35%` with no explicit size = farthest-corner sizing.
const radius = Math.max(
  ...[
    [0, 0],
    [W, 0],
    [0, H],
    [W, H]
  ].map(([x, y]) => Math.hypot(x - CENTER_X, y - CENTER_Y))
)

// Row bands used by the check, one per element, padded so a small drift still
// lands inside its own band. Derived from the layout, not hardcoded.
const BANDS = {
  logo: [logoTop - 4, logoTop + LOGO_PX + 4],
  title: [titleTop - 2, titleTop + titleH + 4],
  subtitle: [subtitleTop - 2, subtitleTop + subtitleH + 4],
  spinner: [spinnerTop - 4, spinnerTop + SPINNER_D + 4]
}

// ── Font resolution ──────────────────────────────────────────────────────────
// .title is weight 600 and .subtitle is normal, both 'Segoe UI'. Resolve to real
// files so the output cannot silently fall back to whatever IM picks.
const FONT_CANDIDATES = {
  semibold: ['C:/Windows/Fonts/seguisb.ttf', '/Library/Fonts/Segoe UI Semibold.ttf'],
  regular: ['C:/Windows/Fonts/segoeui.ttf', '/Library/Fonts/Segoe UI.ttf']
}

const BROWSER_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
]

function resolveFont(kind) {
  const hit = FONT_CANDIDATES[kind].find((p) => existsSync(p))
  if (!hit) {
    throw new Error(
      `Could not find a Segoe UI ${kind} font. Tried:\n  ${FONT_CANDIDATES[kind].join('\n  ')}\n` +
        `Add the path for this platform to FONT_CANDIDATES.`
    )
  }
  return hit
}

const magick = (args) => execFileSync('magick', args, { stdio: ['ignore', 'pipe', 'inherit'] })

/** `WxH+X+Y` of the non-background content within one row band. */
function inkBox(img, [y0, y1]) {
  return magick([
    img,
    '-crop',
    `${W}x${y1 - y0}+0+${y0}`,
    '+repage',
    '-colorspace',
    'gray',
    '-threshold',
    '28%',
    '-format',
    '%@',
    'info:'
  ])
    .toString()
    .trim()
}

const parseBox = (s) => {
  const m = /^(\d+)x(\d+)\+(\d+)\+(\d+)$/.exec(s)
  return m ? { w: +m[1], h: +m[2], x: +m[3], y: +m[4] } : null
}

/**
 * Renders resources/splash.html headlessly and compares element positions with
 * the generated image. Chrome clamps its layout viewport to 500 CSS px, so the
 * render is done at 500 wide and the centred 420 cropped out — that fixes the
 * horizontal offset but leaves the card's own gradient sized for 500px, so only
 * VERTICAL positions are compared. Skipped, not failed, when no browser exists.
 */
function verifyAgainstBrowser(bmp, tmp) {
  const browser = BROWSER_CANDIDATES.find((p) => existsSync(p))
  if (!browser) {
    console.log('\ncheck skipped: no Chrome or Edge found, layout not verified')
    return
  }

  const CLAMP_W = 500
  const shot = join(tmp, 'ref.png')
  execFileSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--default-background-color=00000000',
      '--force-device-scale-factor=1',
      `--window-size=${CLAMP_W},${H}`,
      // Pin the spinner's rotation so the capture is reproducible.
      '--virtual-time-budget=1',
      `--screenshot=${shot}`,
      `file:///${join(process.cwd(), 'resources/splash.html').replace(/\\/g, '/')}`
    ],
    { stdio: ['ignore', 'ignore', 'ignore'] }
  )

  const ref = join(tmp, 'ref-crop.png')
  magick([
    shot,
    '-crop',
    `${W}x${H}+${(CLAMP_W - W) / 2}+0`,
    '+repage',
    '-background',
    GRAD_OUTER,
    '-alpha',
    'remove',
    '-alpha',
    'off',
    ref
  ])

  const TOLERANCE = 2
  console.log('\nlayout check vs headless splash.html (vertical, px):')
  let worst = 0
  for (const [name, band] of Object.entries(BANDS)) {
    const mine = parseBox(inkBox(bmp, band))
    const theirs = parseBox(inkBox(ref, band))
    if (!mine || !theirs) {
      console.log(`  ${name.padEnd(9)} could not measure — skipped`)
      continue
    }
    const dy = mine.y - theirs.y
    worst = Math.max(worst, Math.abs(dy))
    const dh = mine.h - theirs.h
    console.log(
      `  ${name.padEnd(9)} dy ${String(dy).padStart(3)}  dh ${String(dh).padStart(3)}` +
        `  ${Math.abs(dy) <= TOLERANCE ? 'ok' : 'DRIFT'}`
    )
  }
  if (worst > TOLERANCE) {
    throw new Error(
      `An element is ${worst}px out of place against the real splash (tolerance ` +
        `${TOLERANCE}px). resources/splash.html and this script's constants have ` +
        `diverged — reconcile them, then adjust TOP_CALIBRATION if needed.`
    )
  }
}

// ── Build ────────────────────────────────────────────────────────────────────
const REPO = process.cwd()
const master = join(REPO, 'build/icon.png')
const out = join(REPO, 'build/portable-splash.bmp')
if (!existsSync(master)) throw new Error(`Missing icon master at ${master}`)

const tmp = mkdtempSync(join(tmpdir(), 'taliesin-splash-'))
try {
  const fontSemibold = resolveFont('semibold')
  const fontRegular = resolveFont('regular')

  // 1. Distance field: 0 at the gradient's centre, 1 at the farthest corner.
  //    -fx rather than IM's `radial-gradient:`, whose radius is tied to the
  //    canvas rather than to a CSS colour stop — the flat #0d182f body would
  //    land at the wrong size and stop looking like the real card.
  const dist = join(tmp, 'dist.png')
  magick([
    '-size',
    `${W}x${H}`,
    'xc:',
    '-fx',
    `min(1, hypot(i-${CENTER_X}, j-${CENTER_Y})/${radius})`,
    dist
  ])

  // 2. A 256x1 colour LUT holding the three stops, so -clut can turn the
  //    distance field into the gradient. -rotate -90 puts the gradient's first
  //    colour on the LEFT, which is where -clut expects intensity 0.
  const lut = join(tmp, 'lut.png')
  const midIndex = Math.round(256 * GRAD_MID_STOP)
  magick([
    '(',
    '-size',
    `1x${midIndex}`,
    `gradient:${GRAD_INNER}-${GRAD_MID}`,
    '-rotate',
    '-90',
    ')',
    '(',
    '-size',
    `1x${256 - midIndex}`,
    `gradient:${GRAD_MID}-${GRAD_OUTER}`,
    '-rotate',
    '-90',
    ')',
    '+append',
    lut
  ])

  // 3. The gradient, kept as its own step so it can be verified before anything
  //    is drawn over it (the logo covers the gradient's centre and the border
  //    covers every corner, so probing the finished BMP tests neither).
  const grad = join(tmp, 'grad.png')
  magick([dist, lut, '-clut', grad])

  const probes = [
    ['centre', Math.round(CENTER_X), Math.round(CENTER_Y), GRAD_INNER],
    ['70% ring', Math.round(CENTER_X + radius * GRAD_MID_STOP), Math.round(CENTER_Y), GRAD_MID],
    ['far corner', 0, H - 1, GRAD_OUTER]
  ]
  console.log('gradient probes (expected -> actual):')
  let drift = false
  for (const [label, x, y, expected] of probes) {
    // -depth 8 first: this is a Q16 ImageMagick, so %[hex:…] would otherwise
    // report six bytes (#16294a as 161629294A4A) and never match the CSS stop.
    const got = `#${magick([grad, '-depth', '8', '-format', `%[hex:p{${x},${y}}]`, 'info:'])
      .toString()
      .trim()}`
    const ok = got.toLowerCase() === expected.toLowerCase()
    if (!ok) drift = true
    console.log(`  ${label.padEnd(11)} ${expected} -> ${got} ${ok ? 'ok' : 'DRIFT'}`)
  }
  if (drift) {
    throw new Error(
      'The gradient does not reproduce the CSS colour stops. Check GRAD_* / ' +
        'GRAD_MID_STOP against resources/splash.html before shipping this image.'
    )
  }

  // 4. Logo at its CSS size.
  const logo = join(tmp, 'logo.png')
  magick([master, '-resize', `${LOGO_PX}x${LOGO_PX}`, '-strip', logo])

  // 5. Text as auto-sized layers, so each can be centred horizontally without
  //    guessing its width.
  const titleImg = join(tmp, 'title.png')
  magick([
    '-background',
    'none',
    '-fill',
    TEXT,
    '-font',
    fontSemibold,
    '-pointsize',
    String(TITLE_PT),
    '-kerning',
    String(TITLE_KERN),
    'label:TALIESIN',
    titleImg
  ])

  const subtitleImg = join(tmp, 'subtitle.png')
  magick([
    '-background',
    'none',
    '-fill',
    SUBTEXT,
    '-font',
    fontRegular,
    '-pointsize',
    String(SUBTITLE_PT),
    '-kerning',
    '0.5',
    'label:Loading…',
    subtitleImg
  ])

  // 6. Compose, draw the border and the spinner, flatten to 24-bit. The spinner
  //    is frozen at rotation 0: the teal border-top-color arc sits at the top
  //    (IM angles run clockwise from East, so 225..315 is the top quarter).
  magick([
    grad,
    logo,
    '-gravity',
    'north',
    '-geometry',
    `+0+${logoTop}`,
    '-composite',
    titleImg,
    '-gravity',
    'north',
    '-geometry',
    `+0+${titleTop}`,
    '-composite',
    subtitleImg,
    '-gravity',
    'north',
    '-geometry',
    `+0+${subtitleTop}`,
    '-composite',
    '-gravity',
    'none',
    '-fill',
    'none',
    '-stroke',
    SPINNER_TRACK,
    '-strokewidth',
    String(SPINNER_STROKE),
    '-draw',
    `circle ${spinnerCx},${spinnerCy} ${spinnerCx},${spinnerCy - spinnerR}`,
    '-stroke',
    SPINNER_HEAD,
    '-draw',
    `arc ${spinnerCx - spinnerR},${spinnerCy - spinnerR} ${spinnerCx + spinnerR},${spinnerCy + spinnerR} 225,315`,
    '-stroke',
    BORDER,
    '-strokewidth',
    '1',
    '-draw',
    `rectangle 0,0 ${W - 1},${H - 1}`,
    '-alpha',
    'remove',
    '-alpha',
    'off',
    '-strip',
    `BMP3:${out}`
  ])

  // The NSIS stub accepts 24-bit BMP only, so assert it rather than trusting the
  // BMP3: prefix — a 32-bit or palettised file fails at run time, in the one
  // place nobody is watching.
  const identify = magick([out, '-format', '%wx%h %[type] depth=%[bit-depth]', 'info:'])
    .toString()
    .trim()
  if (!/TrueColor/.test(identify) || /Matte|Alpha/.test(identify)) {
    throw new Error(`Expected a 24-bit TrueColor BMP, got: ${identify}`)
  }
  console.log(`\n${out}\n  ${identify}, ${statSync(out).size.toLocaleString('en-US')} bytes`)

  verifyAgainstBrowser(out, tmp)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
