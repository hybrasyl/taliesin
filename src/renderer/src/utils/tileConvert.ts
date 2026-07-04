import { PixelBuffer } from './duotone'
import { GROUND_TILE_WIDTH, GROUND_TILE_HEIGHT, ISO_HTILE_W, ISO_VTILE_STEP } from './mapRenderer'

// ── Orthogonal → isometric tile conversion (Static Tile Manager, Phase 1) ─────
//
// Pure, renderer-side conversion core. No Electron/main, no canvas — operates on
// plain PixelBuffer ({ data, width, height }) so it is trivially unit-testable
// and reusable by both the live preview and the commit path.
//
// Geometry is the DA ground/wall ground-truth (see docs/plans/static-tile-manager.md
// "Background: authoritative DA tile geometry") and is taken from mapRenderer.ts as
// the single source of truth:
//   - Floor  : 56 × 27 diamond, FULLY OPAQUE, filename floor{id:D5}.png.
//   - Wall   : 28 wide × variable height, transparent outside the face.
//   - Base unit: ISO_HTILE_W (28) horizontal, ISO_VTILE_STEP (14) vertical step.
//
// Both projections are implemented as INVERSE MAPPING: for every destination
// pixel we compute the source UV and sample it (no forward-rotation holes, clean
// diagonals, each output pixel a pure function of the source). An N× supersample
// average antialiases the diagonals.

/** Tile layer being produced. */
export type TileLayer = 'floor' | 'wall'

/**
 * Output scale factor. A closed set — the only two virtual resolutions the
 * client renders (640×480 today, an exact 2× rebase planned). 1× ships today.
 */
export type TileScale = 1 | 2

/**
 * How the ortho→iso floor projection fills the out-of-diamond corner triangles.
 * Floors are edge-to-edge and fully opaque, so the corners carry real neighbor
 * content, not alpha:
 *  - 'wrap'  : sample the source in repeat mode — the corners pick up the
 *              opposite edge's content and seamless/tileable sources emit
 *              seam-free tiles by construction (the default).
 *  - 'clamp' : sample the nearest edge pixel — fallback for non-tileable loose
 *              art (the preview should warn about possible seams).
 */
export type CornerMode = 'wrap' | 'clamp'

/**
 * Which iso face a wall's parallelogram top follows. Wall art is keyed by ID,
 * not side (the same PNG is blitted for left/right foreground at different x
 * offsets by the renderer), so this only picks which top corner is the
 * transparent triangle. 'left' matches the top-left diamond edge (top rises to
 * the right); 'right' mirrors it; 'none' imposes no slant (a plain 28×H
 * rectangle fill — for full textures whose art carries its own top shape).
 *
 * Ground-truth check (19,430 extracted legacy HPF walls, 2026-07): real walls
 * are exactly 28 wide with heights that are multiples of 14 (ISO_VTILE_STEP).
 * Of full-face walls, ~43% have a clean iso-slope top of |0.5| (14px across the
 * 28px width), split almost perfectly 50/50 between the two directions — so the
 * ±slant is the canonical clean-wall roofline and the two directions are the
 * left/right faces. The rest is detailed hand-drawn art carrying its own shape.
 */
export type WallSlant = 'left' | 'right' | 'none'

export interface ConvertOptions {
  layer: TileLayer
  /** Output scale; default 1. */
  scale?: TileScale
  /** Floor corner fill mode; default 'wrap'. Ignored for walls. */
  corner?: CornerMode
  /** Sub-samples per axis per destination pixel; default 4 (→ 16 samples/px). */
  supersample?: number
  /**
   * Wall content height in 1× pixels (the projected face height, excluding the
   * iso slant). Defaults to the source height. Ignored for floors.
   */
  wallHeight?: number
  /** Which face the wall top slopes along; default 'left'. Ignored for floors. */
  wallSlant?: WallSlant
}

type Rgba = [number, number, number, number]

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/**
 * Nearest-neighbour source sample at normalized UV with the given addressing
 * mode. Inside the diamond both modes agree (u,v ∈ [0,1]); they diverge only in
 * the corner triangles, which is exactly where the seamless-vs-seam choice lives.
 */
function sampleSource(src: PixelBuffer, u: number, v: number, mode: CornerMode): Rgba {
  let uu: number
  let vv: number
  if (mode === 'wrap') {
    uu = u - Math.floor(u)
    vv = v - Math.floor(v)
  } else {
    uu = clamp01(u)
    vv = clamp01(v)
  }
  let sx = Math.floor(uu * src.width)
  let sy = Math.floor(vv * src.height)
  if (sx >= src.width) sx = src.width - 1
  if (sy >= src.height) sy = src.height - 1
  if (sx < 0) sx = 0
  if (sy < 0) sy = 0
  const i = (sy * src.width + sx) * 4
  return [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]]
}

