import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Box, CircularProgress, Typography, Menu, MenuItem, Divider, ListItemIcon, ListItemText } from '@mui/material'
import BrushIcon from '@mui/icons-material/Brush'
import DeleteIcon from '@mui/icons-material/Delete'
import FormatColorFillIcon from '@mui/icons-material/FormatColorFill'
import TimelineIcon from '@mui/icons-material/Timeline'
import CropSquareIcon from '@mui/icons-material/CropSquare'
import SelectAllIcon from '@mui/icons-material/SelectAll'
import ColorizeIcon from '@mui/icons-material/Colorize'
import ContentCutIcon from '@mui/icons-material/ContentCut'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ContentPasteIcon from '@mui/icons-material/ContentPaste'
import DeleteForeverIcon from '@mui/icons-material/DeleteForever'
import { MapFile, type MapTile } from '@eriscorp/dalib-ts'
import {
  loadMapAssets, getGroundBitmap, getStcBitmap, getAnimatedTileId,
  isoCanvasSize, tileToScreen, screenToTileCoords, isTilePassable,
  ISO_HTILE_W, ISO_VTILE_STEP, ISO_FOREGROUND_PAD,
  GROUND_TILE_WIDTH, GROUND_TILE_HEIGHT,
  type MapAssets,
} from '../../utils/mapRenderer'
import {
  floodFill, bresenhamLine, getShapeCoords, applyChanges,
  type TileChange, type TileCoord, type ShapeMode, type TileLayerKey,
} from '../../utils/mapEditorTools'
import type { TileLayer } from './TilePicker'

// ── Types ────────────────────────────────────────────────────────────────────

export type EditorTool = 'draw' | 'erase' | 'sample' | 'fill' | 'line' | 'shape' | 'select' | 'randomFill'

export { type TileChange } from '../../utils/mapEditorTools'

export interface Selection {
  x: number; y: number; w: number; h: number
}

export interface Clipboard {
  tiles: MapTile[]
  w: number
  h: number
}

interface Props {
  mapFile: MapFile
  clientPath: string | null
  tool: EditorTool
  activeLayer: TileLayer
  selectedTileId: number
  selectedTileIds: number[]
  zoom: number
  shapeMode: ShapeMode
  showGrid: boolean
  showBg: boolean
  showLfg: boolean
  showRfg: boolean
  showPassability: boolean
  selection: Selection | null
  clipboard: Clipboard | null
  pasteMode: boolean
  onTileChange: (changes: TileChange[]) => void
  onSampleTile: (tileId: number) => void
  onHoverTile: (tile: { tx: number; ty: number } | null) => void
  onZoomChange: (zoom: number) => void
  onSelectionChange: (sel: Selection | null) => void
  onRequestPaste: (tx: number, ty: number, keepPasting: boolean) => void
  onSelectionMove: (dx: number, dy: number, duplicate: boolean) => void
  showAnimation: boolean
  onContextAction: (action: string, tile?: TileCoord) => void
}

// ── Constants ────────────────────────────────────────────────────────────────

const HTILE_W = ISO_HTILE_W
const HALF_H  = ISO_VTILE_STEP

// ── Component ────────────────────────────────────────────────────────────────

