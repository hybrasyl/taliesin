import {
  getGroundBitmap,
  getStcBitmap,
  isoCanvasSize,
  ISO_HTILE_W,
  ISO_VTILE_STEP,
  ISO_FOREGROUND_PAD,
  type MapAssets
} from './mapRenderer'
import type { Prefab } from './prefabTypes'

export interface RenderPrefabOptions {
  /** Maximum width or height of the rendered preview in pixels. Default 360. */
  maxDim?: number
  /** Allow upscaling tiny prefabs up to this multiple. Default 2. */
  maxUpscale?: number
  /** Background color behind transparent areas. Default '#1a1a2e'. */
  background?: string
  /** Set `cancelled = true` during async work to abort. */
  signal?: { cancelled: boolean }
}

/**
 * Render a prefab into the given canvas using real isometric tile bitmaps.
 *
 * Draws to an off-screen canvas at 1:1 isometric coordinates, computes the
 * tight alpha bounding box, then fits-and-blits onto `canvas`. Avoids the
 * huge transparent FOREGROUND_PAD region that would otherwise dominate the
 * preview at small sizes.
 */
export async function renderPrefabPreviewIso(
  canvas: HTMLCanvasElement,
  prefab: Prefab,
  assets: MapAssets,
  options: RenderPrefabOptions = {}
): Promise<void> {
  const { maxDim = 360, maxUpscale = 2, background = '#1a1a2e', signal } = options
  const { width: W, height: H, tiles } = prefab
  const HTILE_W = ISO_HTILE_W
  const HALF_H = ISO_VTILE_STEP

  const { w: srcW, h: srcH } = isoCanvasSize(W, H, 1)
  const off = document.createElement('canvas')
  off.width = srcW
  off.height = srcH
  const offCtx = off.getContext('2d')!

  const originX = H * HTILE_W
  const originY = ISO_FOREGROUND_PAD

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = tiles[y * W + x]
      if (!t || t.background <= 0) continue
      const bm = await getGroundBitmap(t.background, assets)
      if (signal?.cancelled) return
      if (bm) offCtx.drawImage(bm, originX + (x - y) * HTILE_W - HTILE_W, originY + (x + y) * HALF_H)
    }
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = tiles[y * W + x]
      if (!t) continue
      const fgBaseX = originX + (x - y) * HTILE_W
      const fgBaseY = originY + (x + y) * HALF_H
      if (t.leftForeground > 0) {
        const bm = await getStcBitmap(t.leftForeground, assets)
        if (signal?.cancelled) return
        if (bm) offCtx.drawImage(bm, fgBaseX - HTILE_W, fgBaseY - bm.height + HTILE_W)
      }
      if (t.rightForeground > 0) {
        const bm = await getStcBitmap(t.rightForeground, assets)
        if (signal?.cancelled) return
        if (bm) offCtx.drawImage(bm, fgBaseX, fgBaseY - bm.height + HTILE_W)
      }
    }
  }

  if (signal?.cancelled) return

  const data = offCtx.getImageData(0, 0, srcW, srcH).data
  let minX = srcW
  let minY = srcH
  let maxX = -1
  let maxY = -1
  for (let py = 0; py < srcH; py++) {
    const rowBase = py * srcW * 4
    for (let px = 0; px < srcW; px++) {
      if (data[rowBase + px * 4 + 3] > 0) {
        if (px < minX) minX = px
        if (py < minY) minY = py
        if (px > maxX) maxX = px
        if (py > maxY) maxY = py
      }
    }
  }

  if (maxX < 0) {
    canvas.width = 1
    canvas.height = 1
    return
  }

  const cropW = maxX - minX + 1
  const cropH = maxY - minY + 1
  const fit = Math.min(maxDim / cropW, maxDim / cropH, maxUpscale)
  canvas.width = Math.max(1, Math.ceil(cropW * fit))
  canvas.height = Math.max(1, Math.ceil(cropH * fit))
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = background
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(off, minX, minY, cropW, cropH, 0, 0, canvas.width, canvas.height)
}

/**
 * Fallback heuristic-color renderer for when assets are unavailable
 * (no client path configured, or asset load failed). Mirrors the simple
 * grid that previously shipped — kept so the preview is never blank.
 */
export function renderPrefabPreviewFlat(
  canvas: HTMLCanvasElement,
  prefab: Prefab,
  options: { maxDim?: number; background?: string } = {}
): void {
  const { maxDim = 400, background = '#1a1a2e' } = options
  const { width: W, height: H, tiles } = prefab
  const ppt = Math.max(1, Math.min(Math.floor(maxDim / Math.max(W, H)), 20))
  canvas.width = W * ppt
  canvas.height = H * ppt
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = background
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = tiles[y * W + x]
      if (!t) continue
      if (t.background > 0) {
        const h = (t.background * 137) % 360
        ctx.fillStyle = `hsl(${h}, 40%, 30%)`
        ctx.fillRect(x * ppt, y * ppt, ppt, ppt)
      }
      if (t.leftForeground > 0) {
        const h = (t.leftForeground * 97) % 360
        ctx.fillStyle = `hsla(${h}, 50%, 45%, 0.7)`
        ctx.fillRect(x * ppt, y * ppt, ppt / 2, ppt)
      }
      if (t.rightForeground > 0) {
        const h = (t.rightForeground * 97) % 360
        ctx.fillStyle = `hsla(${h}, 50%, 45%, 0.7)`
        ctx.fillRect(x * ppt + ppt / 2, y * ppt, ppt / 2, ppt)
      }
    }
  }

  if (ppt >= 4) {
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= W; x++) {
      ctx.beginPath()
      ctx.moveTo(x * ppt, 0)
      ctx.lineTo(x * ppt, H * ppt)
      ctx.stroke()
    }
    for (let y = 0; y <= H; y++) {
      ctx.beginPath()
      ctx.moveTo(0, y * ppt)
      ctx.lineTo(W * ppt, y * ppt)
      ctx.stroke()
    }
  }
}
