/**
 * Isometric DA map renderer.
 *
 * Ground layer:  seo.dat → TILEA.BMP (56×27 px, 1512 bytes/tile) + mpt palette table/palettes
 * Foreground:    ia.dat  → stcNNNNN.hpf (28px wide, variable height)  + stc palette table/palettes
 *
 * Assets are cached LRU-style by clientPath. Tile bitmap caches live INSIDE
 * MapAssets so they're scoped to a specific client and evicted alongside it.
 */

import { resolveClientFile } from './fsCase'
import {
  DataArchive,
  HpfFile,
  Palette,
  PaletteTable,
  MapFile,
  SotpFile,
  Tile,
  TileAnimationTable,
  renderHpf,
  renderTile
} from '@eriscorp/dalib-ts'
import { toImageData } from '@eriscorp/dalib-ts/helpers/imageData'
import { resolveWithPackOverride, coveredIdSet } from './packOverride'

// ── Constants ─────────────────────────────────────────────────────────────────

export const GROUND_TILE_WIDTH = 56
export const GROUND_TILE_HEIGHT = 27
export const GROUND_TILE_BYTES = GROUND_TILE_WIDTH * GROUND_TILE_HEIGHT // 1512

/** Half tile dimensions used for isometric projection. */
const HTILE_W = GROUND_TILE_WIDTH / 2 // 28

/** Vertical padding above origin to accommodate tall foreground objects. */
const FOREGROUND_PAD = 512

// ── Asset types ───────────────────────────────────────────────────────────────

export interface MapAssets {
  /** Raw pixel bytes from TILEA.BMP, sliced per tile (index 1-based). */
  groundPixels: Uint8Array // full TILEA.BMP, use slice(n*1512, (n+1)*1512) for tile n+1
  groundTileCount: number
  groundPaletteTable: PaletteTable
  groundPalettes: Map<number, Palette>

  iaArchive: DataArchive
  stcPaletteTable: PaletteTable
  stcPalettes: Map<number, Palette>

  /**
   * Parsed sotp.dat. `getCollision(id) === 0` means stc tile `id` is passable;
   * non-zero means impassable. Ids are 1-based — the parser owns that offset,
   * which used to be applied by hand at every call site.
   *
   * Null when sotp.dat is absent from the client directory. A consumer that
   * genuinely needs the raw bytes calls `sotp.toUint8Array()`.
   *
   * This is the SINGLE SOTP source on purpose: pack-carried SOTP overlays here
   * later, and every consumer picks it up without being touched again.
   */
  sotp: SotpFile | null

  /** Ground tile animation table (gndani.tbl from seo.dat). Null if absent. */
  groundAnimationTable: TileAnimationTable | null
  /** Foreground tile animation table (stcani.tbl from ia.dat). Null if absent. */
  stcAnimationTable: TileAnimationTable | null

  /** Rendered ground tile bitmaps, keyed by tile index. Per-asset-set so bitmaps from a previous client can't leak into a new render. */
  groundBitmapCache: Map<number, ImageBitmap>
  /** Rendered stc bitmaps, keyed by tile index. */
  stcBitmapCache: Map<number, ImageBitmap>

  /** Floor tile ids covered by an installed static_tiles pack (snapshot at load). */
  floorCoverage: Set<number>
  /** Wall tile ids covered by an installed static_tiles pack (snapshot at load). */
  wallCoverage: Set<number>
}

// ── LRU helpers ───────────────────────────────────────────────────────────────

/**
 * Insert or refresh `key` in `map` and evict oldest entries until size ≤ limit.
 * Map preserves insertion order, so deleting+re-setting marks the key as MRU.
 */
export function lruTouch<K, V>(map: Map<K, V>, key: K, value: V, limit: number): void {
  if (map.has(key)) map.delete(key)
  map.set(key, value)
  while (map.size > limit) {
    const oldest = map.keys().next().value
    if (oldest === undefined) break
    map.delete(oldest)
  }
}

