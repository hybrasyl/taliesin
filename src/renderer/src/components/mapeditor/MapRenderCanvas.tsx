/**
 * MapRenderCanvas
 *
 * Reusable dual-canvas component that renders a DA map (isometric or schematic)
 * and draws an interactive marker overlay (warps, NPCs, signs).
 *
 * Two stacked canvases:
 *   baseRef    — the rendered map (redrawn when map/zoom changes, async)
 *   overlayRef — markers + hover highlight (redrawn synchronously on state changes)
 *
 * Coordinate systems:
 *   iso:       screen position derived from tile (tx,ty) via tileToScreen()
 *   schematic: screen position = (tx * pixPerTile, ty * pixPerTile)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Box, CircularProgress, Typography } from '@mui/material'
import { MapFile } from 'dalib-ts'
import {
  loadMapAssets, renderMap, renderSchematicScaled,
  isoCanvasSize, tileToScreen, screenToTileCoords,
  isTilePassable,
  ISO_HTILE_W, ISO_VTILE_STEP,
} from '../../utils/mapRenderer'
import type { SxProps } from '@mui/material'

// ── Public types ──────────────────────────────────────────────────────────────

export type MarkerKind = 'warp' | 'npc' | 'sign' | 'reactor'

export interface MapMarker {
  kind: MarkerKind
  index: number
  x: number   // tile X
  y: number   // tile Y
}

export interface MapRenderCanvasProps {
  mapId: number
  mapWidth: number
  mapHeight: number
  /** Directory containing lod#####.map binary files. Null → blank schematic grid. */
  mapDirectory: string | null
  /** DA client install path. Set → isometric; null → schematic. */
  clientPath: string | null
  /**
   * Scale factor passed to renderMap (isometric) or pixels-per-tile = max(2, zoom*10) (schematic).
   * Changing this triggers a full re-render.
   */
  zoom?: number
  markers?: MapMarker[]
  selectedMarker?: { kind: MarkerKind; index: number } | null
  /**
   * When true the cursor is a crosshair; clicking any tile calls onTileClick.
   * When false, only marker hits call onMarkerClick.
   */
  placeMode?: boolean
  /** When true, draws a semi-transparent passability overlay (requires sotp.dat via clientPath). */
  showPassability?: boolean
  /** When true, draws tile grid lines over the map. */
  showGrid?: boolean
  onTileClick?: (tx: number, ty: number) => void
  onMarkerClick?: (kind: MarkerKind, index: number) => void
  sx?: SxProps
}

// ── Internal coord state (set after base render, read by overlay + hit-test) ──

interface CoordState {
  mode: 'iso' | 'schematic'
  /** Render scale (iso) */
  scale: number
  /** Pixels per tile (schematic) */
  pixPerTile: number
  /** Unscaled isometric origin (mapH * ISO_HTILE_W) */
  originX: number
  /** Unscaled isometric origin (ISO_FOREGROUND_PAD) */
  originY: number
  canvasW: number
  canvasH: number
  mapW: number
  mapH: number
}

// ── Marker visual style ───────────────────────────────────────────────────────

const MARKER: Record<MarkerKind, { fill: string; stroke: string; label: string }> = {
  warp:    { fill: 'rgba(33,150,243,0.85)',  stroke: '#2196f3', label: 'W' },
  npc:     { fill: 'rgba(76,175,80,0.85)',   stroke: '#4caf50', label: 'N' },
  sign:    { fill: 'rgba(255,193,7,0.85)',   stroke: '#ffc107', label: 'S' },
  reactor: { fill: 'rgba(156,39,176,0.85)',  stroke: '#9c27b0', label: 'R' },
}

// ── Helper: tile → screen centre ──────────────────────────────────────────────

function tileCentre(tx: number, ty: number, cs: CoordState): { x: number; y: number } {
  if (cs.mode === 'iso') {
    return tileToScreen(tx, ty, cs.originX, cs.originY, cs.scale)
  }
  return {
    x: tx * cs.pixPerTile + cs.pixPerTile / 2,
    y: ty * cs.pixPerTile + cs.pixPerTile / 2,
  }
}

// ── Helper: screen → tile ─────────────────────────────────────────────────────

function screenToTile(sx: number, sy: number, cs: CoordState): { tx: number; ty: number } {
  if (cs.mode === 'iso') {
    return screenToTileCoords(sx, sy, cs.originX, cs.originY, cs.scale)
  }
  return {
    tx: Math.floor(sx / cs.pixPerTile),
    ty: Math.floor(sy / cs.pixPerTile),
  }
}

// ── Helper: draw diamond (iso) or square (schematic) path at centre ───────────

