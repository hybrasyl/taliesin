/**
 * WorldMapCanvas
 *
 * Two stacked canvases:
 *   baseRef    — field background EPF (redrawn when fieldName or clientPath changes)
 *   overlayRef — point markers + hover cursor (redrawn on state/prop changes)
 *
 * Coordinate system:
 *   Points live in a fixed 640×480 field space (FIELD_WIDTH × FIELD_HEIGHT).
 *   The client reads the server u16 X/Y in that same space, with no scale
 *   factor, so larger field art does not move the nodes.
 *   The field box is aspect-fit (letterboxed) into the canvas container, then
 *   multiplied by the user's zoom and shifted by the pan. The art fills that
 *   box: a legacy 640×480 EPF, or a world_maps pack PNG of any size.
 *   screenToField() / fieldToScreen() handle the conversion — same algorithm as
 *   xml-map-maker's ScreenPointToWorldMapPoint().
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import FitScreenIcon from '@mui/icons-material/FitScreen'
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
  /**
   * Live position of the point the dialog is editing (HTOO-412). Drawn as a
   * ghost marker so a typed coordinate is visible as it is typed.
   */
  pendingPoint?: { x: number; y: number } | null
  /**
   * A point to leave undrawn — the one `pendingPoint` stands in for. Without
   * this an edit draws the marker twice, at the old position and the typed one,
   * which reads as two points rather than one being moved.
   */
  hiddenIndex?: number | null
  sx?: SxProps
}

// ── Zoom ──────────────────────────────────────────────────────────────────────

/**
 * Multipliers of the aspect-fit scale, not absolute scales. 1 is "the whole
 * field, fitted to the pane" whatever size the pane happens to be, which is the
 * only zoom that means the same thing on every window.
 */
export const ZOOM_LEVELS = [1, 1.5, 2, 3, 4, 6, 8] as const

const FIRST_ZOOM = ZOOM_LEVELS[0]!
const LAST_ZOOM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1]!

/** The next stop up or down, stopping at each end rather than wrapping. */
export function nextZoom(zoom: number, direction: 1 | -1): number {
  const i = ZOOM_LEVELS.indexOf(zoom as (typeof ZOOM_LEVELS)[number])
  if (i >= 0) {
    return ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, Math.max(0, i + direction))]!
  }
  // Off the list — step to the neighbour on the chosen side.
  return direction === 1
    ? (ZOOM_LEVELS.find((z) => z > zoom) ?? LAST_ZOOM)
    : ([...ZOOM_LEVELS].reverse().find((z) => z < zoom) ?? FIRST_ZOOM)
}

// ── Coordinate helpers ────────────────────────────────────────────────────────

interface ViewState {
  /** Canvas element dimensions. */
  cw: number
  ch: number
  /** Aspect-fit of FIELD_WIDTH×FIELD_HEIGHT into cw×ch, before zoom. */
  fitScale: number
  /** fitScale × zoom — image pixels → screen pixels. */
  scaleFactor: number
  /** Top-left of the field box in screen pixels, pan included. */
  offsetX: number
  offsetY: number
}

function fitScaleFor(cw: number, ch: number): number {
  const imageRatio = FIELD_WIDTH / FIELD_HEIGHT // 4/3
  return imageRatio >= cw / ch ? cw / FIELD_WIDTH : ch / FIELD_HEIGHT
}

/**
 * Clamp a pan offset so the field cannot be dragged off the pane.
 *
 * An axis whose field is smaller than the pane stays centred and ignores the
 * pan — there is nothing hidden to scroll to, and letting it drift would put
 * the map in a corner for no reason.
 */
function clampPan(pan: number, fieldSize: number, paneSize: number): number {
  if (fieldSize <= paneSize) return 0
  const limit = (fieldSize - paneSize) / 2
  return Math.min(limit, Math.max(-limit, pan))
}

export function computeView(
  cw: number,
  ch: number,
  zoom: number,
  panX: number,
  panY: number
): ViewState {
  const fitScale = fitScaleFor(cw, ch)
  const scaleFactor = fitScale * zoom
  const fieldW = FIELD_WIDTH * scaleFactor
  const fieldH = FIELD_HEIGHT * scaleFactor
  return {
    cw,
    ch,
    fitScale,
    scaleFactor,
    offsetX: (cw - fieldW) / 2 + clampPan(panX, fieldW, cw),
    offsetY: (ch - fieldH) / 2 + clampPan(panY, fieldH, ch)
  }
}

