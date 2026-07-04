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
 * Floor tile shape. Ground truth (DALib `RenderTile` decodes palette index 0 as
 * transparent; 38,660 extracted legacy ground tiles are diamonds with corner
 * alpha ≈ 7/255; Brigid's `TabMapRenderer` stencils on "diamond-shaped pixels"):
 * legacy floors are 56×27 **diamonds with transparent corners**, and the body
 * can carry translucency (water etc.).
 *
 *  - 'diamond' (default): mask the four corner triangles transparent and keep the
 *    source's own alpha inside the diamond — matches legacy.
 *  - 'square'          : fill the whole 56×27 opaque, wrap/clamp the corners (the
 *    Brigid authoring-guide "fully opaque, edge-to-edge" ideal — for sources that
 *    are meant to tile as solid squares).
 */
export type FloorShape = 'diamond' | 'square'

/**
 * A wall tile's intrinsic angled orientation. Every static tile is a LEFT- or
 * RIGHT-angled face — a wall is half a floor's width (28 vs 56) and sits on one
 * diagonal edge of the iso diamond, so its roofline slopes one way or the other.
 * There is no "flat/none" wall: a tile that *looks* orthogonal is still a
 * left- or right-angled half-tile face.
 *
 * This is a property of the ART, not of placement. A LEFT-angled tile can be
 * placed on the right half of a map cell (the LeftForeground/RightForeground
 * slot the map author chooses is independent of the tile's angle) — so 'left'
 * here means "the art's roofline rises toward the right / transparent triangle
 * top-left", not "goes on the left".
 *
 * Ground-truth check (19,430 extracted legacy HPF walls, 2026-07): real walls
 * are exactly 28 wide with heights that are multiples of 14 (ISO_VTILE_STEP).
 * Of full-face walls, ~43% have a clean iso-slope top of |0.5| (14px across the
 * 28px width), split almost perfectly 50/50 between the two angles — confirming
 * the two intrinsic left/right faces. The rest is detailed hand-drawn art.
 */
export type WallFace = 'left' | 'right'

export interface ConvertOptions {
  layer: TileLayer
  /** Output scale; default 1. */
  scale?: TileScale
  /** Floor tile shape; default 'diamond'. Ignored for walls. */
  floorShape?: FloorShape
  /** Floor corner fill mode for the 'square' shape; default 'wrap'. Ignored otherwise. */
  corner?: CornerMode
  /** Sub-samples per axis per destination pixel; default 4 (→ 16 samples/px). */
  supersample?: number
  /**
   * Wall output height in 1× pixels (the whole tile, multiple of 14 to match a
   * legacy replacement). Defaults to the source height. Ignored for floors.
   */
  wallHeight?: number
  /** The wall's intrinsic angled face; default 'left'. Ignored for floors. */
  wallFace?: WallFace
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
    ? convertWall(src, scale, ss, opts.wallHeight ?? src.height, opts.wallFace ?? 'left')
    : convertFloor(src, scale, ss, opts.floorShape ?? 'diamond', opts.corner ?? 'wrap')
}

/**
 * Normalize an ALREADY-isometric source (a diamond/face the author drew in iso
 * projection) to the DA target footprint with a plain area-averaged resize — no
 * ortho→iso reprojection. Use this instead of convertOrthoTile when orientation
 * detection (or the author) says the source is already isometric.
 *
 * Floor → (56×27)·scale; a 'square' floor is forced opaque, a 'diamond' floor
 * (default) masks the corner triangles transparent and keeps source alpha (an
 * already-iso floor source is itself a diamond, so this just preserves it). Wall
 * → (28·scale) wide × (wallHeight·scale) tall, source alpha preserved (no iso
 * slant is added — the source already encodes its own top shape).
 */
export function resampleTile(src: PixelBuffer, opts: ConvertOptions): PixelBuffer {
  const scale: TileScale = opts.scale ?? 1
  if (scale !== 1 && scale !== 2) {
    throw new Error(`resampleTile: scale must be 1 or 2, got ${scale}`)
  }
  const ss = Math.max(1, Math.floor(opts.supersample ?? 4))
  const isFloor = opts.layer !== 'wall'
  const opaqueSquare = isFloor && (opts.floorShape ?? 'diamond') === 'square'
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
          // For a 'diamond' floor, drop sub-samples outside the inscribed diamond
          // (per-sample so the diamond edge antialiases).
          if (isFloor && !opaqueSquare && Math.abs(u - 0.5) * 2 + Math.abs(v - 0.5) * 2 > 1) {
            continue
          }
          const [sr, sg, sb, sa] = sampleSource(src, u, v, 'clamp')
          if (opaqueSquare) {
            // straight colour average, alpha forced later
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
      if (opaqueSquare) {
        data[o] = r * inv
        data[o + 1] = g * inv
        data[o + 2] = b * inv
        data[o + 3] = 255 // square floors are fully opaque
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
 * u,v ∈ [0,1] is exactly the diamond interior; outside that range are the four
 * corner triangles. For the 'diamond' shape (default, matching legacy) corners
 * are masked transparent and the source's own alpha is kept inside; the diamond
 * edge antialiases via supersampling. For 'square' the corners are filled per
 * the `corner` addressing mode and the whole tile is forced opaque.
 */
function convertFloor(
  src: PixelBuffer,
  scale: TileScale,
  ss: number,
  shape: FloorShape,
  corner: CornerMode
): PixelBuffer {
  const outW = GROUND_TILE_WIDTH * scale
  const outH = GROUND_TILE_HEIGHT * scale
  const halfW = outW / 2
  const halfH = outH / 2
  const data = new Uint8ClampedArray(outW * outH * 4)
  const inv = 1 / (ss * ss)
  const diamond = shape === 'diamond'

  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sj = 0; sj < ss; sj++) {
        const fy = dy + (sj + 0.5) / ss
        const Y = fy / halfH
        for (let si = 0; si < ss; si++) {
          const fx = dx + (si + 0.5) / ss
          const X = fx / halfW - 1
          const u = (Y + X) / 2
          const v = (Y - X) / 2
          if (diamond) {
            // Corners (u or v outside [0,1]) stay transparent; inside keeps the
            // source's own alpha. Premultiplied so the edge AAs cleanly.
            if (u >= 0 && u < 1 && v >= 0 && v < 1) {
              const [sr, sg, sb, sa] = sampleSource(src, u, v, 'clamp')
              r += sr * sa
              g += sg * sa
              b += sb * sa
              a += sa
            }
          } else {
            // Opaque square: corners resolved by the addressing mode.
            const [sr, sg, sb] = sampleSource(src, u, v, corner)
            r += sr
            g += sg
            b += sb
          }
        }
      }
      const o = (dy * outW + dx) * 4
      if (!diamond) {
        data[o] = r * inv
        data[o + 1] = g * inv
        data[o + 2] = b * inv
        data[o + 3] = 255 // square floors are fully opaque
      } else if (a > 0) {
        data[o] = r / a // un-premultiply
        data[o + 1] = g / a
        data[o + 2] = b / a
        data[o + 3] = a * inv // AA'd diamond edge; corners → 0
      }
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
 * below/behind. Every wall is a left- or right-angled face (see WallFace).
 *
 *   slant   = ISO_VTILE_STEP·scale
 *   contentH= outH − slant                  (the source's sheared vertical span)
 *   u       = fx / outW                      (0..1 across the 28-wide face)
 *   yTop    = slant·(1−u) ['left'] | slant·u ['right']
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
  face: WallFace
): PixelBuffer {
  const outW = ISO_HTILE_W * scale
  const outH = Math.max(1, Math.round(wallHeight)) * scale
  const slant = ISO_VTILE_STEP * scale
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
        const yTop = face === 'left' ? slant * (1 - u) : slant * u
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
