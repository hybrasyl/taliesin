import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Box, CircularProgress, Typography } from '@mui/material'
import { MapFile } from '@eriscorp/dalib-ts'
import {
  loadMapAssets, getGroundBitmap, getStcBitmap,
  isoCanvasSize, tileToScreen, screenToTileCoords, isTilePassable,
  ISO_HTILE_W, ISO_VTILE_STEP, ISO_FOREGROUND_PAD,
  GROUND_TILE_WIDTH, GROUND_TILE_HEIGHT,
  type MapAssets,
} from '../../utils/mapRenderer'
import type { TileLayer } from './TilePicker'

// ── Types ────────────────────────────────────────────────────────────────────

export type EditorTool = 'draw' | 'erase' | 'sample'

/** Individual tile change — always references a concrete layer, never 'foreground'. */
export interface TileChange {
  x: number
  y: number
  layer: 'background' | 'leftForeground' | 'rightForeground'
  oldValue: number
  newValue: number
}

interface Props {
  mapFile: MapFile
  clientPath: string | null
  tool: EditorTool
  activeLayer: TileLayer
  selectedTileId: number
  zoom: number
  showGrid: boolean
  showBg: boolean
  showLfg: boolean
  showRfg: boolean
  showPassability: boolean
  onTileChange: (changes: TileChange[]) => void
  onSampleTile: (tileId: number) => void
  onHoverTile: (tile: { tx: number; ty: number } | null) => void
  onZoomChange: (zoom: number) => void
}

// ── Constants ────────────────────────────────────────────────────────────────

const HTILE_W = ISO_HTILE_W   // 28
const HALF_H  = ISO_VTILE_STEP // 14

// ── Component ────────────────────────────────────────────────────────────────