/** Screen pixel → image pixel (returns null if outside the field). */
function screenToField(sx: number, sy: number, s: ViewState): { x: number; y: number } | null {
  const x = (sx - s.offsetX) / s.scaleFactor
  const y = (sy - s.offsetY) / s.scaleFactor
  if (x < 0 || y < 0 || x >= FIELD_WIDTH || y >= FIELD_HEIGHT) return null
  return { x: Math.round(x), y: Math.round(y) }
}

/** Image pixel → screen pixel. */
function fieldToScreen(fx: number, fy: number, s: ViewState): { x: number; y: number } {
  return { x: fx * s.scaleFactor + s.offsetX, y: fy * s.scaleFactor + s.offsetY }
}

// ── Point hit detection ───────────────────────────────────────────────────────

const HIT_RADIUS = 6

/**
 * Every point under the cursor, nearest first.
 *
 * This returns a list rather than the first match because two points can sit
 * inside each other's radius (HTOO-413). Taking the first in list order made
 * the later one unreachable by clicking.
 */
export function findHits(imgX: number, imgY: number, points: WorldMapPoint[]): number[] {
  const hits: { i: number; d: number }[] = []
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    const dx = Math.abs(p.x - imgX)
    const dy = Math.abs(p.y - imgY)
    if (dx <= HIT_RADIUS && dy <= HIT_RADIUS) hits.push({ i, d: dx * dx + dy * dy })
  }
  hits.sort((a, b) => a.d - b.d || a.i - b.i)
  return hits.map((h) => h.i)
}

/**
 * The point a click selects, given what is already selected.
 *
 * Repeated clicks in the same place cycle through the stack, so a buried point
 * can be reached with the mouse. A click that lands on a different stack starts
 * at that stack's nearest point.
 */
export function cycleHit(hits: number[], selected: number | null): number | null {
  if (hits.length === 0) return null
  if (selected === null) return hits[0]!
  const at = hits.indexOf(selected)
  if (at < 0) return hits[0]!
  return hits[(at + 1) % hits.length]!
}

// ── Point drawing ─────────────────────────────────────────────────────────────

const BOX_SIZE = 12 // 12×12 image-space pixels (same as xml-map-maker mapbox.png)
/** The marker never shrinks below this on screen, or it cannot be aimed at. */
const MIN_BOX_SCREEN = 6
/** The label is screen-sized, not field-sized, so it stays readable at any zoom. */
const LABEL_FONT_PX = 11

function markerScreenSize(s: ViewState): number {
  return Math.max(MIN_BOX_SCREEN, BOX_SIZE * s.scaleFactor)
}