/** Read `key` and bump it to MRU position. Returns `undefined` if absent. */
export function lruGet<K, V>(map: Map<K, V>, key: K): V | undefined {
  const v = map.get(key)
  if (v === undefined) return undefined
  map.delete(key)
  map.set(key, v)
  return v
}

// ── Module-level cache ────────────────────────────────────────────────────────

/** How many distinct clientPaths we keep loaded at once. */
const ASSET_CACHE_LIMIT = 2

/** Loaded asset sets, keyed by normalised clientPath. LRU bounded. */
const assetCache = new Map<string, MapAssets>()

/** Number of currently cached asset sets (test/debug helper). */
export function _assetCacheSize(): number {
  return assetCache.size
}

/** Drop every cached asset set. Useful in tests and on full app reset. */
export function clearAllCaches(): void {
  assetCache.clear()
}

// ── Asset loading ─────────────────────────────────────────────────────────────

export type ProgressCallback = (msg: string) => void

/**
 * Build the WALL palette table from `stcpal` alone, then bring the cycling
 * definitions across from the numeric `stc###.tbl` files.
 *
 * `PaletteTable.fromArchive` routes each match by whether its name carries a
 * numeric identifier: numeric names become cycling files, non-numeric names are
 * merged as palette mapping tables. The `stc` pattern matches every `stc*.tbl`
 * in ia.dat, and **two** of them are non-numeric — `stcpal.tbl`, the palette
 * map, and `stcani.tbl`, the foreground ANIMATION table.
 *
 * All three formats are `min max value` triples, which is why this goes
 * unnoticed: an animation line like `14457 14460 5` is perfectly well-formed as
 * a palette range, and it silently maps ids 14457..14460 to "palette" 5.
 *
 * **Measured against a real ia.dat: on today's data this changes nothing, and
 * that is worth stating plainly rather than claiming a fix that is not visible.**
 * Across ids 0..20000 the resolved palette is identical before and after. Two
 * independent accidents mask it:
 *
 * 1. `stcani.tbl` sorts BEFORE `stcpal.tbl` in the archive, so stcpal merges
 *    last and wins all 486 ids the two share. stcani wins none.
 * 2. The one id whose stcani entry does survive — 19386, mapped to "palette"
 *    19390, where the real palettes run 0..201 — is *also* covered by a stcpal
 *    single-value override, and `getPaletteNumber` is
 *    `overrides ?? entries ?? 0`. The override outranks the contaminated entry.
 *
 * **So the fault is latent, not active, and the reason to fix it is that both
 * accidents are properties of a data file nobody here controls.** Neither is a
 * guarantee: a repack that reorders the two tables flips 486 wall ids to
 * animation frame counts, and the unit tests pin exactly that — the broad
 * pattern returns stcani's value under a reversed order, and this function does
 * not.
 *
 * Ground is genuinely unaffected: `mpt` does not match `gndani.tbl`, confirmed
 * against a real seo.dat.
 */
export function buildWallPaletteTable(iaArchive: DataArchive): PaletteTable {
  const table = PaletteTable.fromArchive('stcpal', iaArchive)
  // The cycling definitions live in the NUMERIC stc###.tbl files, which the
  // `stcpal` pattern does not match, and `tileEligibility.isPaletteCycled`
  // needs them. Take them from the broad table and leave its contaminated
  // mapping behind. The second parse costs about 4ms, once, at asset load.
  for (const [paletteNumber, cycling] of PaletteTable.fromArchive('stc', iaArchive)
    .cyclingEntries) {
    table.cyclingEntries.set(paletteNumber, cycling)
  }
  return table
}

