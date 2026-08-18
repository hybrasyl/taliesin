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
import { MapFile, type SotpFile } from '@eriscorp/dalib-ts'
import {
  loadMapAssets,
  renderMap,
  renderSchematicScaled,
  isoCanvasSize,
  tileToScreen,
  screenToTileCoords,
  isTilePassable,
  ISO_HTILE_W,
  ISO_VTILE_STEP
} from '../../utils/mapRenderer'
import type { SxProps } from '@mui/material'

// ── Public types ──────────────────────────────────────────────────────────────

export type MarkerKind = 'warp' | 'worldwarp' | 'npc' | 'sign' | 'reactor'

export interface MapMarker {
  kind: MarkerKind
  index: number
  x: number // tile X
  y: number // tile Y
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
  onTileClick?: (tx: number, ty: number, mods: ClickModifiers) => void
  /**
   * Every marker on the clicked tile, not the first one.
   *
   * The hit test used to be `markers.find(...)`, which returns one marker per
   * tile. Reactors stack on the server — `Dictionary<(byte X, byte Y),
   * Dictionary<Guid, Reactor>>` — so a second reactor on a tile drew under the
   * first and could never be clicked (HTOO-442). The caller decides what to do
   * with more than one; `anchor` is where to put a menu if it wants one.
   */
  onMarkerClick?: (hits: MapMarker[], anchor: { x: number; y: number }) => void
  /**
   * Commit a dragged marker at its new tile. Providing this turns dragging on
   * (HTOO-445); the canvas never moves anything itself.
   *
   * `mods.shift` means the author asked for a copy rather than a move
   * (HTOO-448). The canvas does not know the difference — it reports which
   * gesture was made and the caller decides what it means, as it does for a
   * shift-click on an empty tile.
   */
  onMarkerMove?: (marker: MapMarker, tx: number, ty: number, mods: ClickModifiers) => void
  onHoverTile?: (tile: { tx: number; ty: number } | null) => void
  sx?: SxProps
}

/** Which modifier keys were held. Shift duplicates the last placed node. */
export interface ClickModifiers {
  shift: boolean
}

/** How far the pointer travels before a press becomes a drag, in tiles. */
const DRAG_TILE_THRESHOLD = 1

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

/**
 * Marker colours, and the letter drawn inside each.
 *
 * Hardcoded hex rather than theme-derived, because these are drawn onto map art
 * and have to stay legible on all six themes — so a change here needs checking
 * against all six, not just the one in front of you.
 *
 * Map warps and world warps used to share a `warp` entry, so every warp drew
 * blue with a `W` whatever its target, while the legend claimed two colours it
 * never drew (HTOO-338). They are separate kinds now: blue `M` for a map warp,
 * red `W` for a world warp. The red is Material red 600 rather than the theme's
 * `error.main` (`#ff0000`), so it reads as a category and not as a fault.
 *
 * `MARKER_COLOR` is exported so the legend and the item lists cite these values
 * instead of repeating them — the legend being wrong is how this was found.
 */
export const MARKER: Record<MarkerKind, { fill: string; stroke: string; label: string }> = {
  warp: { fill: 'rgba(33,150,243,0.85)', stroke: '#2196f3', label: 'M' },
  worldwarp: { fill: 'rgba(229,57,53,0.85)', stroke: '#e53935', label: 'W' },
  npc: { fill: 'rgba(76,175,80,0.85)', stroke: '#4caf50', label: 'N' },
  sign: { fill: 'rgba(255,193,7,0.85)', stroke: '#ffc107', label: 'S' },
  reactor: { fill: 'rgba(156,39,176,0.85)', stroke: '#9c27b0', label: 'R' }
}

/** The colour each marker kind is drawn in. The legend's single source. */
export const MARKER_COLOR: Record<MarkerKind, string> = {
  warp: MARKER.warp.stroke,
  worldwarp: MARKER.worldwarp.stroke,
  npc: MARKER.npc.stroke,
  sign: MARKER.sign.stroke,
  reactor: MARKER.reactor.stroke
}

// ── Helper: tile → screen centre ──────────────────────────────────────────────

function tileCentre(tx: number, ty: number, cs: CoordState): { x: number; y: number } {
  if (cs.mode === 'iso') {
    return tileToScreen(tx, ty, cs.originX, cs.originY, cs.scale)
  }
  return {
    x: tx * cs.pixPerTile + cs.pixPerTile / 2,
    y: ty * cs.pixPerTile + cs.pixPerTile / 2
  }
}

// ── Helper: screen → tile ─────────────────────────────────────────────────────