const MapEditorCanvas: React.FC<Props> = ({
  mapFile, clientPath, tool, activeLayer, selectedTileId, zoom,
  showGrid, showBg, showLfg, showRfg, showPassability,
  onTileChange, onSampleTile, onHoverTile, onZoomChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const assetsRef = useRef<MapAssets | null>(null)
  const [hoverTile, setHoverTile] = useState<{ tx: number; ty: number } | null>(null)
  const paintingRef = useRef(false)
  const batchRef = useRef<TileChange[]>([])
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const renderPending = useRef(false)
  const [renderTick, setRenderTick] = useState(0)

  const { width: W, height: H } = mapFile
  const scale = zoom
  const originX = H * HTILE_W
  const originY = ISO_FOREGROUND_PAD

  const { w: canvasW, h: canvasH } = isoCanvasSize(W, H, scale)

  // ── Full isometric render ──────────────────────────────────────────────────

  const doFullRender = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.width = canvasW
    canvas.height = canvasH
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvasW, canvasH)

    const assets = assetsRef.current
    if (!assets) {
      drawEmptyGrid(ctx, W, H, originX, originY, scale)
      return
    }

    if (scale !== 1) { ctx.save(); ctx.scale(scale, scale) }

    const { tiles } = mapFile

    // Ground layer
    if (showBg) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const bg = tiles[y * W + x]!.background
          if (bg <= 0) continue
          const bm = await getGroundBitmap(bg, assets)
          if (bm) {
            const sx = originX + (x - y) * HTILE_W - HTILE_W
            const sy = originY + (x + y) * HALF_H
            ctx.drawImage(bm, sx, sy)
          }
        }
      }
    }

    // Foreground layers
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const tile = tiles[y * W + x]!
        const fgBaseX = originX + (x - y) * HTILE_W
        const fgBaseY = originY + (x + y) * HALF_H

        if (showLfg && tile.leftForeground > 0) {
          const bm = await getStcBitmap(tile.leftForeground, assets)
          if (bm) ctx.drawImage(bm, fgBaseX - HTILE_W, fgBaseY - bm.height + HTILE_W)
        }

        if (showRfg && tile.rightForeground > 0) {
          const bm = await getStcBitmap(tile.rightForeground, assets)
          if (bm) ctx.drawImage(bm, fgBaseX, fgBaseY - bm.height + HTILE_W)
        }
      }
    }

    if (scale !== 1) ctx.restore()

    // Passability overlay
    if (showPassability && assets.sotpTable) {
      const sotp = assets.sotpTable
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const tile = tiles[y * W + x]!
          if (tile.leftForeground <= 0 && tile.rightForeground <= 0) continue
          if (isTilePassable(tile.leftForeground, tile.rightForeground, sotp)) continue
          const { x: cx, y: cy } = tileToScreen(x, y, originX, originY, scale)
          drawDiamond(ctx, cx, cy, scale)
          ctx.fillStyle = 'rgba(220,50,50,0.38)'
          ctx.fill()
        }
      }
    }
  }, [mapFile, scale, W, H, canvasW, canvasH, originX, originY, showBg, showLfg, showRfg, showPassability])

  // Initial render + asset loading
  useEffect(() => {
    let cancelled = false

    const init = async () => {
      setLoading(true)
      setStatusMsg('Loading assets...')

      try {
        if (clientPath) {
          const assets = await loadMapAssets(clientPath, msg => { if (!cancelled) setStatusMsg(msg) })
          if (cancelled) return
          assetsRef.current = assets
        }

        if (!cancelled) {
          setStatusMsg('Rendering...')
          await doFullRender()
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setStatusMsg(null)
        }
      }
    }

    init()
    return () => { cancelled = true }
  }, [clientPath, doFullRender])

  // Re-render on tick (after undo/redo or zoom change)
  useEffect(() => {
    if (renderTick === 0) return
    doFullRender()
  }, [renderTick, doFullRender])

  // ── Queued re-render (batches paint strokes per animation frame) ───────────

  const queueRender = useCallback(() => {
    if (renderPending.current) return
    renderPending.current = true
    requestAnimationFrame(async () => {
      renderPending.current = false
      await doFullRender()
    })
  }, [doFullRender])

  // ── Ghost tile bitmap (cached for current selection) ────────────────────────

  const [ghostBitmap, setGhostBitmap] = useState<ImageBitmap | null>(null)

  useEffect(() => {
    const assets = assetsRef.current
    if (!assets || tool !== 'draw' || selectedTileId <= 0) {
      setGhostBitmap(null)
      return
    }

    let cancelled = false
    const load = async () => {
      const bm = activeLayer === 'background'
        ? await getGroundBitmap(selectedTileId, assets)
        : await getStcBitmap(selectedTileId, assets)
      if (!cancelled) setGhostBitmap(bm)
    }
    load()
    return () => { cancelled = true }
  }, [selectedTileId, activeLayer, tool])

  // ── Overlay (hover diamond + grid + ghost) ─────────────────────────────────

  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    overlay.width = canvasW
    overlay.height = canvasH
    const ctx = overlay.getContext('2d')!
    ctx.clearRect(0, 0, canvasW, canvasH)

    // Grid
    if (showGrid) {
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'
      ctx.lineWidth = 0.5
      for (let ty = 0; ty < H; ty++) {
        for (let tx = 0; tx < W; tx++) {
          const { x: cx, y: cy } = tileToScreen(tx, ty, originX, originY, scale)
          drawDiamond(ctx, cx, cy, scale)
          ctx.stroke()
        }
      }
      ctx.restore()
    }

    // Hover highlight + ghost
    if (hoverTile) {
      const { x: cx, y: cy } = tileToScreen(hoverTile.tx, hoverTile.ty, originX, originY, scale)

      // Ghost tile preview
      if (ghostBitmap && tool === 'draw') {
        ctx.save()
        ctx.globalAlpha = 0.55

        if (activeLayer === 'background') {
          const gx = (originX + (hoverTile.tx - hoverTile.ty) * HTILE_W - HTILE_W) * scale
          const gy = (originY + (hoverTile.tx + hoverTile.ty) * HALF_H) * scale
          const gw = GROUND_TILE_WIDTH * scale
          const gh = GROUND_TILE_HEIGHT * scale
          ctx.drawImage(ghostBitmap, gx, gy, gw, gh)
        } else {
          const fgBaseX = (originX + (hoverTile.tx - hoverTile.ty) * HTILE_W) * scale
          const fgBaseY = (originY + (hoverTile.tx + hoverTile.ty) * HALF_H) * scale
          const bw = ghostBitmap.width * scale
          const bh = ghostBitmap.height * scale

          if (activeLayer === 'leftForeground') {
            ctx.drawImage(ghostBitmap, fgBaseX - HTILE_W * scale, fgBaseY - bh + HTILE_W * scale, bw, bh)
          } else {
            ctx.drawImage(ghostBitmap, fgBaseX, fgBaseY - bh + HTILE_W * scale, bw, bh)
          }
        }

        ctx.restore()
      }

      // Diamond outline
      drawDiamond(ctx, cx, cy, scale)
      ctx.fillStyle = 'rgba(255,255,255,0.1)'
      ctx.fill()
      ctx.strokeStyle = tool === 'erase' ? 'rgba(255,80,80,0.8)' : 'rgba(255,255,255,0.8)'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }, [hoverTile, canvasW, canvasH, originX, originY, scale, showGrid, W, H, ghostBitmap, tool, activeLayer])

  // ── Mouse → tile coords ────────────────────────────────────────────────────

  const eventToTile = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = overlayRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const { tx, ty } = screenToTileCoords(mx, my, originX, originY, scale)
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return null
    return { tx, ty }
  }, [originX, originY, scale, W, H])

  // ── Apply tool ─────────────────────────────────────────────────────────────

  const applyTool = useCallback((tx: number, ty: number) => {
    const tile = mapFile.getTile(tx, ty)
    const oldValue = tile[activeLayer]

    if (tool === 'sample') {
      onSampleTile(oldValue)
      return
    }

    const newValue = tool === 'erase' ? 0 : selectedTileId
    if (oldValue === newValue) return
    if (batchRef.current.some(c => c.x === tx && c.y === ty && c.layer === activeLayer)) return

    const updated = { ...tile, [activeLayer]: newValue }
    mapFile.setTile(tx, ty, updated)
    batchRef.current.push({ x: tx, y: ty, layer: activeLayer, oldValue, newValue })

    queueRender()
  }, [mapFile, tool, activeLayer, selectedTileId, onSampleTile, queueRender])

  // ── Mouse handlers ─────────────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    const tile = eventToTile(e)
    if (!tile) return
    paintingRef.current = true
    batchRef.current = []
    applyTool(tile.tx, tile.ty)
  }, [eventToTile, applyTool])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const tile = eventToTile(e)
    setHoverTile(tile)
    onHoverTile(tile)
    if (paintingRef.current && tile && tool !== 'sample') {
      applyTool(tile.tx, tile.ty)
    }
  }, [eventToTile, tool, applyTool, onHoverTile])

  const handleMouseUp = useCallback(() => {
    if (paintingRef.current && batchRef.current.length > 0) {
      onTileChange(batchRef.current)
      batchRef.current = []
    }
    paintingRef.current = false
  }, [onTileChange])

  const handleMouseLeave = useCallback(() => {
    setHoverTile(null)
    onHoverTile(null)
    if (paintingRef.current && batchRef.current.length > 0) {
      onTileChange(batchRef.current)
      batchRef.current = []
    }
    paintingRef.current = false
  }, [onHoverTile, onTileChange])

  // ── Expose re-render trigger for undo/redo ─────────────────────────────────
  // The parent bumps `key` to remount, but we also expose renderTick for softer updates.

  // ── Wheel handler (Shift = zoom, Ctrl = horizontal scroll) ──────────────────

  const scrollRef = useRef<HTMLDivElement>(null)

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (e.shiftKey) {
      // Zoom
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.25 : 0.25
      const newZoom = Math.max(0.25, Math.min(2, zoom + delta))
      if (newZoom !== zoom) onZoomChange(newZoom)
    } else if (e.ctrlKey) {
      // Horizontal scroll
      e.preventDefault()
      const container = scrollRef.current
      if (container) container.scrollLeft += e.deltaY
    }
    // Default: normal vertical scroll
  }, [zoom, onZoomChange])

  const cursor = tool === 'sample' ? 'crosshair' : 'cell'

  return (
    <Box ref={scrollRef} sx={{ position: 'relative', overflow: 'auto', flex: 1 }} onWheel={handleWheel}>
      {(loading || statusMsg) && (
        <Box sx={{ position: 'absolute', top: 6, left: 6, zIndex: 10, display: 'flex', alignItems: 'center', gap: 0.75, pointerEvents: 'none' }}>
          {loading && <CircularProgress size={12} />}
          {statusMsg && (
            <Typography variant="caption" sx={{ bgcolor: 'rgba(0,0,0,0.75)', px: 0.75, py: 0.25, borderRadius: 0.5 }}>
              {statusMsg}
            </Typography>
          )}
        </Box>
      )}
      <Box sx={{ display: 'inline-block', position: 'relative' }}>
        <canvas ref={canvasRef} style={{ display: 'block', imageRendering: 'pixelated' }} />
        <canvas
          ref={overlayRef}
          style={{ position: 'absolute', top: 0, left: 0, display: 'block', cursor }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        />
      </Box>
    </Box>
  )
}

// ── Drawing helpers ──────────────────────────────────────────────────────────

function drawDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number) {
  const hw = HTILE_W * scale
  const hv = HALF_H * scale
  ctx.beginPath()
  ctx.moveTo(cx, cy - hv)
  ctx.lineTo(cx + hw, cy)
  ctx.lineTo(cx, cy + hv)
  ctx.lineTo(cx - hw, cy)
  ctx.closePath()
}

/** Draw magenta diamond outlines for each tile — used when no client assets are loaded. */
function drawEmptyGrid(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  originX: number, originY: number,
  scale: number,
) {
  ctx.strokeStyle = '#ff00ff'
  ctx.lineWidth = 0.5
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      const { x: cx, y: cy } = tileToScreen(tx, ty, originX, originY, scale)
      drawDiamond(ctx, cx, cy, scale)
      ctx.stroke()
    }
  }
}

export default MapEditorCanvas