export async function loadMapAssets(
  clientPath: string,
  onProgress?: ProgressCallback
): Promise<MapAssets> {
  const key = clientPath.replace(/\\/g, '/').replace(/\/+$/, '')

  const cached = lruGet(assetCache, key)
  if (cached) return cached

  // Resolved through the directory rather than joined as a lowercase literal
  // (HTOO-449). Every other client-file boundary in the app already does this;
  // these two were missed, and they are the two the isometric renderer cannot
  // start without — so on a case-sensitive filesystem holding a tree that
  // spells either archive with a capital, nothing isometric draws at all.
  // Windows folds case on lookup, which is why it was invisible here.
  onProgress?.('Loading seo.dat…')
  const seoBuf = await window.api.readFile(await resolveClientFile(key, 'seo.dat'))
  const seoArchive = DataArchive.fromBuffer(new Uint8Array(seoBuf))

  onProgress?.('Loading ia.dat…')
  const iaBuf = await window.api.readFile(await resolveClientFile(key, 'ia.dat'))
  const iaArchive = DataArchive.fromBuffer(new Uint8Array(iaBuf))

  onProgress?.('Loading palettes…')
  const tileaEntry = seoArchive.get('TILEA.BMP')
  if (!tileaEntry) throw new Error('TILEA.BMP not found in seo.dat')

  const groundPixels = tileaEntry.toUint8Array()
  const groundTileCount = Math.floor(groundPixels.length / GROUND_TILE_BYTES)

  const groundPaletteTable = PaletteTable.fromArchive('mpt', seoArchive)
  const groundPalettes = Palette.fromArchive('mpt', seoArchive)

  const stcPaletteTable = buildWallPaletteTable(iaArchive)
  const stcPalettes = Palette.fromArchive('stc', iaArchive)

  // sotp.dat is packed inside ia.dat
  const sotpEntry = iaArchive.get('sotp.dat')
  const sotp: SotpFile | null = sotpEntry ? SotpFile.fromEntry(sotpEntry) : null

  // Animation tables (optional)
  let groundAnimationTable: TileAnimationTable | null = null
  let stcAnimationTable: TileAnimationTable | null = null
  try {
    const gndAniEntry = seoArchive.get('gndani.tbl')
    if (gndAniEntry) groundAnimationTable = TileAnimationTable.fromEntry(gndAniEntry)
  } catch {
    /* absent or malformed */
  }
  try {
    const stcAniEntry = iaArchive.get('stcani.tbl')
    if (stcAniEntry) stcAnimationTable = TileAnimationTable.fromEntry(stcAniEntry)
  } catch {
    /* absent or malformed */
  }

  // Snapshot which tile ids an installed static_tiles pack overrides, so
  // per-tile rendering only pays an IPC round-trip for covered ids. Captured at
  // load; a brigidAssetsPath change busts this cache (clearAllCaches) → re-read.
  const [floorCoverage, wallCoverage] = await Promise.all([
    coveredIdSet('floor', (id) => Number(id)),
    coveredIdSet('wall', (id) => Number(id))
  ])

  const assets: MapAssets = {
    groundPixels,
    groundTileCount,
    groundPaletteTable,
    groundPalettes,
    iaArchive,
    stcPaletteTable,
    stcPalettes,
    sotp,
    groundAnimationTable,
    stcAnimationTable,
    groundBitmapCache: new Map(),
    stcBitmapCache: new Map(),
    floorCoverage,
    wallCoverage
  }

  lruTouch(assetCache, key, assets, ASSET_CACHE_LIMIT)

  onProgress?.('Assets ready.')
  return assets
}

// ── Tile rendering helpers ────────────────────────────────────────────────────

// The local `pixelsToImageData` blit that used to live here is gone. Ground and
// wall tiles now go through dalib's `renderTile` / `renderHpf`, which is what
// the archive tileset preview already used — the two had drifted apart, and one
// of them was wrong. Nothing else referenced it (checked before deleting).