/**
 * Project an orthogonal (square/axis-aligned) source tile onto the DA isometric
 * geometry for the requested layer and scale.
 *
 * Floor  → a fully opaque {56×27}·scale diamond footprint; the corner triangles
 *          are filled per `corner` (wrap by default) and output alpha is forced
 *          to 255 (floors never carry transparency).
 * Wall   → a {28 wide}·scale vertical face parallelogram of the given height;
 *          the two out-of-face corner triangles are left transparent so the tile
 *          composites over whatever is behind it.
 *
 * The projection is pure: same input → same output, no shared state, no canvas.
 */
export function convertOrthoTile(src: PixelBuffer, opts: ConvertOptions): PixelBuffer {
  const scale: TileScale = opts.scale ?? 1
  if (scale !== 1 && scale !== 2) {
    throw new Error(`convertOrthoTile: scale must be 1 or 2, got ${scale}`)
  }
  const ss = Math.max(1, Math.floor(opts.supersample ?? 4))
  return opts.layer === 'wall'
    ? convertWall(src, scale, ss, opts.wallHeight ?? src.height, opts.wallSlant ?? 'left')
    : convertFloor(src, scale, ss, opts.corner ?? 'wrap')
}

/**
 * Normalize an ALREADY-isometric source (a diamond/face the author drew in iso
 * projection) to the DA target footprint with a plain area-averaged resize — no
 * ortho→iso reprojection. Use this instead of convertOrthoTile when orientation
 * detection (or the author) says the source is already isometric.
 *
 * Floor → (56×27)·scale, forced opaque. Wall → (28·scale) wide × (wallHeight·
 * scale) tall, source alpha preserved (no iso slant is added — the source
 * already encodes its own top shape).
 */
export function resampleTile(src: PixelBuffer, opts: ConvertOptions): PixelBuffer {
  const scale: TileScale = opts.scale ?? 1
  if (scale !== 1 && scale !== 2) {
    throw new Error(`resampleTile: scale must be 1 or 2, got ${scale}`)
  }
  const ss = Math.max(1, Math.floor(opts.supersample ?? 4))
  const isFloor = opts.layer !== 'wall'
  const outW = (isFloor ? GROUND_TILE_WIDTH : ISO_HTILE_W) * scale
  const outH =
    (isFloor ? GROUND_TILE_HEIGHT : Math.max(1, Math.round(opts.wallHeight ?? src.height))) * scale
  const data = new Uint8ClampedArray(outW * outH * 4)
  const inv = 1 / (ss * ss)

  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sj = 0; sj < ss; sj++) {
        const v = (dy + (sj + 0.5) / ss) / outH
        for (let si = 0; si < ss; si++) {
          const u = (dx + (si + 0.5) / ss) / outW
          const [sr, sg, sb, sa] = sampleSource(src, u, v, 'clamp')
          if (isFloor) {
            // opaque output: straight colour average, alpha forced later
            r += sr
            g += sg
            b += sb
          } else {
            // premultiplied so partial-alpha sources average without fringing
            r += sr * sa
            g += sg * sa
            b += sb * sa
            a += sa
          }
        }
      }
      const o = (dy * outW + dx) * 4
      if (isFloor) {
        data[o] = r * inv
        data[o + 1] = g * inv
        data[o + 2] = b * inv
        data[o + 3] = 255 // floors are fully opaque
      } else if (a > 0) {
        data[o] = r / a // un-premultiply
        data[o + 1] = g / a
        data[o + 2] = b / a
        data[o + 3] = a * inv
      }
    }
  }
  return { data, width: outW, height: outH }
}

/**
 * Floor projection. Destination footprint is (56×27)·scale. For each destination
 * pixel we invert the iso diamond mapping to a source UV:
 *
 *   x = (u − v)·(W/2) + W/2      →  X = (fx − W/2)/(W/2) = u − v
 *   y = (u + v)·(H/2)            →  Y =  fy/(H/2)        = u + v
 *   ⇒ u = (Y + X)/2 , v = (Y − X)/2
 *
 * u,v ∈ [0,1] is the diamond interior; outside that range are the four corner
 * triangles, resolved by the `corner` addressing mode. Output is forced opaque.
 */