const MapEditorCanvas: React.FC<Props> = ({
  mapFile, clientPath, tool, activeLayer, selectedTileId, selectedTileIds, zoom,
  shapeMode, showGrid, showBg, showLfg, showRfg, showPassability,
  selection, clipboard, pasteMode,
  onTileChange, onSampleTile, onHoverTile, onZoomChange,
  onSelectionChange, onRequestPaste, onSelectionMove,
  showAnimation, onContextAction,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const assetsRef = useRef<MapAssets | null>(null)
  const [hoverTile, setHoverTile] = useState<TileCoord | null>(null)
  const [altHeld, setAltHeld] = useState(false)
  const paintingRef = useRef(false)
  const batchRef = useRef<TileChange[]>([])
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const renderPending = useRef(false)

  // Line tool state
  const [lineStart, setLineStart] = useState<TileCoord | null>(null)

  // Shape tool state
  const [shapeStart, setShapeStart] = useState<TileCoord | null>(null)

  // Select tool state
  const [selectStart, setSelectStart] = useState<TileCoord | null>(null)
  const [dragStart, setDragStart] = useState<TileCoord | null>(null)
  const [dragOffset, setDragOffset] = useState<TileCoord | null>(null)

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number; tile: TileCoord } | null>(null)

  // Animation
  const elapsedRef = useRef(0)
  const animFrameRef = useRef<number | null>(null)

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

    const elapsed = elapsedRef.current
    const gndAni = showAnimation ? assets.groundAnimationTable : null
    const stcAni = showAnimation ? assets.stcAnimationTable : null

    if (showBg) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const bg = tiles[y * W + x]!.background
          if (bg <= 0) continue
          const animBg = getAnimatedTileId(gndAni, bg, elapsed)
          const bm = await getGroundBitmap(animBg, assets)
          if (bm) {
            ctx.drawImage(bm, originX + (x - y) * HTILE_W - HTILE_W, originY + (x + y) * HALF_H)
          }
        }
      }
    }

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const tile = tiles[y * W + x]!
        const fgBaseX = originX + (x - y) * HTILE_W
        const fgBaseY = originY + (x + y) * HALF_H

        if (showLfg && tile.leftForeground > 0) {
          const animLf = getAnimatedTileId(stcAni, tile.leftForeground, elapsed)
          const bm = await getStcBitmap(animLf, assets)
          if (bm) ctx.drawImage(bm, fgBaseX - HTILE_W, fgBaseY - bm.height + HTILE_W)
        }
        if (showRfg && tile.rightForeground > 0) {
          const animRf = getAnimatedTileId(stcAni, tile.rightForeground, elapsed)
          const bm = await getStcBitmap(animRf, assets)
          if (bm) ctx.drawImage(bm, fgBaseX, fgBaseY - bm.height + HTILE_W)
        }
      }
    }

    if (scale !== 1) ctx.restore()

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
  }, [mapFile, scale, W, H, canvasW, canvasH, originX, originY, showBg, showLfg, showRfg, showPassability, showAnimation])

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
        if (!cancelled) { setLoading(false); setStatusMsg(null) }
      }
    }
    init()
    return () => { cancelled = true }
  }, [clientPath, doFullRender])

  const queueRender = useCallback(() => {
    if (renderPending.current) return
    renderPending.current = true
    requestAnimationFrame(async () => {
      renderPending.current = false
      await doFullRender()
    })
  }, [doFullRender])

  // ── Animation loop ─────────────────────────────────────────────────────────

  useEffect(() => {
    const assets = assetsRef.current
    const hasAnimations = showAnimation && assets &&
      (assets.groundAnimationTable || assets.stcAnimationTable)
    if (!hasAnimations) return

    let lastTime = performance.now()
    const tick = (now: number) => {
      elapsedRef.current += now - lastTime
      lastTime = now
      queueRender()
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [showAnimation, queueRender])

  // ── Ghost tile bitmap ──────────────────────────────────────────────────────

  const [ghostBitmap, setGhostBitmap] = useState<ImageBitmap | null>(null)

  useEffect(() => {
    const assets = assetsRef.current
    const needsGhost = tool === 'draw' || tool === 'fill' || tool === 'line' || tool === 'shape' || tool === 'randomFill'
    if (!assets || !needsGhost || selectedTileId <= 0) {
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

  // ── Draw ghost at a tile position ──────────────────────────────────────────

  const drawGhostAt = useCallback((ctx: CanvasRenderingContext2D, tx: number, ty: number, bm: ImageBitmap) => {
    if (activeLayer === 'background') {
      const gx = (originX + (tx - ty) * HTILE_W - HTILE_W) * scale
      const gy = (originY + (tx + ty) * HALF_H) * scale
      ctx.drawImage(bm, gx, gy, GROUND_TILE_WIDTH * scale, GROUND_TILE_HEIGHT * scale)
    } else {
      const fgBaseX = (originX + (tx - ty) * HTILE_W) * scale
      const fgBaseY = (originY + (tx + ty) * HALF_H) * scale
      const bw = bm.width * scale
      const bh = bm.height * scale
      if (activeLayer === 'leftForeground') {
        ctx.drawImage(bm, fgBaseX - HTILE_W * scale, fgBaseY - bh + HTILE_W * scale, bw, bh)
      } else {
        ctx.drawImage(bm, fgBaseX, fgBaseY - bh + HTILE_W * scale, bw, bh)
      }
    }
  }, [activeLayer, originX, originY, scale])

  // ── Overlay ────────────────────────────────────────────────────────────────

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

    // Selection rectangle
    if (selection) {
      ctx.save()
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = 'rgba(100,200,255,0.9)'
      ctx.lineWidth = 2
      ctx.fillStyle = 'rgba(100,200,255,0.08)'
      for (let dy = 0; dy < selection.h; dy++) {
        for (let dx = 0; dx < selection.w; dx++) {
          const tx = selection.x + dx
          const ty = selection.y + dy
          if (tx >= W || ty >= H) continue
          const { x: cx, y: cy } = tileToScreen(tx, ty, originX, originY, scale)
          drawDiamond(ctx, cx, cy, scale)
          ctx.fill()
          // Only draw border diamonds on edges
          if (dx === 0 || dx === selection.w - 1 || dy === 0 || dy === selection.h - 1) {
            ctx.stroke()
          }
        }
      }
      ctx.restore()
    }

    // Selection drag preview
    if (selection && dragOffset) {
      ctx.save()
      ctx.globalAlpha = 0.4
      ctx.strokeStyle = 'rgba(255,200,50,0.8)'
      ctx.lineWidth = 1
      for (let dy = 0; dy < selection.h; dy++) {
        for (let dx = 0; dx < selection.w; dx++) {
          const tx = selection.x + dx + dragOffset.tx
          const ty = selection.y + dy + dragOffset.ty
          if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue
          const { x: cx, y: cy } = tileToScreen(tx, ty, originX, originY, scale)
          drawDiamond(ctx, cx, cy, scale)
          ctx.stroke()
          // Overwrite warning
          const existingTile = mapFile.getTile(tx, ty)
          if (existingTile[activeLayer] !== 0) {
            ctx.fillStyle = 'rgba(255,50,50,0.3)'
            ctx.fill()
          }
        }
      }
      ctx.restore()
    }

    // Paste preview + overwrite warnings
    if (pasteMode && clipboard && hoverTile) {
      ctx.save()
      ctx.globalAlpha = 0.5
      for (let dy = 0; dy < clipboard.h; dy++) {
        for (let dx = 0; dx < clipboard.w; dx++) {
          const tx = hoverTile.tx + dx
          const ty = hoverTile.ty + dy
          if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue
          const clipTile = clipboard.tiles[dy * clipboard.w + dx]
          const { x: cx, y: cy } = tileToScreen(tx, ty, originX, originY, scale)

          // Draw ghost diamond for paste area
          drawDiamond(ctx, cx, cy, scale)
          ctx.fillStyle = 'rgba(100,255,100,0.15)'
          ctx.fill()
          ctx.strokeStyle = 'rgba(100,255,100,0.6)'
          ctx.lineWidth = 1
          ctx.stroke()

          // Overwrite warning
          if (clipTile && clipTile[activeLayer] !== 0) {
            const existing = mapFile.getTile(tx, ty)[activeLayer]
            if (existing !== 0) {
              drawDiamond(ctx, cx, cy, scale)
              ctx.fillStyle = 'rgba(255,50,50,0.3)'
              ctx.fill()
            }
          }
        }
      }
      ctx.restore()
    }

    // Line tool preview
    if (tool === 'line' && lineStart && hoverTile) {
      const coords = bresenhamLine(lineStart.tx, lineStart.ty, hoverTile.tx, hoverTile.ty)
      ctx.save()
      ctx.globalAlpha = 0.45
      for (const { tx, ty } of coords) {
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue
        if (ghostBitmap) {
          drawGhostAt(ctx, tx, ty, ghostBitmap)
        } else {
          const { x: cx, y: cy } = tileToScreen(tx, ty, originX, originY, scale)
          drawDiamond(ctx, cx, cy, scale)
          ctx.fillStyle = 'rgba(255,255,100,0.4)'
          ctx.fill()
        }
      }
      ctx.restore()
    }

    // Shape tool preview
    if (tool === 'shape' && shapeStart && hoverTile) {
      const coords = getShapeCoords(shapeStart.tx, shapeStart.ty, hoverTile.tx, hoverTile.ty, shapeMode)
      ctx.save()
      ctx.globalAlpha = 0.45
      for (const { tx, ty } of coords) {
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue
        if (ghostBitmap) {
          drawGhostAt(ctx, tx, ty, ghostBitmap)
        } else {
          const { x: cx, y: cy } = tileToScreen(tx, ty, originX, originY, scale)
          drawDiamond(ctx, cx, cy, scale)
          ctx.fillStyle = 'rgba(255,255,100,0.4)'
          ctx.fill()
        }
      }
      ctx.restore()
    }

    // Hover highlight + ghost (for draw/fill/randomFill tools)
    if (hoverTile && !pasteMode) {
      const { x: cx, y: cy } = tileToScreen(hoverTile.tx, hoverTile.ty, originX, originY, scale)

      // Ghost tile preview for single-tile tools
      const showGhost = ghostBitmap && (tool === 'draw' || tool === 'fill' || tool === 'randomFill') && !lineStart && !shapeStart
      if (showGhost) {
        ctx.save()
        ctx.globalAlpha = 0.55
        drawGhostAt(ctx, hoverTile.tx, hoverTile.ty, ghostBitmap!)
        ctx.restore()
      }

      // Diamond outline
      drawDiamond(ctx, cx, cy, scale)
      ctx.fillStyle = 'rgba(255,255,255,0.1)'
      ctx.fill()
      ctx.strokeStyle = tool === 'erase' ? 'rgba(255,80,80,0.8)'
        : altHeld ? 'rgba(255,200,50,0.8)'
        : 'rgba(255,255,255,0.8)'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }, [
    hoverTile, canvasW, canvasH, originX, originY, scale, showGrid, W, H,
    ghostBitmap, tool, activeLayer, altHeld,
    lineStart, shapeStart, shapeMode,
    selection, clipboard, pasteMode, dragOffset, mapFile,
    drawGhostAt,
  ])

  // ── Coordinate conversion ──────────────────────────────────────────────────

  const eventToTile = useCallback((e: React.MouseEvent<HTMLCanvasElement>): TileCoord | null => {
    const canvas = overlayRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const { tx, ty } = screenToTileCoords(e.clientX - rect.left, e.clientY - rect.top, originX, originY, scale)
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return null
    return { tx, ty }
  }, [originX, originY, scale, W, H])

  // ── Tool application ───────────────────────────────────────────────────────

  const applyDrawOrErase = useCallback((tx: number, ty: number) => {
    const tile = mapFile.getTile(tx, ty)
    const oldValue = tile[activeLayer]
    const newValue = tool === 'erase' ? 0 : selectedTileId
    if (oldValue === newValue) return
    if (batchRef.current.some(c => c.x === tx && c.y === ty && c.layer === activeLayer)) return

    mapFile.setTile(tx, ty, { ...tile, [activeLayer]: newValue })
    batchRef.current.push({ x: tx, y: ty, layer: activeLayer, oldValue, newValue })
    queueRender()
  }, [mapFile, tool, activeLayer, selectedTileId, queueRender])

  const applyRandomFill = useCallback((tx: number, ty: number) => {
    if (selectedTileIds.length === 0) return
    const tile = mapFile.getTile(tx, ty)
    const oldValue = tile[activeLayer]
    if (oldValue !== 0) return // only fill empty
    if (batchRef.current.some(c => c.x === tx && c.y === ty && c.layer === activeLayer)) return

    const newValue = selectedTileIds[Math.floor(Math.random() * selectedTileIds.length)]
    mapFile.setTile(tx, ty, { ...tile, [activeLayer]: newValue })
    batchRef.current.push({ x: tx, y: ty, layer: activeLayer, oldValue, newValue })
    queueRender()
  }, [mapFile, activeLayer, selectedTileIds, queueRender])

  const applyFill = useCallback((tx: number, ty: number) => {
    const changes = floodFill(mapFile, tx, ty, activeLayer, selectedTileId)
    if (changes.length === 0) return
    applyChanges(mapFile, changes)
    onTileChange(changes)
    queueRender()
  }, [mapFile, activeLayer, selectedTileId, onTileChange, queueRender])

  const commitLineOrShape = useCallback((coords: TileCoord[]) => {
    const changes: TileChange[] = []
    for (const { tx, ty } of coords) {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue
      const tile = mapFile.getTile(tx, ty)
      const oldValue = tile[activeLayer]
      const newValue = selectedTileId
      if (oldValue === newValue) continue
      changes.push({ x: tx, y: ty, layer: activeLayer, oldValue, newValue })
    }
    if (changes.length === 0) return
    applyChanges(mapFile, changes)
    onTileChange(changes)
    queueRender()
  }, [mapFile, activeLayer, selectedTileId, W, H, onTileChange, queueRender])

  // ── Is tile inside selection? ──────────────────────────────────────────────

  const isInSelection = useCallback((tx: number, ty: number): boolean => {
    if (!selection) return false
    return tx >= selection.x && tx < selection.x + selection.w &&
           ty >= selection.y && ty < selection.y + selection.h
  }, [selection])

  // ── Middle mouse pan ────────────────────────────────────────────────────────

  const panningRef = useRef(false)
  const panStartRef = useRef({ mx: 0, my: 0, sx: 0, sy: 0 })

  // ── Mouse handlers ─────────────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // Middle mouse button — start panning
    if (e.button === 1) {
      e.preventDefault()
      panningRef.current = true
      const container = scrollRef.current
      panStartRef.current = {
        mx: e.clientX, my: e.clientY,
        sx: container?.scrollLeft ?? 0, sy: container?.scrollTop ?? 0,
      }
      return
    }
    if (e.button !== 0) return
    const tile = eventToTile(e)
    if (!tile) return

    const effectiveTool = altHeld ? 'sample' : tool

    // Alt-eyedropper
    if (effectiveTool === 'sample') {
      onSampleTile(mapFile.getTile(tile.tx, tile.ty)[activeLayer])
      return
    }

    // Paste mode
    if (pasteMode) {
      onRequestPaste(tile.tx, tile.ty, e.shiftKey)
      return
    }

    // Select tool
    if (effectiveTool === 'select') {
      if (selection && isInSelection(tile.tx, tile.ty)) {
        // Start drag inside selection
        setDragStart(tile)
        setDragOffset({ tx: 0, ty: 0 })
        paintingRef.current = true
      } else {
        // Start new selection
        setSelectStart(tile)
        onSelectionChange(null)
        paintingRef.current = true
      }
      return
    }

    // Line tool
    if (effectiveTool === 'line') {
      if (lineStart) {
        // Second click — commit line
        const coords = bresenhamLine(lineStart.tx, lineStart.ty, tile.tx, tile.ty)
        commitLineOrShape(coords)
        setLineStart(null)
      } else {
        // First click — set start
        setLineStart(tile)
      }
      return
    }

    // Shape tool
    if (effectiveTool === 'shape') {
      setShapeStart(tile)
      paintingRef.current = true
      return
    }

    // Fill tool
    if (effectiveTool === 'fill') {
      applyFill(tile.tx, tile.ty)
      return
    }

    // Draw / erase / randomFill
    paintingRef.current = true
    batchRef.current = []
    if (effectiveTool === 'randomFill') {
      applyRandomFill(tile.tx, tile.ty)
    } else {
      applyDrawOrErase(tile.tx, tile.ty)
    }
  }, [
    eventToTile, tool, altHeld, activeLayer, pasteMode, selection,
    lineStart, onSampleTile, onRequestPaste, onSelectionChange,
    isInSelection, applyFill, applyDrawOrErase, applyRandomFill,
    commitLineOrShape, mapFile,
  ])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // Middle mouse panning
    if (panningRef.current) {
      const container = scrollRef.current
      if (container) {
        container.scrollLeft = panStartRef.current.sx - (e.clientX - panStartRef.current.mx)
        container.scrollTop = panStartRef.current.sy - (e.clientY - panStartRef.current.my)
      }
      return
    }

    setAltHeld(e.altKey)
    const tile = eventToTile(e)
    setHoverTile(tile)
    onHoverTile(tile)

    if (!paintingRef.current || !tile) return

    const effectiveTool = altHeld ? 'sample' : tool

    // Select: building selection rect
    if (effectiveTool === 'select' && selectStart) {
      const x = Math.min(selectStart.tx, tile.tx)
      const y = Math.min(selectStart.ty, tile.ty)
      const w = Math.abs(tile.tx - selectStart.tx) + 1
      const h = Math.abs(tile.ty - selectStart.ty) + 1
      onSelectionChange({ x, y, w, h })
      return
    }

    // Select: dragging selection
    if (effectiveTool === 'select' && dragStart) {
      setDragOffset({ tx: tile.tx - dragStart.tx, ty: tile.ty - dragStart.ty })
      return
    }

    // Shape: update shape end
    // (preview is handled by overlay, no action needed here)

    // Draw / erase continuous
    if (effectiveTool === 'draw' || effectiveTool === 'erase') {
      applyDrawOrErase(tile.tx, tile.ty)
    }

    // Random fill continuous
    if (effectiveTool === 'randomFill') {
      applyRandomFill(tile.tx, tile.ty)
    }
  }, [eventToTile, tool, altHeld, selectStart, dragStart, onHoverTile, onSelectionChange, applyDrawOrErase, applyRandomFill])

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (panningRef.current) { panningRef.current = false; return }
    const tile = eventToTile(e)

    // Shape tool: commit on release
    if (tool === 'shape' && shapeStart && tile) {
      const coords = getShapeCoords(shapeStart.tx, shapeStart.ty, tile.tx, tile.ty, shapeMode)
      commitLineOrShape(coords)
      setShapeStart(null)
    }

    // Select tool: finalize selection or drag
    if (tool === 'select') {
      if (dragStart && dragOffset && (dragOffset.tx !== 0 || dragOffset.ty !== 0)) {
        onSelectionMove(dragOffset.tx, dragOffset.ty, e.shiftKey)
      }
      setSelectStart(null)
      setDragStart(null)
      setDragOffset(null)
    }

    // Commit batch for draw/erase/randomFill
    if (paintingRef.current && batchRef.current.length > 0) {
      onTileChange(batchRef.current)
      batchRef.current = []
    }
    paintingRef.current = false
  }, [eventToTile, tool, shapeStart, shapeMode, dragStart, dragOffset, commitLineOrShape, onTileChange, onSelectionMove])

  const handleMouseLeave = useCallback(() => {
    panningRef.current = false
    setHoverTile(null)
    setAltHeld(false)
    onHoverTile(null)
    if (paintingRef.current && batchRef.current.length > 0) {
      onTileChange(batchRef.current)
      batchRef.current = []
    }
    paintingRef.current = false
  }, [onHoverTile, onTileChange])

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (lineStart) setLineStart(null)
    if (shapeStart) setShapeStart(null)
    const tile = eventToTile(e)
    if (tile) {
      setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, tile })
    }
  }, [lineStart, shapeStart, eventToTile])

  const handleMenuClose = useCallback(() => setContextMenu(null), [])

  const handleMenuAction = useCallback((action: string) => {
    const tile = contextMenu?.tile
    setContextMenu(null)
    onContextAction(action, tile ?? undefined)
  }, [contextMenu, onContextAction])

  // ── Wheel ──────────────────────────────────────────────────────────────────

  const scrollRef = useRef<HTMLDivElement>(null)

  // Register a non-passive wheel listener so preventDefault() works reliably.
  // React's synthetic onWheel is passive in modern browsers, which silently
  // ignores preventDefault() and lets the browser handle Ctrl+Wheel as zoom.
  const wheelHandlerRef = useRef<(e: WheelEvent) => void>()
  wheelHandlerRef.current = (e: WheelEvent) => {
    if (e.shiftKey) {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.25 : 0.25
      const newZoom = Math.max(0.25, Math.min(2, zoom + delta))
      if (newZoom !== zoom) onZoomChange(newZoom)
    } else if (e.ctrlKey) {
      e.preventDefault()
      const container = scrollRef.current
      if (container) container.scrollLeft += e.deltaY
    }
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = (e: WheelEvent) => wheelHandlerRef.current?.(e)
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // ── Cursor ─────────────────────────────────────────────────────────────────

  let cursor = 'cell'
  if (altHeld) cursor = 'crosshair'
  else if (tool === 'sample') cursor = 'crosshair'
  else if (tool === 'select') {
    if (hoverTile && isInSelection(hoverTile.tx, hoverTile.ty)) cursor = 'move'
    else cursor = 'crosshair'
  }
  else if (pasteMode) cursor = 'copy'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Box ref={scrollRef} sx={{ position: 'relative', overflow: 'auto', flex: 1, minWidth: 0, minHeight: 0 }}>
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
          onAuxClick={(e) => e.preventDefault()}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onContextMenu={handleContextMenu}
        />
      </Box>

      {/* Context menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleMenuClose}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
      >
        {selection && [
          <MenuItem key="cut" onClick={() => handleMenuAction('cut')}>
            <ListItemIcon><ContentCutIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Cut</ListItemText>
            <Typography variant="caption" color="text.disabled" sx={{ ml: 2 }}>Ctrl+X</Typography>
          </MenuItem>,
          <MenuItem key="copy" onClick={() => handleMenuAction('copy')}>
            <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Copy</ListItemText>
            <Typography variant="caption" color="text.disabled" sx={{ ml: 2 }}>Ctrl+C</Typography>
          </MenuItem>,
          <MenuItem key="del" onClick={() => handleMenuAction('delete')}>
            <ListItemIcon><DeleteForeverIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Delete</ListItemText>
            <Typography variant="caption" color="text.disabled" sx={{ ml: 2 }}>Del</Typography>
          </MenuItem>,
          <MenuItem key="prefab" onClick={() => handleMenuAction('createPrefab')}>
            <ListItemIcon><SelectAllIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Create Prefab</ListItemText>
          </MenuItem>,
          <Divider key="d1" />,
        ]}
        {clipboard && (
          <MenuItem onClick={() => handleMenuAction('paste')}>
            <ListItemIcon><ContentPasteIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Paste</ListItemText>
            <Typography variant="caption" color="text.disabled" sx={{ ml: 2 }}>Ctrl+V</Typography>
          </MenuItem>
        )}
        <MenuItem onClick={() => handleMenuAction('sample')}>
          <ListItemIcon><ColorizeIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Sample Tile</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleMenuAction('fillHere')}>
          <ListItemIcon><FormatColorFillIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Fill From Here</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => handleMenuAction('toggleBg')}>
          <ListItemText>{showBg ? 'Hide' : 'Show'} Background</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleMenuAction('toggleLfg')}>
          <ListItemText>{showLfg ? 'Hide' : 'Show'} Left Foreground</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleMenuAction('toggleRfg')}>
          <ListItemText>{showRfg ? 'Hide' : 'Show'} Right Foreground</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleMenuAction('togglePassability')}>
          <ListItemText>{showPassability ? 'Hide' : 'Show'} Passability</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => handleMenuAction('tool-draw')}><ListItemIcon><BrushIcon fontSize="small" /></ListItemIcon><ListItemText>Draw</ListItemText></MenuItem>
        <MenuItem onClick={() => handleMenuAction('tool-erase')}><ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon><ListItemText>Erase</ListItemText></MenuItem>
        <MenuItem onClick={() => handleMenuAction('tool-fill')}><ListItemIcon><FormatColorFillIcon fontSize="small" /></ListItemIcon><ListItemText>Fill</ListItemText></MenuItem>
        <MenuItem onClick={() => handleMenuAction('tool-line')}><ListItemIcon><TimelineIcon fontSize="small" /></ListItemIcon><ListItemText>Line</ListItemText></MenuItem>
        <MenuItem onClick={() => handleMenuAction('tool-shape')}><ListItemIcon><CropSquareIcon fontSize="small" /></ListItemIcon><ListItemText>Shape</ListItemText></MenuItem>
        <MenuItem onClick={() => handleMenuAction('tool-select')}><ListItemIcon><SelectAllIcon fontSize="small" /></ListItemIcon><ListItemText>Select</ListItemText></MenuItem>
      </Menu>
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