export async function getGroundBitmap(
  tileIndex: number,
  assets: MapAssets
): Promise<ImageBitmap | null> {
  if (tileIndex <= 0) return null

  // Installed static_tiles pack override wins over legacy TILEA.BMP art; gated
  // on the coverage snapshot so uncovered tiles never pay an IPC round-trip.
  return resolveWithPackOverride(
    'floor',
    tileIndex,
    assets.floorCoverage,
    assets.groundBitmapCache,
    tileIndex,
    async () => {
      if (tileIndex > assets.groundTileCount) return null
      const start = (tileIndex - 1) * GROUND_TILE_BYTES
      const pixels = assets.groundPixels.subarray(start, start + GROUND_TILE_BYTES)
      // The `+ 1` is a palette-TABLE quirk and is unrelated to tile indexing —
      // do not "simplify" it against the `tileIndex - 1` above.
      const palNum = assets.groundPaletteTable.getPaletteNumber(tileIndex + 1)
      const palette = assets.groundPalettes.get(palNum)
      if (!palette) return null
      return createImageBitmap(toImageData(renderTile(new Tile(pixels), palette)))
    }
  )
}

/** stc tiles 1-12 and 10001-10012 are special/empty in DA — skip them. */
function isValidStcIndex(n: number): boolean {
  return n > 0 && ((n > 12 && n < 10000) || n > 10012)
}

export async function getStcBitmap(
  tileIndex: number,
  assets: MapAssets
): Promise<ImageBitmap | null> {
  if (!isValidStcIndex(tileIndex)) return null

  // Installed static_tiles pack override wins over legacy stc*.hpf art.
  return resolveWithPackOverride(
    'wall',
    tileIndex,
    assets.wallCoverage,
    assets.stcBitmapCache,
    tileIndex,
    async () => {
      const entryName = `stc${String(tileIndex).padStart(5, '0')}.hpf`
      const entry = assets.iaArchive.get(entryName)
      if (!entry) return null
      const hpf = HpfFile.fromEntry(entry)
      const palNum = assets.stcPaletteTable.getPaletteNumber(tileIndex + 1)
      const palette = assets.stcPalettes.get(palNum)
      if (!palette) return null
      // `renderHpf` uses colorKey=true (index 0 transparent), which is what the
      // local blit did, so walls are visually unchanged. Pure deduplication.
      return createImageBitmap(toImageData(renderHpf(hpf, palette)))
    }
  )
}

// ── Map render ────────────────────────────────────────────────────────────────

export interface RenderOptions {
  /** Scale factor (default 1). Values < 1 shrink the output. */
  scale?: number
}

export async function renderMap(
  canvas: HTMLCanvasElement,
  mapFile: MapFile,
  assets: MapAssets,
  options: RenderOptions = {},
  onProgress?: ProgressCallback
): Promise<void> {
  const { width: W, height: H, tiles } = mapFile
  const scale = options.scale ?? 1

  // Canvas dimensions
  const canvasW = Math.ceil(((W + H) * HTILE_W + GROUND_TILE_WIDTH) * scale)
  const canvasH = Math.ceil(((W + H) * (HTILE_W / 2) + FOREGROUND_PAD) * scale)

  canvas.width = canvasW
  canvas.height = canvasH

  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvasW, canvasH)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvasW, canvasH)

  if (scale !== 1) {
    ctx.save()
    ctx.scale(scale, scale)
  }

  // Origin: the top-centre of the diamond
  const originX = H * HTILE_W
  const originY = FOREGROUND_PAD

  // ── Ground layer ───────────────────────────────────────────────────────────
  let drawn = 0
  const total = W * H
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tile = tiles[y * W + x]!
      const bg = tile.background
      if (bg > 0) {
        const bitmap = await getGroundBitmap(bg, assets)
        if (bitmap) {
          const sx = originX + (x - y) * HTILE_W - HTILE_W
          const sy = originY + (x + y) * (HTILE_W / 2)
          ctx.drawImage(bitmap, sx, sy)
        }
      }
      drawn++
      if (drawn % 500 === 0) onProgress?.(`Rendering ground… ${Math.round((drawn / total) * 50)}%`)
    }
  }

  // ── Foreground layer ───────────────────────────────────────────────────────
  drawn = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tile = tiles[y * W + x]!
      const sx_base = originX + (x - y) * HTILE_W
      const sy_base = originY + (x + y) * (HTILE_W / 2)

      const lf = tile.leftForeground
      if (lf > 0) {
        const bitmap = await getStcBitmap(lf, assets)
        if (bitmap) {
          ctx.drawImage(bitmap, sx_base - HTILE_W, sy_base - bitmap.height + HTILE_W)
        }
      }

      const rf = tile.rightForeground
      if (rf > 0) {
        const bitmap = await getStcBitmap(rf, assets)
        if (bitmap) {
          ctx.drawImage(bitmap, sx_base, sy_base - bitmap.height + HTILE_W)
        }
      }

      drawn++
      if (drawn % 500 === 0)
        onProgress?.(`Rendering foreground… ${Math.round(50 + (drawn / total) * 50)}%`)
    }
  }

  if (scale !== 1) ctx.restore()
}

