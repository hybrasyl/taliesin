/**
 * WorldMapCanvas
 *
 * Two stacked canvases:
 *   baseRef    — field background EPF (redrawn when fieldName or clientPath changes)
 *   overlayRef — point markers + hover cursor (redrawn on state/prop changes)
 *
 * Coordinate system:
 *   Native image space is 640×480 (FIELD_WIDTH × FIELD_HEIGHT).
 *   The image is aspect-fit (letterboxed) into the canvas container.
 *   ScreenToField() / FieldToScreen() handle the conversion — same algorithm as
 *   xml-map-maker's ScreenPointToWorldMapPoint().
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Box, CircularProgress, Typography } from '@mui/material'
import { renderField, FIELD_WIDTH, FIELD_HEIGHT } from '../../utils/worldMapRenderer'
import type { WorldMapPoint } from '../../data/worldMapData'
import type { SxProps } from '@mui/material'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorldMapCanvasProps {
  fieldName: string
  clientPath: string | null
  points: WorldMapPoint[]
  selectedIndex: number | null
  /** When true the cursor is a crosshair; clicks call onPlacePoint. */
  placeMode: boolean
  onPointClick: (index: number) => void
  onPlacePoint: (x: number, y: number) => void
  sx?: SxProps
}

// ── Coordinate helpers ────────────────────────────────────────────────────────

interface ScaleState {
  /** Canvas element dimensions. */
  cw: number
  ch: number
  /**
   * Derived from aspect-fit of FIELD_WIDTH×FIELD_HEIGHT into cw×ch.
   * scaleFactor: image pixels → screen pixels
   * offsetX, offsetY: letterbox/pillarbox gap in screen pixels
   */
  scaleFactor: number
  offsetX: number
  offsetY: number
}

function computeScale(cw: number, ch: number): ScaleState {
  const imageRatio     = FIELD_WIDTH / FIELD_HEIGHT            // 4/3
  const containerRatio = cw / ch

  if (imageRatio >= containerRatio) {
    // Fit to width — letterbox top/bottom
    const sf = cw / FIELD_WIDTH
    return { cw, ch, scaleFactor: sf, offsetX: 0, offsetY: (ch - FIELD_HEIGHT * sf) / 2 }
  } else {
    // Fit to height — pillarbox left/right
    const sf = ch / FIELD_HEIGHT
    return { cw, ch, scaleFactor: sf, offsetX: (cw - FIELD_WIDTH * sf) / 2, offsetY: 0 }
  }
}

/** Screen pixel → image pixel (returns null if outside image area). */
function screenToField(sx: number, sy: number, s: ScaleState): { x: number; y: number } | null {
  const x = (sx - s.offsetX) / s.scaleFactor
  const y = (sy - s.offsetY) / s.scaleFactor
  if (x < 0 || y < 0 || x >= FIELD_WIDTH || y >= FIELD_HEIGHT) return null
  return { x: Math.round(x), y: Math.round(y) }
}

/** Image pixel → screen pixel (centre of the pixel). */
function fieldToScreen(fx: number, fy: number, s: ScaleState): { x: number; y: number } {
  return {
    x: fx * s.scaleFactor + s.offsetX,
    y: fy * s.scaleFactor + s.offsetY,
  }
}

// ── Point hit detection (±6px in image space = 12×12 box) ────────────────────

const HIT_RADIUS = 6

function findHit(imgX: number, imgY: number, points: WorldMapPoint[]): number {
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    if (Math.abs(p.x - imgX) <= HIT_RADIUS && Math.abs(p.y - imgY) <= HIT_RADIUS) return i
  }
  return -1
}

// ── Point drawing ─────────────────────────────────────────────────────────────

const BOX_SIZE    = 12   // 12×12 image-space pixels (same as xml-map-maker mapbox.png)
const BOX_HALF    = BOX_SIZE / 2

