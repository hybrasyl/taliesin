/**
 * Isometric DA map renderer.
 *
 * Ground layer:  seo.dat → TILEA.BMP (56×27 px, 1512 bytes/tile) + mpt palette table/palettes
 * Foreground:    ia.dat  → stcNNNNN.hpf (28px wide, variable height)  + stc palette table/palettes
 *
 * Assets are loaded once per clientPath and cached for the lifetime of the renderer process.
 */

import { DataArchive, HpfFile, Palette, PaletteTable, MapFile } from 'dalib-ts'

// ── Constants ─────────────────────────────────────────────────────────────────

const GROUND_TILE_WIDTH  = 56
const GROUND_TILE_HEIGHT = 27
const GROUND_TILE_BYTES  = GROUND_TILE_WIDTH * GROUND_TILE_HEIGHT  // 1512

/** Half tile dimensions used for isometric projection. */
const HTILE_W = GROUND_TILE_WIDTH  / 2   // 28
const HTILE_H = GROUND_TILE_HEIGHT         // 27 (visual half-height is 14 but the tile image is 27)

/** Vertical padding above origin to accommodate tall foreground objects. */
const FOREGROUND_PAD = 480

// ── Asset types ───────────────────────────────────────────────────────────────

export interface MapAssets {
  /** Raw pixel bytes from TILEA.BMP, sliced per tile (index 1-based). */
  groundPixels: Uint8Array    // full TILEA.BMP, use slice(n*1512, (n+1)*1512) for tile n+1
  groundTileCount: number
  groundPaletteTable: PaletteTable
  groundPalettes: Map<number, Palette>

  iaArchive: DataArchive
  stcPaletteTable: PaletteTable
  stcPalettes: Map<number, Palette>
}

// ── Module-level caches ───────────────────────────────────────────────────────

/** Loaded asset sets, keyed by normalised clientPath. */
const assetCache = new Map<string, MapAssets>()

/** Rendered ground tile bitmaps, keyed by tile index. */
const groundBitmapCache = new Map<number, ImageBitmap>()

/** Rendered stc bitmaps, keyed by tile index. */
const stcBitmapCache = new Map<number, ImageBitmap>()

// ── Asset loading ─────────────────────────────────────────────────────────────

export type ProgressCallback = (msg: string) => void

export async function loadMapAssets(
  clientPath: string,
  onProgress?: ProgressCallback
): Promise<MapAssets> {
  const key = clientPath.replace(/\\/g, '/').replace(/\/+$/, '')

  const cached = assetCache.get(key)
  if (cached) return cached

  onProgress?.('Loading seo.dat…')
  const seoBuf = await window.api.readFile(`${key}/seo.dat`)
  const seoArchive = DataArchive.fromBuffer(new Uint8Array(seoBuf))

  onProgress?.('Loading ia.dat…')
  const iaBuf = await window.api.readFile(`${key}/ia.dat`)
  const iaArchive = DataArchive.fromBuffer(new Uint8Array(iaBuf))

  onProgress?.('Loading palettes…')
  const tileaEntry = seoArchive.get('TILEA.BMP')
  if (!tileaEntry) throw new Error('TILEA.BMP not found in seo.dat')

  const groundPixels = tileaEntry.toUint8Array()
  const groundTileCount = Math.floor(groundPixels.length / GROUND_TILE_BYTES)

  const groundPaletteTable = PaletteTable.fromArchive('mpt', seoArchive)
  const groundPalettes = Palette.fromArchive('mpt', seoArchive)

  const stcPaletteTable = PaletteTable.fromArchive('stc', iaArchive)
  const stcPalettes = Palette.fromArchive('stc', iaArchive)

  const assets: MapAssets = {
    groundPixels,
    groundTileCount,
    groundPaletteTable,
    groundPalettes,
    iaArchive,
    stcPaletteTable,
    stcPalettes,
  }

  assetCache.set(key, assets)
  // Clear tile bitmap caches when new assets are loaded
  groundBitmapCache.clear()
  stcBitmapCache.clear()

  onProgress?.('Assets ready.')
  return assets
}

// ── Tile rendering helpers ────────────────────────────────────────────────────

function pixelsToImageData(
  pixels: Uint8Array,
  palette: Palette,
  width: number,
  height: number
): ImageData {
  const img = new ImageData(width, height)
  const d = img.data
  for (let i = 0; i < pixels.length; i++) {
    const idx = pixels[i]!
    if (idx === 0) continue // transparent
    const c = palette.get(idx)
    const dst = i * 4
    d[dst]     = c.r
    d[dst + 1] = c.g
    d[dst + 2] = c.b
    d[dst + 3] = 255
  }
  return img
}

async function getGroundBitmap(tileIndex: number, assets: MapAssets): Promise<ImageBitmap | null> {
  if (tileIndex <= 0 || tileIndex > assets.groundTileCount) return null

  const cached = groundBitmapCache.get(tileIndex)
  if (cached) return cached

  const start = (tileIndex - 1) * GROUND_TILE_BYTES
  const pixels = assets.groundPixels.subarray(start, start + GROUND_TILE_BYTES)
  const palNum  = assets.groundPaletteTable.getPaletteNumber(tileIndex + 1)
  const palette = assets.groundPalettes.get(palNum)
  if (!palette) return null

  const imgData = pixelsToImageData(pixels, palette, GROUND_TILE_WIDTH, GROUND_TILE_HEIGHT)
  const bitmap  = await createImageBitmap(imgData)
  groundBitmapCache.set(tileIndex, bitmap)
  return bitmap
}

/** stc tiles 1-12 and 10001-10012 are special/empty in DA — skip them. */
function isValidStcIndex(n: number): boolean {
  return n > 0 && ((n > 12 && n < 10000) || n > 10012)
}

async function getStcBitmap(tileIndex: number, assets: MapAssets): Promise<ImageBitmap | null> {
  if (!isValidStcIndex(tileIndex)) return null

  const cached = stcBitmapCache.get(tileIndex)
  if (cached) return cached

  const entryName = `stc${String(tileIndex).padStart(5, '0')}.hpf`
  const entry = assets.iaArchive.get(entryName)
  if (!entry) return null

  const hpf = HpfFile.fromEntry(entry)
  const palNum  = assets.stcPaletteTable.getPaletteNumber(tileIndex + 1)
  const palette = assets.stcPalettes.get(palNum)
  if (!palette) return null

  const imgData = pixelsToImageData(hpf.data, palette, hpf.pixelWidth, hpf.pixelHeight)
  const bitmap  = await createImageBitmap(imgData)
  stcBitmapCache.set(tileIndex, bitmap)
  return bitmap
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

  canvas.width  = canvasW
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
      if (drawn % 500 === 0) onProgress?.(`Rendering ground… ${Math.round(drawn / total * 50)}%`)
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
      if (drawn % 500 === 0) onProgress?.(`Rendering foreground… ${Math.round(50 + drawn / total * 50)}%`)
    }
  }

  if (scale !== 1) ctx.restore()
}

/** Clear all cached tile bitmaps (e.g. when switching client paths). */
export function clearTileCache(): void {
  groundBitmapCache.clear()
  stcBitmapCache.clear()
}