function pathTile(ctx: CanvasRenderingContext2D, cx: number, cy: number, cs: CoordState) {
  if (cs.mode === 'iso') {
    const hw = ISO_HTILE_W  * cs.scale
    const hv = ISO_VTILE_STEP * cs.scale
    ctx.beginPath()
    ctx.moveTo(cx,      cy - hv)
    ctx.lineTo(cx + hw, cy)
    ctx.lineTo(cx,      cy + hv)
    ctx.lineTo(cx - hw, cy)
    ctx.closePath()
  } else {
    const p = cs.pixPerTile
    ctx.beginPath()
    ctx.rect(cx - p / 2, cy - p / 2, p, p)
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MapRenderCanvas({
  mapId,
  mapWidth,
  mapHeight,
  mapDirectory,
  clientPath,
  zoom = 1,
  markers = [],
  selectedMarker = null,
  placeMode = false,
  showPassability = false,
  showGrid = false,
  onTileClick,
  onMarkerClick,
  sx,
}: MapRenderCanvasProps) {
  const baseRef    = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const coordState = useRef<CoordState | null>(null)
  const mapFileRef = useRef<MapFile | null>(null)
  const sotpRef    = useRef<Uint8Array | null>(null)

  const [renderTick, setRenderTick]   = useState(0)   // bumped after base render to trigger overlay
  const [loading,    setLoading]      = useState(false)
  const [statusMsg,  setStatusMsg]    = useState<string | null>(null)
  const [error,      setError]        = useState<string | null>(null)
  const [hoverTile,  setHoverTile]    = useState<{ tx: number; ty: number } | null>(null)

  // ── Base render ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const base = baseRef.current
    if (!base || mapWidth <= 0 || mapHeight <= 0) return

    let cancelled = false
    setLoading(true)
    setError(null)
    setStatusMsg('Loading…')
    setHoverTile(null)
    coordState.current = null
    mapFileRef.current = null
    sotpRef.current    = null

    ;(async () => {
      try {
        // Locate binary
        let mapFile: MapFile | null = null
        if (mapDirectory) {
          const binPath = `${mapDirectory}/lod${mapId}.map`
          try {
            const raw = await window.api.readFile(binPath)
            mapFile = MapFile.fromBuffer(new Uint8Array(raw), mapWidth, mapHeight)
          } catch {
            // Binary absent — render blank schematic
          }
        }
        if (cancelled) return

        if (clientPath && mapFile) {
          // ── Isometric ─────────────────────────────────────────────────────
          setStatusMsg('Loading tiles…')
          const assets = await loadMapAssets(clientPath, msg => { if (!cancelled) setStatusMsg(msg) })
          if (cancelled) return

          setStatusMsg('Rendering…')
          const { w, h } = isoCanvasSize(mapWidth, mapHeight, zoom)
          base.width  = w
          base.height = h
          await renderMap(base, mapFile, assets, { scale: zoom }, msg => { if (!cancelled) setStatusMsg(msg) })
          if (cancelled) return

          mapFileRef.current = mapFile
          sotpRef.current    = assets.sotpTable

          coordState.current = {
            mode: 'iso',
            scale: zoom,
            pixPerTile: 0,
            originX: mapHeight * ISO_HTILE_W,
            originY: 480,                         // ISO_FOREGROUND_PAD
            canvasW: w, canvasH: h,
            mapW: mapWidth, mapH: mapHeight,
          }
        } else {
          // ── Schematic ─────────────────────────────────────────────────────
          const ppt = Math.max(2, Math.round(zoom * 10))
          if (mapFile) {
            mapFileRef.current = mapFile
            renderSchematicScaled(base, mapFile, ppt)
          } else {
            // Blank grid when no binary is available yet (new map)
            const w = mapWidth  * ppt
            const h = mapHeight * ppt
            base.width  = w
            base.height = h
            const ctx = base.getContext('2d')!
            ctx.fillStyle = '#1a1a2e'
            ctx.fillRect(0, 0, w, h)
            if (ppt >= 3) {
              ctx.strokeStyle = 'rgba(255,255,255,0.07)'
              ctx.lineWidth = 0.5
              for (let x = 0; x <= mapWidth;  x++) { ctx.beginPath(); ctx.moveTo(x * ppt, 0); ctx.lineTo(x * ppt, h); ctx.stroke() }
              for (let y = 0; y <= mapHeight; y++) { ctx.beginPath(); ctx.moveTo(0, y * ppt); ctx.lineTo(w, y * ppt); ctx.stroke() }
            }
          }
          const pptFinal = Math.max(2, Math.round(zoom * 10))
          coordState.current = {
            mode: 'schematic',
            scale: 1,
            pixPerTile: pptFinal,
            originX: 0, originY: 0,
            canvasW: base.width, canvasH: base.height,
            mapW: mapWidth, mapH: mapHeight,
          }
        }

        if (!cancelled) {
          setStatusMsg(null)
          setLoading(false)
          setRenderTick(n => n + 1)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Render failed')
          setLoading(false)
          setStatusMsg(null)
        }
      }
    })()

    return () => { cancelled = true }
  }, [mapId, mapWidth, mapHeight, mapDirectory, clientPath, zoom])

  // ── Overlay draw ────────────────────────────────────────────────────────────
  // Runs whenever base is re-rendered OR markers/selection/hover changes.

  useEffect(() => {
    const overlay = overlayRef.current
    const cs      = coordState.current
    if (!overlay || !cs) return

    overlay.width  = cs.canvasW
    overlay.height = cs.canvasH
    const ctx = overlay.getContext('2d')!
    ctx.clearRect(0, 0, cs.canvasW, cs.canvasH)

    // Passability overlay
    if (showPassability && mapFileRef.current && sotpRef.current) {
      const mf   = mapFileRef.current
      const sotp = sotpRef.current
      ctx.save()
      for (let ty = 0; ty < cs.mapH; ty++) {
        for (let tx = 0; tx < cs.mapW; tx++) {
          const tile = mf.tiles[ty * cs.mapW + tx]
          if (!tile) continue
          // Skip completely empty tiles (no background and no foreground stc)
          if (tile.background === 0 && tile.leftForeground <= 0 && tile.rightForeground <= 0) continue
          const passable = isTilePassable(tile.leftForeground, tile.rightForeground, sotp)
          if (passable) continue  // leave passable tiles unshaded
          const { x, y } = tileCentre(tx, ty, cs)
          pathTile(ctx, x, y, cs)
          ctx.fillStyle = 'rgba(220,50,50,0.38)'
          ctx.fill()
        }
      }
      ctx.restore()
    }

    // Grid overlay
    if (showGrid) {
      ctx.save()
      ctx.strokeStyle = '#FF00FF'
      ctx.lineWidth   = 0.5
      for (let ty = 0; ty < cs.mapH; ty++) {
        for (let tx = 0; tx < cs.mapW; tx++) {
          const { x, y } = tileCentre(tx, ty, cs)
          pathTile(ctx, x, y, cs)
          ctx.stroke()
        }
      }
      ctx.restore()
    }

    // Hover highlight
    if (hoverTile) {
      const { x, y } = tileCentre(hoverTile.tx, hoverTile.ty, cs)
      pathTile(ctx, x, y, cs)
      ctx.fillStyle = 'rgba(255,255,255,0.13)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // Markers
    const r = cs.mode === 'iso'
      ? Math.max(5, 9 * cs.scale)
      : Math.max(2, cs.pixPerTile * 0.38)

    for (const m of markers) {
      const { x, y } = tileCentre(m.x, m.y, cs)
      const style   = MARKER[m.kind]
      const isSel   = selectedMarker?.kind === m.kind && selectedMarker.index === m.index

      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle   = isSel ? style.stroke : style.fill
      ctx.fill()
      ctx.strokeStyle = isSel ? 'white'       : style.stroke
      ctx.lineWidth   = isSel ? 2 : 1
      ctx.stroke()

      if (r >= 5) {
        ctx.fillStyle     = 'white'
        ctx.font          = `bold ${Math.max(8, Math.round(r * 1.1))}px sans-serif`
        ctx.textAlign     = 'center'
        ctx.textBaseline  = 'middle'
        ctx.fillText(style.label, x, y)
      }
    }
  }, [renderTick, markers, selectedMarker, hoverTile, showPassability, showGrid])

  // ── Event helpers ───────────────────────────────────────────────────────────

  const eventToTile = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const cs      = coordState.current
    const overlay = overlayRef.current
    if (!cs || !overlay) return null
    const rect = overlay.getBoundingClientRect()
    const { tx, ty } = screenToTile(e.clientX - rect.left, e.clientY - rect.top, cs)
    if (tx < 0 || ty < 0 || tx >= cs.mapW || ty >= cs.mapH) return null
    return { tx, ty }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    setHoverTile(eventToTile(e))
  }, [eventToTile])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const tile = eventToTile(e)
    if (!tile) return
    // Marker hit wins over place
    const hit = markers.find(m => m.x === tile.tx && m.y === tile.ty)
    if (hit && onMarkerClick) { onMarkerClick(hit.kind, hit.index); return }
    if (onTileClick) onTileClick(tile.tx, tile.ty)
  }, [eventToTile, markers, onMarkerClick, onTileClick])

  const cursor = placeMode ? 'crosshair' : (markers.length > 0 || onMarkerClick) ? 'pointer' : 'default'

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ position: 'relative', overflow: 'auto', ...sx }}>
      {/* Status overlay */}
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
      {error && (
        <Box sx={{ position: 'absolute', top: 6, left: 6, zIndex: 10, pointerEvents: 'none' }}>
          <Typography variant="caption" color="error" sx={{ bgcolor: 'rgba(0,0,0,0.75)', px: 0.75, py: 0.25, borderRadius: 0.5 }}>
            {error}
          </Typography>
        </Box>
      )}
      {/* Stacked canvases — base (map) + overlay (markers/hover) */}
      <Box sx={{ display: 'inline-block', position: 'relative', minWidth: 40, minHeight: 40 }}>
        <canvas ref={baseRef} style={{ display: 'block', imageRendering: 'pixelated' }} />
        <canvas
          ref={overlayRef}
          style={{ position: 'absolute', top: 0, left: 0, display: 'block', cursor }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverTile(null)}
          onClick={handleClick}
        />
      </Box>
    </Box>
  )
}