function drawPoint(
  ctx: CanvasRenderingContext2D,
  p: WorldMapPoint,
  selected: boolean,
  s: ViewState
) {
  const { x: sx, y: sy } = fieldToScreen(p.x, p.y, s)
  const b = markerScreenSize(s)

  ctx.fillStyle = selected ? 'rgba(255,200,50,0.9)' : 'rgba(0,100,200,0.85)'
  ctx.strokeStyle = selected ? '#ffc832' : '#2196f3'
  ctx.lineWidth = selected ? 2 : 1
  ctx.fillRect(sx - b / 2, sy - b / 2, b, b)
  ctx.strokeRect(sx - b / 2, sy - b / 2, b, b)

  if (p.name) {
    ctx.font = `${LABEL_FONT_PX}px sans-serif`
    ctx.fillStyle = 'white'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0,0,0,0.8)'
    ctx.shadowBlur = 3
    ctx.fillText(p.name, sx + b / 2 + 3, sy)
    ctx.shadowBlur = 0
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
  pendingPoint,
  hiddenIndex,
  sx
}: WorldMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const bitmapRef = useRef<ImageBitmap | null>(null)

  const [size, setSize] = useState<{ cw: number; ch: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bitmapTick, setBitmapTick] = useState(0)
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null)

  const view = useMemo(
    () => (size ? computeView(size.cw, size.ch, zoom, pan.x, pan.y) : null),
    [size, zoom, pan]
  )
  // Event handlers read these without being rebuilt on every pan frame.
  const viewRef = useRef(view)
  viewRef.current = view
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const panRef = useRef(pan)
  panRef.current = pan

  // ── Resize observer — keeps canvases in sync with container ─────────────────

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0]!.contentRect
      if (width < 1 || height < 1) return
      setSize({ cw: width, ch: height })
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // A new field is a new picture; keep the previous zoom and pan off it.
  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [fieldName])

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
        setBitmapTick((n) => n + 1)
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        console.error('[WorldMapCanvas] renderField failed:', msg)
        setError(msg)
        setLoading(false)
        bitmapRef.current = null
        setBitmapTick((n) => n + 1)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [fieldName, clientPath])

  // ── Redraw base canvas whenever bitmap or view changes ──────────────────────

  useEffect(() => {
    const base = baseRef.current
    const s = view
    if (!base || !s) return

    base.width = s.cw
    base.height = s.ch
    const ctx = base.getContext('2d')!
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, s.cw, s.ch)

    const dw = FIELD_WIDTH * s.scaleFactor
    const dh = FIELD_HEIGHT * s.scaleFactor

    if (bitmapRef.current) {
      const bmp = bitmapRef.current
      // Draw the whole bitmap into the field box, whatever its real size. This
      // is what the client does: Brigid's WorldMap.Draw blits the texture into
      // a literal Rectangle(0, 0, 640, 480) in virtual space, and the native UI
      // pass scales that rectangle to the backbuffer. A world_maps pack PNG at
      // 1280×960 therefore shows in full. A source rectangle of 640×480 here
      // cropped it to its top-left quarter.
      // Smooth only a reduction. An enlargement stays hard-edged, to match the
      // client's point sampler.
      ctx.imageSmoothingEnabled = dw < bmp.width
      ctx.drawImage(bmp, s.offsetX, s.offsetY, dw, dh)
    } else if (!loading) {
      // No bitmap — draw field name as placeholder
      ctx.fillStyle = '#333'
      ctx.fillRect(s.offsetX, s.offsetY, dw, dh)
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.font = '14px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(fieldName || '(no field selected)', s.cw / 2, s.ch / 2)
    }
  }, [view, bitmapTick, loading, fieldName])

  // ── Overlay draw — points + hover ───────────────────────────────────────────

  useEffect(() => {
    const overlay = overlayRef.current
    const s = view
    if (!overlay || !s) return

    overlay.width = s.cw
    overlay.height = s.ch
    const ctx = overlay.getContext('2d')!
    ctx.clearRect(0, 0, s.cw, s.ch)

    for (let i = 0; i < points.length; i++) {
      if (i === hiddenIndex) continue
      drawPoint(ctx, points[i]!, i === selectedIndex, s)
    }

    // The point the dialog is editing, at its typed position (HTOO-412).
    if (pendingPoint) {
      const { x: px, y: py } = fieldToScreen(pendingPoint.x, pendingPoint.y, s)
      const b = markerScreenSize(s)
      ctx.strokeStyle = '#ffc832'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 3])
      ctx.strokeRect(px - b / 2, py - b / 2, b, b)
      ctx.setLineDash([])
    }

    // Hover crosshair / ghost box in place mode
    if (hoverPos && placeMode) {
      const { x: sx, y: sy } = fieldToScreen(hoverPos.x, hoverPos.y, s)
      const b = markerScreenSize(s)
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.strokeRect(sx - b / 2, sy - b / 2, b, b)
      ctx.setLineDash([])

      ctx.fillStyle = 'rgba(0,0,0,0.7)'
      ctx.fillRect(sx + b / 2 + 3, sy - 9, 64, 16)
      ctx.fillStyle = 'white'
      ctx.font = '10px monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${hoverPos.x},${hoverPos.y}`, sx + b / 2 + 6, sy)
    }
  }, [view, points, selectedIndex, hoverPos, placeMode, pendingPoint, hiddenIndex])

  // ── Event handlers ──────────────────────────────────────────────────────────

  const eventToField = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const s = viewRef.current
    const canvas = overlayRef.current
    if (!s || !canvas) return null
    const rect = canvas.getBoundingClientRect()
    return screenToField(e.clientX - rect.left, e.clientY - rect.top, s)
  }, [])

  // ── Zoom ────────────────────────────────────────────────────────────────────

  /**
   * Zoom about a screen point, so what is under the cursor stays under it.
   * Without this the field slides away as it grows, and the user chases it.
   *
   * The anchor's distance from the field centre grows by the zoom ratio, and
   * the pan takes up the difference. Both writes are computed from refs rather
   * than inside a state updater, because an updater must stay pure — React
   * calls it twice in development, which would apply the pan shift twice.
   */
  const zoomAbout = useCallback((next: number, anchorX?: number, anchorY?: number) => {
    const s = viewRef.current
    const prev = zoomRef.current
    if (!s || next === prev) return
    if (anchorX !== undefined && anchorY !== undefined) {
      const ratio = next / prev
      const p = panRef.current
      const dx = anchorX - s.cw / 2 - p.x
      const dy = anchorY - s.ch / 2 - p.y
      setPan({ x: p.x - dx * (ratio - 1), y: p.y - dy * (ratio - 1) })
    }
    setZoom(next)
  }, [])

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      const canvas = overlayRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      zoomAbout(
        nextZoom(zoomRef.current, e.deltaY < 0 ? 1 : -1),
        e.clientX - rect.left,
        e.clientY - rect.top
      )
    },
    [zoomAbout]
  )

  const fitView = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  // ── Middle mouse pan (same idiom as the map editor canvas) ──────────────────

  const [panning, setPanning] = useState(false)
  const panStartRef = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 1) return
    e.preventDefault()
    const p = panRef.current
    panStartRef.current = { mx: e.clientX, my: e.clientY, px: p.x, py: p.y }
    setPanning(true)
  }, [])

  const endPan = useCallback(() => setPanning(false), [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (panning) {
        const st = panStartRef.current
        setPan({ x: st.px + (e.clientX - st.mx), y: st.py + (e.clientY - st.my) })
        return
      }
      setHoverPos(eventToField(e))
    },
    [panning, eventToField]
  )

  const handleMouseLeave = useCallback(() => {
    endPan()
    setHoverPos(null)
  }, [endPan])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = eventToField(e)
      if (!pos) return
      // Alt skips the hit test, which is the only way to put a point on top of
      // one that is already there (HTOO-413). Ctrl and Shift are the map list's
      // multi-select and would read inconsistently here.
      if (placeMode && e.altKey) {
        onPlacePoint(pos.x, pos.y)
        return
      }
      const hits = findHits(pos.x, pos.y, points)
      const next = cycleHit(hits, selectedIndex)
      if (next !== null) {
        onPointClick(next)
        return
      }
      if (placeMode) onPlacePoint(pos.x, pos.y)
    },
    [eventToField, points, placeMode, selectedIndex, onPointClick, onPlacePoint]
  )

  const cursor = panning ? 'grabbing' : placeMode ? 'crosshair' : 'pointer'
  const zoomLabel = `${Math.round(zoom * 100)}%`

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        bgcolor: '#111',
        ...sx
      }}
    >
      {loading && (
        <Box
          sx={{
            position: 'absolute',
            top: 6,
            left: 6,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            pointerEvents: 'none'
          }}
        >
          <CircularProgress size={12} />
          <Typography
            variant="caption"
            sx={{ bgcolor: 'rgba(0,0,0,0.75)', px: 0.75, py: 0.25, borderRadius: 0.5 }}
          >
            Loading {fieldName}…
          </Typography>
        </Box>
      )}
      {error && (
        <Box sx={{ position: 'absolute', top: 6, left: 6, zIndex: 10, pointerEvents: 'none' }}>
          <Typography
            variant="caption"
            color="error"
            sx={{ bgcolor: 'rgba(0,0,0,0.75)', px: 0.75, py: 0.25, borderRadius: 0.5 }}
          >
            {error}
          </Typography>
        </Box>
      )}
      {/* Zoom controls */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 6,
          right: 6,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 0.25,
          bgcolor: 'rgba(0,0,0,0.65)',
          borderRadius: 1,
          px: 0.5
        }}
      >
        <Tooltip title="Zoom out">
          <span>
            <IconButton
              size="small"
              disabled={zoom <= FIRST_ZOOM}
              onClick={() => zoomAbout(nextZoom(zoom, -1))}
              sx={{ color: 'common.white' }}
            >
              <RemoveIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Typography
          variant="caption"
          sx={{ color: 'common.white', minWidth: 38, textAlign: 'center' }}
        >
          {zoomLabel}
        </Typography>
        <Tooltip title="Zoom in">
          <span>
            <IconButton
              size="small"
              disabled={zoom >= LAST_ZOOM}
              onClick={() => zoomAbout(nextZoom(zoom, 1))}
              sx={{ color: 'common.white' }}
            >
              <AddIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Fit the whole field">
          <span>
            <IconButton
              size="small"
              disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
              onClick={fitView}
              sx={{ color: 'common.white' }}
            >
              <FitScreenIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
        <canvas
          ref={baseRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            display: 'block',
            imageRendering: 'pixelated'
          }}
        />
        <canvas
          ref={overlayRef}
          style={{ position: 'absolute', top: 0, left: 0, display: 'block', cursor }}
          onMouseDown={handleMouseDown}
          onMouseUp={endPan}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          onWheel={handleWheel}
        />
      </Box>
    </Box>
  )
}