function screenToTile(sx: number, sy: number, cs: CoordState): { tx: number; ty: number } {
  if (cs.mode === 'iso') {
    return screenToTileCoords(sx, sy, cs.originX, cs.originY, cs.scale)
  }
  return {
    tx: Math.floor(sx / cs.pixPerTile),
    ty: Math.floor(sy / cs.pixPerTile)
  }
}

// ── Helper: draw diamond (iso) or square (schematic) path at centre ───────────

function pathTile(ctx: CanvasRenderingContext2D, cx: number, cy: number, cs: CoordState) {
  if (cs.mode === 'iso') {
    const hw = ISO_HTILE_W * cs.scale
    const hv = ISO_VTILE_STEP * cs.scale
    ctx.beginPath()
    ctx.moveTo(cx, cy - hv)
    ctx.lineTo(cx + hw, cy)
    ctx.lineTo(cx, cy + hv)
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
  onMarkerMove,
  onHoverTile,
  sx
}: MapRenderCanvasProps) {
  const baseRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const coordState = useRef<CoordState | null>(null)
  const mapFileRef = useRef<MapFile | null>(null)
  const sotpRef = useRef<SotpFile | null>(null)

  const [renderTick, setRenderTick] = useState(0) // bumped after base render to trigger overlay
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hoverTile, setHoverTile] = useState<{ tx: number; ty: number } | null>(null)

  /**
   * The drag state machine (HTOO-445), the same shape the Map Maker canvas runs
   * for tile selections: a press records what was grabbed and where, movement
   * past a tile turns it into a drag, and release commits.
   *
   * `press` is a ref because it changes on every mouse move and nothing draws
   * from it; `drag` is state because the overlay draws the ghost from it.
   */
  const press = useRef<{ marker: MapMarker; from: { tx: number; ty: number } } | null>(null)
  const [drag, setDrag] = useState<{
    marker: MapMarker
    to: { tx: number; ty: number }
    /** Shift held: the drop copies instead of moving. Drives the cursor. */
    copy: boolean
  } | null>(null)
  /** Set on a release that committed a move, so the click it precedes is dropped. */
  const swallowClick = useRef(false)

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
    sotpRef.current = null
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
          const assets = await loadMapAssets(clientPath, (msg) => {
            if (!cancelled) setStatusMsg(msg)
          })
          if (cancelled) return

          setStatusMsg('Rendering…')
          const { w, h } = isoCanvasSize(mapWidth, mapHeight, zoom)
          base.width = w
          base.height = h
          await renderMap(base, mapFile, assets, { scale: zoom }, (msg) => {
            if (!cancelled) setStatusMsg(msg)
          })
          if (cancelled) return

          mapFileRef.current = mapFile
          sotpRef.current = assets.sotp

          coordState.current = {
            mode: 'iso',
            scale: zoom,
            pixPerTile: 0,
            originX: mapHeight * ISO_HTILE_W,
            originY: 512, // ISO_FOREGROUND_PAD
            canvasW: w,
            canvasH: h,
            mapW: mapWidth,
            mapH: mapHeight
          }
        } else {
          // ── Schematic ─────────────────────────────────────────────────────
          const ppt = Math.max(2, Math.round(zoom * 10))
          if (mapFile) {
            mapFileRef.current = mapFile
            renderSchematicScaled(base, mapFile, ppt)
          } else {
            // Blank grid when no binary is available yet (new map)
            const w = mapWidth * ppt
            const h = mapHeight * ppt
            base.width = w
            base.height = h
            const ctx = base.getContext('2d')!
            ctx.fillStyle = '#1a1a2e'
            ctx.fillRect(0, 0, w, h)
            if (ppt >= 3) {
              ctx.strokeStyle = 'rgba(255,255,255,0.07)'
              ctx.lineWidth = 0.5
              for (let x = 0; x <= mapWidth; x++) {
                ctx.beginPath()
                ctx.moveTo(x * ppt, 0)
                ctx.lineTo(x * ppt, h)
                ctx.stroke()
              }
              for (let y = 0; y <= mapHeight; y++) {
                ctx.beginPath()
                ctx.moveTo(0, y * ppt)
                ctx.lineTo(w, y * ppt)
                ctx.stroke()
              }
            }
          }
          coordState.current = {
            mode: 'schematic',
            scale: 1,
            pixPerTile: ppt,
            originX: 0,
            originY: 0,
            canvasW: base.width,
            canvasH: base.height,
            mapW: mapWidth,
            mapH: mapHeight
          }
        }

        if (!cancelled) {
          setStatusMsg(null)
          setLoading(false)
          setRenderTick((n) => n + 1)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Render failed')
          setLoading(false)
          setStatusMsg(null)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [mapId, mapWidth, mapHeight, mapDirectory, clientPath, zoom])

  /** Escape abandons a drag and leaves the marker where it was. */
  useEffect(() => {
    if (!drag) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      // Stop the page's own Escape handler from also disarming placement mode:
      // one Escape should undo one thing.
      e.stopPropagation()
      press.current = null
      swallowClick.current = true
      setDrag(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [drag])

  // ── Overlay draw ────────────────────────────────────────────────────────────
  // Runs whenever base is re-rendered OR markers/selection/hover changes.

  useEffect(() => {
    const overlay = overlayRef.current
    const cs = coordState.current
    if (!overlay || !cs) return

    overlay.width = cs.canvasW
    overlay.height = cs.canvasH
    const ctx = overlay.getContext('2d')!
    ctx.clearRect(0, 0, cs.canvasW, cs.canvasH)

    // Passability overlay
    if (showPassability && mapFileRef.current && sotpRef.current) {
      const mf = mapFileRef.current
      const sotp = sotpRef.current
      ctx.save()
      for (let ty = 0; ty < cs.mapH; ty++) {
        for (let tx = 0; tx < cs.mapW; tx++) {
          const tile = mf.tiles[ty * cs.mapW + tx]
          if (!tile) continue
          // Skip completely empty tiles (no background and no foreground stc)
          if (tile.background === 0 && tile.leftForeground <= 0 && tile.rightForeground <= 0)
            continue
          const passable = isTilePassable(tile.leftForeground, tile.rightForeground, sotp)
          if (passable) continue // leave passable tiles unshaded
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
      ctx.lineWidth = 0.5
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
    const r = cs.mode === 'iso' ? Math.max(5, 9 * cs.scale) : Math.max(2, cs.pixPerTile * 0.38)

    /**
     * How many markers share each tile.
     *
     * A stacked tile drew exactly like a single one, so the author had no way
     * to know a second node was under the first (HTOO-442). The count goes in a
     * badge, so it is visible before the click rather than after it.
     */
    const perTile = new Map<string, number>()
    for (const m of markers) {
      const key = `${m.x},${m.y}`
      perTile.set(key, (perTile.get(key) ?? 0) + 1)
    }

    const drawMarker = (m: MapMarker, x: number, y: number, sel: boolean): void => {
      const style = MARKER[m.kind]
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = sel ? style.stroke : style.fill
      ctx.fill()
      ctx.strokeStyle = sel ? 'white' : style.stroke
      ctx.lineWidth = sel ? 2 : 1
      ctx.stroke()

      if (r >= 5) {
        ctx.fillStyle = 'white'
        ctx.font = `bold ${Math.max(8, Math.round(r * 1.1))}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(style.label, x, y)
      }
    }

    for (const m of markers) {
      const { x, y } = tileCentre(m.x, m.y, cs)
      const isSel = selectedMarker?.kind === m.kind && selectedMarker.index === m.index
      drawMarker(m, x, y, isSel)
    }

    // Stack badges, drawn after every marker so no marker covers one.
    if (r >= 5) {
      for (const [key, count] of perTile) {
        if (count < 2) continue
        const [txs, tys] = key.split(',')
        const { x, y } = tileCentre(Number(txs), Number(tys), cs)
        const bx = x + r * 0.85
        const by = y - r * 0.85
        const br = Math.max(4, r * 0.6)
        ctx.beginPath()
        ctx.arc(bx, by, br, 0, Math.PI * 2)
        ctx.fillStyle = '#212121'
        ctx.fill()
        ctx.strokeStyle = 'white'
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.fillStyle = 'white'
        ctx.font = `bold ${Math.max(7, Math.round(br * 1.2))}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(count), bx, by)
      }
    }

    // The dragged marker at the tile it would land on. The original stays put
    // until the drop commits, so the move is a comparison and not a leap.
    if (drag) {
      const { x, y } = tileCentre(drag.to.tx, drag.to.ty, cs)
      ctx.save()
      ctx.globalAlpha = 0.55
      pathTile(ctx, x, y, cs)
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 1
      ctx.stroke()
      drawMarker(drag.marker, x, y, true)
      ctx.restore()
    }
  }, [renderTick, markers, selectedMarker, hoverTile, showPassability, showGrid, drag])

  // ── Event helpers ───────────────────────────────────────────────────────────

  const eventToTile = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const cs = coordState.current
    const overlay = overlayRef.current
    if (!cs || !overlay) return null
    const rect = overlay.getBoundingClientRect()
    const { tx, ty } = screenToTile(e.clientX - rect.left, e.clientY - rect.top, cs)
    if (tx < 0 || ty < 0 || tx >= cs.mapW || ty >= cs.mapH) return null
    return { tx, ty }
  }, [])

  const onHoverTileRef = useRef(onHoverTile)
  onHoverTileRef.current = onHoverTile

  /** Every marker on a tile, topmost kind first is not meaningful — order is stable. */
  const hitsAt = useCallback(
    (tx: number, ty: number) => markers.filter((m) => m.x === tx && m.y === ty),
    [markers]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Left button only, and only when the caller accepts a move.
      if (e.button !== 0 || !onMarkerMove) return
      const tile = eventToTile(e)
      if (!tile) return
      const hits = hitsAt(tile.tx, tile.ty)
      // A stacked tile is ambiguous: which of them did the author grab? Leave
      // it to the click, which opens a menu, rather than guessing.
      if (hits.length !== 1) return
      press.current = { marker: hits[0]!, from: tile }
    },
    [eventToTile, hitsAt, onMarkerMove]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const tile = eventToTile(e)
      setHoverTile(tile)
      onHoverTileRef.current?.(tile)

      const p = press.current
      if (!p || !tile) return
      const travelled =
        Math.abs(tile.tx - p.from.tx) + Math.abs(tile.ty - p.from.ty) >= DRAG_TILE_THRESHOLD
      if (!travelled && !drag) return
      setDrag({ marker: p.marker, to: tile, copy: e.shiftKey })
    },
    [eventToTile, drag]
  )

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const p = press.current
      press.current = null
      if (!p || !drag) return
      setDrag(null)
      const moved = drag.to.tx !== p.from.tx || drag.to.ty !== p.from.ty
      // A shift-drop on the tile it started from is not a copy. It would put a
      // second node on an occupied tile, which for a warp is a lost warp.
      if (!moved) return
      // The click that follows this release would toggle the selection off,
      // which reads as the move having failed.
      swallowClick.current = true
      // Read at release, not from the drag state: the author can press or let go
      // of shift after the drag starts, and what they were holding when they
      // dropped is the answer.
      onMarkerMove?.(p.marker, drag.to.tx, drag.to.ty, { shift: e.shiftKey })
    },
    [drag, onMarkerMove]
  )

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (swallowClick.current) {
        swallowClick.current = false
        return
      }
      const tile = eventToTile(e)
      if (!tile) return
      // Marker hit wins over place
      const hits = hitsAt(tile.tx, tile.ty)
      if (hits.length > 0 && onMarkerClick) {
        onMarkerClick(hits, { x: e.clientX, y: e.clientY })
        return
      }
      if (onTileClick) onTileClick(tile.tx, tile.ty, { shift: e.shiftKey })
    },
    [eventToTile, hitsAt, onMarkerClick, onTileClick]
  )

  // A copy and a move must not look the same while the pointer is down.
  const cursor = drag
    ? drag.copy
      ? 'copy'
      : 'grabbing'
    : placeMode
      ? 'crosshair'
      : markers.length > 0 || onMarkerClick
        ? 'pointer'
        : 'default'

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ position: 'relative', overflow: 'auto', ...sx }}>
      {/* Status overlay */}
      {(loading || statusMsg) && (
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
          {loading && <CircularProgress size={12} />}
          {statusMsg && (
            <Typography
              variant="caption"
              sx={{ bgcolor: 'rgba(0,0,0,0.75)', px: 0.75, py: 0.25, borderRadius: 0.5 }}
            >
              {statusMsg}
            </Typography>
          )}
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
      {/* Stacked canvases — base (map) + overlay (markers/hover) */}
      <Box sx={{ display: 'inline-block', position: 'relative', minWidth: 40, minHeight: 40 }}>
        <canvas ref={baseRef} style={{ display: 'block', imageRendering: 'pixelated' }} />
        <canvas
          ref={overlayRef}
          style={{ position: 'absolute', top: 0, left: 0, display: 'block', cursor }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            setHoverTile(null)
            onHoverTileRef.current?.(null)
            // Leaving the canvas mid-drag abandons it. Committing to the last
            // tile inside the border would move the node somewhere the author
            // never pointed at.
            press.current = null
            setDrag(null)
          }}
          onClick={handleClick}
        />
      </Box>
    </Box>
  )
}