// ── Exported coordinate utilities ─────────────────────────────────────────────

/** Half-tile screen width in pixels (28). */
export const ISO_HTILE_W = HTILE_W

/** Vertical screen step per tile row/column in pixels (14). */
export const ISO_VTILE_STEP = HTILE_W / 2

/** Canvas padding above the isometric origin in pixels (512). */
export const ISO_FOREGROUND_PAD = FOREGROUND_PAD

/**
 * Trace an isometric tile diamond centered at (cx, cy) into the current path.
 * Does not stroke or fill — the caller sets the style and calls fill()/stroke().
 * Shared by every mapmaker canvas that paints the passability/grid overlay.
 */
export function drawDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale = 1
): void {
  const hw = HTILE_W * scale
  const hv = (HTILE_W / 2) * scale
  ctx.beginPath()
  ctx.moveTo(cx, cy - hv)
  ctx.lineTo(cx + hw, cy)
  ctx.lineTo(cx, cy + hv)
  ctx.lineTo(cx - hw, cy)
  ctx.closePath()
}

/**
 * Rendered canvas size for an isometric map at the given scale factor.
 * Mirrors the size calculation in renderMap.
 */
export function isoCanvasSize(mapW: number, mapH: number, scale = 1): { w: number; h: number } {
  return {
    w: Math.ceil(((mapW + mapH) * HTILE_W + GROUND_TILE_WIDTH) * scale),
    h: Math.ceil(((mapW + mapH) * (HTILE_W / 2) + FOREGROUND_PAD) * scale)
  }
}

/**
 * Center of tile (tx, ty) in screen space (pixels), accounting for render scale.
 * originX = mapH * ISO_HTILE_W (unscaled), originY = ISO_FOREGROUND_PAD (unscaled).
 */
export function tileToScreen(
  tx: number,
  ty: number,
  originX: number,
  originY: number,
  scale = 1
): { x: number; y: number } {
  const hw = HTILE_W * scale
  const hv = (HTILE_W / 2) * scale
  return {
    x: originX * scale + (tx - ty) * hw,
    y: originY * scale + (tx + ty) * hv + hv // +hv = centre of diamond
  }
}

/**
 * Nearest tile for a screen coordinate — inverse of tileToScreen.
 * Returns tile coords clamped to any range; caller should bounds-check.
 */
export function screenToTileCoords(
  sx: number,
  sy: number,
  originX: number,
  originY: number,
  scale = 1
): { tx: number; ty: number } {
  const hw = HTILE_W * scale
  const hv = (HTILE_W / 2) * scale
  const ox = originX * scale
  const oy = originY * scale
  const a = (sx - ox) / hw
  const b = (sy - oy - hv) / hv
  return {
    tx: Math.round((a + b) / 2),
    ty: Math.round((b - a) / 2)
  }
}