function drawPoint(
  ctx: CanvasRenderingContext2D,
  p: WorldMapPoint,
  index: number,
  selected: boolean,
  s: ScaleState,
) {
  const { x: sx, y: sy } = fieldToScreen(p.x, p.y, s)
  const bw = BOX_SIZE * s.scaleFactor
  const bh = BOX_SIZE * s.scaleFactor

  // Box
  ctx.fillStyle   = selected ? 'rgba(255,200,50,0.9)' : 'rgba(0,100,200,0.85)'
  ctx.strokeStyle = selected ? '#ffc832' : '#2196f3'
  ctx.lineWidth   = selected ? 2 : 1
  ctx.fillRect(sx - bw / 2, sy - bh / 2, bw, bh)
  ctx.strokeRect(sx - bw / 2, sy - bh / 2, bw, bh)

  // Label
  if (p.name) {
    const fontSize = Math.max(9, Math.round(11 * s.scaleFactor))
    ctx.font         = `${fontSize}px sans-serif`
    ctx.fillStyle    = 'white'
    ctx.textAlign    = 'left'
    ctx.textBaseline = 'middle'
    ctx.shadowColor  = 'rgba(0,0,0,0.8)'
    ctx.shadowBlur   = 3
    ctx.fillText(p.name, sx + bw / 2 + 3, sy)
    ctx.shadowBlur   = 0
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WorldMapCanvas({
  fieldName,
  clientPath,
  points,
  selectedIndex,
  placeMode,
  onPointClick,
  onPlacePoint,
  sx,
}: WorldMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const baseRef      = useRef<HTMLCanvasElement>(null)
  const overlayRef   = useRef<HTMLCanvasElement>(null)
  const scaleRef     = useRef<ScaleState | null>(null)
  const bitmapRef    = useRef<ImageBitmap | null>(null)

  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [renderTick, setRenderTick] = useState(0)
  const [hoverPos,  setHoverPos]  = useState<{ x: number; y: number } | null>(null)

  // ── Resize observer — keeps canvases in sync with container ─────────────────

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0]!.contentRect
      if (width < 1 || height < 1) return
      scaleRef.current = computeScale(width, height)
      setRenderTick(n => n + 1)
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // ── Base render — load field bitmap and paint it ────────────────────────────

  useEffect(() => {
    if (!fieldName) return
    let cancelled = false
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const bitmap = clientPath ? await renderField(fieldName, clientPath) : null
        if (cancelled) return
        bitmapRef.current = bitmap ?? null
        setLoading(false)
        setRenderTick(n => n + 1)
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        console.error('[WorldMapCanvas] renderField failed:', msg)
        setError(msg)
        setLoading(false)
        bitmapRef.current = null
        setRenderTick(n => n + 1)
      }
    })()

    return () => { cancelled = true }
  }, [fieldName, clientPath])

  // ── Redraw base canvas whenever bitmap or scale changes ─────────────────────

  useEffect(() => {
    const base = baseRef.current
    const s    = scaleRef.current
    if (!base || !s) return

    base.width  = s.cw
    base.height = s.ch
    const ctx = base.getContext('2d')!
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, s.cw, s.ch)

    if (bitmapRef.current) {
      ctx.drawImage(
        bitmapRef.current,
        0, 0, FIELD_WIDTH, FIELD_HEIGHT,
        s.offsetX, s.offsetY,
        FIELD_WIDTH * s.scaleFactor,
        FIELD_HEIGHT * s.scaleFactor,
      )
    } else if (!loading) {
      // No bitmap — draw field name as placeholder
      ctx.fillStyle    = '#333'
      ctx.fillRect(s.offsetX, s.offsetY, FIELD_WIDTH * s.scaleFactor, FIELD_HEIGHT * s.scaleFactor)
      ctx.fillStyle    = 'rgba(255,255,255,0.3)'
      ctx.font         = '14px sans-serif'
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(fieldName || '(no field selected)', s.cw / 2, s.ch / 2)
    }
  }, [renderTick, loading])

  // ── Overlay draw — points + hover ───────────────────────────────────────────

  useEffect(() => {
    const overlay = overlayRef.current
    const s       = scaleRef.current
    if (!overlay || !s) return

    overlay.width  = s.cw
    overlay.height = s.ch
    const ctx = overlay.getContext('2d')!
    ctx.clearRect(0, 0, s.cw, s.ch)

    // Points
    for (let i = 0; i < points.length; i++) {
      drawPoint(ctx, points[i]!, i, i === selectedIndex, s)
    }

    // Hover crosshair / ghost box in place mode
    if (hoverPos && placeMode) {
      const { x: sx, y: sy } = fieldToScreen(hoverPos.x, hoverPos.y, s)
      const bw = BOX_SIZE * s.scaleFactor
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth   = 1
      ctx.setLineDash([3, 3])
      ctx.strokeRect(sx - bw / 2, sy - bw / 2, bw, bw)
      ctx.setLineDash([])

      // Coordinate label
      ctx.fillStyle    = 'rgba(0,0,0,0.7)'
      ctx.fillRect(sx + bw / 2 + 3, sy - 9, 64, 16)
      ctx.fillStyle    = 'white'
      ctx.font         = '10px monospace'
      ctx.textAlign    = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${hoverPos.x},${hoverPos.y}`, sx + bw / 2 + 6, sy)
    }
  }, [renderTick, points, selectedIndex, hoverPos, placeMode])

  // ── Event handlers ──────────────────────────────────────────────────────────

  const eventToField = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const s    = scaleRef.current
    const canvas = overlayRef.current
    if (!s || !canvas) return null
    const rect = canvas.getBoundingClientRect()
    return screenToField(e.clientX - rect.left, e.clientY - rect.top, s)
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    setHoverPos(eventToField(e))
  }, [eventToField])

  const handleMouseLeave = useCallback(() => setHoverPos(null), [])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = eventToField(e)
    if (!pos) return
    const hit = findHit(pos.x, pos.y, points)
    if (hit >= 0) { onPointClick(hit); return }
    if (placeMode) onPlacePoint(pos.x, pos.y)
  }, [eventToField, points, placeMode, onPointClick, onPlacePoint])

  const cursor = placeMode ? 'crosshair' : 'pointer'

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box ref={containerRef} sx={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', bgcolor: '#111', ...sx }}>
      {loading && (
        <Box sx={{ position: 'absolute', top: 6, left: 6, zIndex: 10, display: 'flex', alignItems: 'center', gap: 0.75, pointerEvents: 'none' }}>
          <CircularProgress size={12} />
          <Typography variant="caption" sx={{ bgcolor: 'rgba(0,0,0,0.75)', px: 0.75, py: 0.25, borderRadius: 0.5 }}>
            Loading {fieldName}…
          </Typography>
        </Box>
      )}
      {error && (
        <Box sx={{ position: 'absolute', top: 6, left: 6, zIndex: 10, pointerEvents: 'none' }}>
          <Typography variant="caption" color="error" sx={{ bgcolor: 'rgba(0,0,0,0.75)', px: 0.75, py: 0.25, borderRadius: 0.5 }}>
            {error}
          </Typography>
        </Box>
      )}
      <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
        <canvas ref={baseRef}    style={{ position: 'absolute', top: 0, left: 0, display: 'block', imageRendering: 'pixelated' }} />
        <canvas
          ref={overlayRef}
          style={{ position: 'absolute', top: 0, left: 0, display: 'block', cursor }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
        />
      </Box>
    </Box>
  )
}