function convertFloor(
  src: PixelBuffer,
  scale: TileScale,
  ss: number,
  corner: CornerMode
): PixelBuffer {
  const outW = GROUND_TILE_WIDTH * scale
  const outH = GROUND_TILE_HEIGHT * scale
  const halfW = outW / 2
  const halfH = outH / 2
  const data = new Uint8ClampedArray(outW * outH * 4)
  const inv = 1 / (ss * ss)

  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      let r = 0
      let g = 0
      let b = 0
      for (let sj = 0; sj < ss; sj++) {
        const fy = dy + (sj + 0.5) / ss
        const Y = fy / halfH
        for (let si = 0; si < ss; si++) {
          const fx = dx + (si + 0.5) / ss
          const X = fx / halfW - 1
          const u = (Y + X) / 2
          const v = (Y - X) / 2
          const [sr, sg, sb] = sampleSource(src, u, v, corner)
          r += sr
          g += sg
          b += sb
        }
      }
      const o = (dy * outW + dx) * 4
      data[o] = r * inv
      data[o + 1] = g * inv
      data[o + 2] = b * inv
      data[o + 3] = 255 // floors are fully opaque — never mask corners transparent
    }
  }
  return { data, width: outW, height: outH }
}

/**
 * Wall projection. Destination is (28·scale) wide × (wallHeight·scale) tall —
 * the output height EXACTLY equals wallHeight so a replacement tile matches the
 * legacy HPF height (a multiple of 14; too tall floats above the floor, too
 * short leaves a gap). The iso slant (ISO_VTILE_STEP·scale) is carved INSIDE the
 * box, not added to it: the source is sheared vertically into a parallelogram
 * whose top edge follows the iso half-tile slope, and the two triangles outside
 * the parallelogram stay transparent (alpha 0) so the face composites over tiles
 * below/behind. 'none' imposes no slant — a plain 28×H rectangle fill.
 *
 *   slant   = ISO_VTILE_STEP·scale (0 when slantDir==='none')
 *   contentH= outH − slant                  (the source's sheared vertical span)
 *   u       = fx / outW                      (0..1 across the 28-wide face)
 *   yTop    = slant·(1−u) ['left'] | slant·u ['right'] | 0 ['none']
 *   v       = (fy − yTop) / contentH         (0..1 down the face)
 *
 * Inside u,v ∈ [0,1) we sample the source; outside we emit a transparent pixel.
 * Source alpha is preserved (unlike floors), so an already-transparent source
 * top stays transparent. Colour is accumulated premultiplied so partial-alpha
 * sources and the antialiased face edge average without darkening/brightening.
 */
function convertWall(
  src: PixelBuffer,
  scale: TileScale,
  ss: number,
  wallHeight: number,
  slantDir: WallSlant
): PixelBuffer {
  const outW = ISO_HTILE_W * scale
  const outH = Math.max(1, Math.round(wallHeight)) * scale
  const slant = slantDir === 'none' ? 0 : ISO_VTILE_STEP * scale
  const contentH = Math.max(1, outH - slant)
  const data = new Uint8ClampedArray(outW * outH * 4)
  const inv = 1 / (ss * ss)

  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let si = 0; si < ss; si++) {
        const fx = dx + (si + 0.5) / ss
        const u = fx / outW
        const yTop = slantDir === 'left' ? slant * (1 - u) : slantDir === 'right' ? slant * u : 0
        for (let sj = 0; sj < ss; sj++) {
          const fy = dy + (sj + 0.5) / ss
          const v = (fy - yTop) / contentH
          if (u >= 0 && u < 1 && v >= 0 && v < 1) {
            // clamp addressing: a wall face has no wrap-around neighbor
            const [sr, sg, sb, sa] = sampleSource(src, u, v, 'clamp')
            // Premultiplied accumulation: weight colour by alpha so the face edge
            // antialiases against transparency without darkening or brightening.
            r += sr * sa
            g += sg * sa
            b += sb * sa
            a += sa
          }
          // else: sub-sample falls outside the face → contributes transparent (0)
        }
      }
      const o = (dy * outW + dx) * 4
      if (a > 0) {
        data[o] = r / a // un-premultiply
        data[o + 1] = g / a
        data[o + 2] = b / a
        data[o + 3] = a * inv // mean alpha over ALL sub-samples (uncovered = 0)
      } else {
        data[o] = 0
        data[o + 1] = 0
        data[o + 2] = 0
        data[o + 3] = 0
      }
    }
  }
  return { data, width: outW, height: outH }
}