/**
 * True when a map tile can be walked on.
 *
 * sotp.dat byte layout (Static Object Tile Properties):
 *   - Indexing: tile IDs are 1-based ("tile 0 = empty"), so for foreground
 *     tile N the property byte lives at SOTP[N-1]. Earlier code read SOTP[N]
 *     directly, which shifted every tile's collision answer by one slot.
 *   - Low nibble (0x0f) = collision flag. 0x0 = passable, 0xf = impassable.
 *   - Bit 7 (0x80)      = property flag, separate from collision (interactable
 *                         surface — chair/table/altar/etc.). Does NOT affect
 *                         walkability.
 *   - Other high bits (0x10..0x40) appear unused in retail data.
 *
 * Earlier versions of this function tested `byte === 0` against `SOTP[N]`,
 * which combined two errors: it missed the off-by-one and it incorrectly
 * marked the 322 tiles with byte 0x80 (passable + property bit) as impassable.
 * Tiles with no foreground (index <= 0) are always passable.
 */
export function isTilePassable(
  leftForeground: number,
  rightForeground: number,
  sotp: SotpFile
): boolean {
  // `getCollision(id)` is `getFlags(id) & 0x0f` and getFlags owns the 1-based
  // `id - 1` index, so this is the same arithmetic with the offset in one place
  // instead of two. The 0x80 property bit still does not affect collision.
  const lfOk = leftForeground <= 0 || sotp.getCollision(leftForeground) === 0
  const rfOk = rightForeground <= 0 || sotp.getCollision(rightForeground) === 0
  return lfOk && rfOk
}

// Schematic legend colors — kept in sync with the duplicate definitions in
// catalog/MapCanvas.tsx and catalog/DimensionPickerDialog.tsx.
const COLOR_VOID = '#1a1a2e'
const COLOR_FLOOR = '#2d5a3d'
const COLOR_OBJECT = '#8b4513'

/**
 * Schematic (flat-grid) render at an explicit pixels-per-tile scale.
 * Mirrors renderSchematic but accepts scale externally instead of measuring the container.
 */
export function renderSchematicScaled(
  canvas: HTMLCanvasElement,
  map: MapFile,
  pixPerTile: number
): void {
  const { width, height, tiles } = map
  const ppt = Math.max(1, Math.round(pixPerTile))
  canvas.width = width * ppt
  canvas.height = height * ppt
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = tiles[y * width + x]!
      const hasObj = tile.leftForeground > 0 || tile.rightForeground > 0
      ctx.fillStyle = tile.background === 0 ? COLOR_VOID : hasObj ? COLOR_OBJECT : COLOR_FLOOR
      ctx.fillRect(x * ppt, y * ppt, ppt, ppt)
    }
  }
  if (ppt >= 3) {
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= width; x++) {
      ctx.beginPath()
      ctx.moveTo(x * ppt, 0)
      ctx.lineTo(x * ppt, height * ppt)
      ctx.stroke()
    }
    for (let y = 0; y <= height; y++) {
      ctx.beginPath()
      ctx.moveTo(0, y * ppt)
      ctx.lineTo(width * ppt, y * ppt)
      ctx.stroke()
    }
  }
}

// ── Animation helpers ────────────────────────────────────────────────────────

/**
 * Get the animated tile ID for a given tile at the current time.
 * Returns the original tileId if no animation entry exists.
 */
export function getAnimatedTileId(
  table: TileAnimationTable | null,
  tileId: number,
  elapsedMs: number
): number {
  if (!table || tileId <= 0) return tileId
  const entry = table.tryGetEntry(tileId)
  if (!entry || entry.tileSequence.length <= 1) return tileId

  const interval = entry.animationIntervalMs || 500
  const frameIndex = Math.floor(elapsedMs / interval) % entry.tileSequence.length
  return entry.tileSequence[frameIndex] ?? tileId
}
