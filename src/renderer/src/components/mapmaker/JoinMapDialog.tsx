import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Slider,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from '@mui/material'
import ZoomInIcon from '@mui/icons-material/ZoomIn'
import ZoomOutIcon from '@mui/icons-material/ZoomOut'
import { MapFile } from '@eriscorp/dalib-ts'
import DimensionPickerDialog from '../catalog/DimensionPickerDialog'
import { filenameFromPath } from '../../utils/format'
import { mapFilesDir } from '../../utils/pickerDefaults'
import {
  ISO_FOREGROUND_PAD,
  ISO_HTILE_W,
  ISO_VTILE_STEP,
  isoCanvasSize,
  loadMapAssets,
  renderMap
} from '../../utils/mapRenderer'
import {
  joinLayout,
  joinMaps,
  offsetPresets,
  offsetRange,
  type JoinSide
} from '../../utils/mapJoin'
import { MAX_MAP_DIM } from './mapDim'

/** A map already open in another tab, offered without a dimension prompt. */
export interface JoinSource {
  id: string
  label: string
  mapFile: MapFile
}

/**
 * What the composite becomes.
 *
 * `new` is the default because it is the non-destructive one: a fresh map has
 * no XML yet, so there is nothing for the shifted coordinates to contradict.
 * `join` keeps the current tab's identity and file, which is what makes the
 * existing map's warps a problem worth warning about.
 */
export type JoinResultMode = 'new' | 'join'

interface Props {
  open: boolean
  /** The active tab's map — the one being joined *to*. */
  mapFile: MapFile
  sources: JoinSource[]
  clientPath: string | null
  onJoin: (joined: MapFile, mode: JoinResultMode) => void
  onClose: () => void
  onStatus: (msg: string) => void
}

const SIDE_LABELS: { value: JoinSide; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'right', label: 'Right' }
]

/** Practical client limit; above this a map renders but tends to misbehave. */
const WARN_DIM = 255

/** The "browse…" action row. */
const BROWSE = '__browse__'
/** What the field shows once a browsed file has been sized and accepted — a
 *  separate value so the field reads as the filename, not as "Browse…". */
const BROWSED = '__browsed__'
/** Long enough that dragging the offset slider doesn't queue a render per tick. */
const PREVIEW_DEBOUNCE_MS = 120

/** Zoom bounds. 1 is native tile size; a preview never needs to magnify past it. */
const MIN_ZOOM = 0.05
const MAX_ZOOM = 1
const ZOOM_STEP = 1.25
/** Breathing room so the fitted map isn't flush against the viewport edge. */
const FIT_PAD_PX = 16

/**
 * Screen position of the lattice point at the top corner of tile (tx, ty).
 * `tileToScreen` returns diamond *centers*; region outlines need the corners.
 */
function latticePoint(
  tx: number,
  ty: number,
  originX: number,
  originY: number,
  scale: number
): { x: number; y: number } {
  return {
    x: originX * scale + (tx - ty) * ISO_HTILE_W * scale,
    y: originY * scale + (tx + ty) * ISO_VTILE_STEP * scale
  }
}

const JoinMapDialog: React.FC<Props> = ({
  open,
  mapFile,
  sources,
  clientPath,
  onJoin,
  onClose,
  onStatus
}) => {
  const [sourceId, setSourceId] = useState('')
  const [other, setOther] = useState<MapFile | null>(null)
  const [otherLabel, setOtherLabel] = useState('')
  const [side, setSide] = useState<JoinSide>('right')
  const [offset, setOffset] = useState(0)
  const [mode, setMode] = useState<JoinResultMode>('new')
  const [joining, setJoining] = useState(false)
  const [pending, setPending] = useState<{ filename: string; fileBuffer: Uint8Array } | null>(null)
  /** null means "fit to the viewport"; a number is an explicit user zoom. */
  const [zoom, setZoom] = useState<number | null>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const previewRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Reset on every open: a stale pick from last time is never what's wanted.
  useEffect(() => {
    if (!open) return
    setSourceId('')
    setOther(null)
    setOtherLabel('')
    setSide('right')
    setOffset(0)
    setPending(null)
    setZoom(null)
    setMode('new')
  }, [open])

  const range = other ? offsetRange(side, mapFile, other) : { min: 0, max: 0 }
  const presets = other ? offsetPresets(side, mapFile, other) : { start: 0, center: 0, end: 0 }

  // A pick or a side change re-centers: the previous offset was measured
  // against a different seam and is rarely meaningful against the new one.
  useEffect(() => {
    if (other) setOffset(offsetPresets(side, mapFile, other).center)
  }, [other, side, mapFile])

  // Layout and composite are derived together so the preview can never render
  // a composite against a layout from a different offset.
  const { layout, composite } = useMemo(() => {
    if (!other) return { layout: null, composite: null }
    const l = joinLayout(side, mapFile, other, offset)
    return { layout: l, composite: joinMaps(mapFile, other, l) }
  }, [mapFile, other, side, offset])

  const tooBig = !!layout && (layout.width > MAX_MAP_DIM || layout.height > MAX_MAP_DIM)
  const oversized = !!layout && !tooBig && (layout.width > WARN_DIM || layout.height > WARN_DIM)

  // ── Zoom ───────────────────────────────────────────────────────────────────

  // Track the viewport so "fit" stays true when the dialog is resized.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) =>
      setViewport({ w: entry.contentRect.width, h: entry.contentRect.height })
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [open])

  const fitScale = useMemo(() => {
    if (!composite || viewport.w === 0) return 0.25
    const { w, h } = isoCanvasSize(composite.width, composite.height, 1)
    const fit = Math.min(MAX_ZOOM, (viewport.w - FIT_PAD_PX) / w, (viewport.h - FIT_PAD_PX) / h)
    return Math.max(MIN_ZOOM, fit)
  }, [composite, viewport])

  const scale = zoom ?? fitScale

  // Picking a different map or side reframes the whole preview, so drop back to
  // fit. Nudging the offset does not — that would fight a deliberate zoom while
  // the user is lining the seam up, which is exactly when zoom matters.
  useEffect(() => {
    setZoom(null)
  }, [other, side])

  const applyZoom = useCallback(
    (next: number) => setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next))),
    []
  )

  // ── Pan ────────────────────────────────────────────────────────────────────

  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    const el = scrollRef.current
    if (!el) return
    el.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const el = scrollRef.current
    if (!el || !drag.current) return
    el.scrollLeft = drag.current.left - (e.clientX - drag.current.x)
    el.scrollTop = drag.current.top - (e.clientY - drag.current.y)
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>): void => {
    scrollRef.current?.releasePointerCapture(e.pointerId)
    drag.current = null
  }

  // ── Preview ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas || !composite || !layout || !other) return
    let cancelled = false

    const draw = async (): Promise<void> => {
      const W = composite.width
      const H = composite.height
      const { w: pw, h: ph } = isoCanvasSize(W, H, scale)
      canvas.width = pw
      canvas.height = ph
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, pw, ph)

      // The composite *is* the output, so previewing it needs no compositing
      // maths — only a tint marking which half is the incoming map.
      if (clientPath) {
        try {
          const assets = await loadMapAssets(clientPath)
          if (cancelled) return
          await renderMap(canvas, composite, assets, { scale })
        } catch {
          /* no assets — the ghost outline over black still reads */
        }
      }
      if (cancelled) return

      const originX = H * ISO_HTILE_W
      const corner = (tx: number, ty: number): { x: number; y: number } =>
        latticePoint(tx, ty, originX, ISO_FOREGROUND_PAD, scale)

      const { otherX: ox, otherY: oy } = layout
      const corners = [
        corner(ox, oy),
        corner(ox + other.width, oy),
        corner(ox + other.width, oy + other.height),
        corner(ox, oy + other.height)
      ]
      ctx.beginPath()
      ctx.moveTo(corners[0].x, corners[0].y)
      for (const c of corners.slice(1)) ctx.lineTo(c.x, c.y)
      ctx.closePath()
      ctx.fillStyle = 'rgba(90,170,255,0.25)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(120,200,255,0.95)'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.stroke()
      ctx.setLineDash([])
    }

    const timer = setTimeout(draw, PREVIEW_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [composite, layout, other, clientPath, scale])

  // ── Source selection ───────────────────────────────────────────────────────

  const handleBrowse = useCallback(async () => {
    const path = await window.api.openFile(
      [{ name: 'DA Map Files', extensions: ['map'] }],
      mapFilesDir()
    )
    if (!path) return
    try {
      const buf = await window.api.readFile(path)
      // .map binaries carry no dimensions, so the file has to be sized before
      // it can be joined — the same picker the Open flow uses.
      setPending({ filename: filenameFromPath(path), fileBuffer: new Uint8Array(buf) })
    } catch (err) {
      onStatus(`Could not read map: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [onStatus])

  const handleSourceChange = (value: string): void => {
    if (value === BROWSE) {
      handleBrowse()
      return
    }
    const source = sources.find((s) => s.id === value)
    if (!source) return
    setSourceId(value)
    setOther(source.mapFile)
    setOtherLabel(source.label)
  }

  const handleDimConfirm = (width: number, height: number): void => {
    if (!pending) return
    setOther(MapFile.fromBuffer(pending.fileBuffer, width, height))
    setOtherLabel(pending.filename)
    setSourceId(BROWSED)
    setPending(null)
  }

  const handleJoin = (): void => {
    if (!composite || tooBig) return
    setJoining(true)
    try {
      onJoin(composite, mode)
      onStatus(
        mode === 'new'
          ? `New map from ${otherLabel} joined to the ${side} — ${composite.width}×${composite.height}`
          : `Joined ${otherLabel} to the ${side} — ${composite.width}×${composite.height}`
      )
      onClose()
    } catch (err) {
      onStatus(`Join failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setJoining(false)
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="xl"
        fullWidth
        // Lining a seam up is the whole task, so the preview gets as much of
        // the screen as the dialog can reasonably take.
        slotProps={{ paper: { sx: { height: '92vh' } } }}
      >
        <DialogTitle>Join Map</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            Current map: {mapFile.width} × {mapFile.height} tiles
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexShrink: 0 }}>
            <TextField
              select
              size="small"
              label="Map to join"
              value={sourceId}
              onChange={(e) => handleSourceChange(e.target.value)}
              sx={{ flex: 1 }}
              helperText={other ? `${otherLabel} — ${other.width} × ${other.height}` : ' '}
            >
              {sources.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.label}
                </MenuItem>
              ))}
              {sourceId === BROWSED && (
                <MenuItem value={BROWSED} sx={{ display: 'none' }}>
                  {otherLabel}
                </MenuItem>
              )}
              <MenuItem value={BROWSE}>Browse for a .map file…</MenuItem>
            </TextField>

            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                Attach to side
              </Typography>
              <ToggleButtonGroup
                value={side}
                exclusive
                onChange={(_, v) => v && setSide(v)}
                size="small"
              >
                {SIDE_LABELS.map((s) => (
                  <ToggleButton key={s.value} value={s.value}>
                    {s.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 3, flex: 1, minHeight: 0 }}>
            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <Box
                ref={scrollRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                sx={{
                  flex: 1,
                  minHeight: 0,
                  overflow: 'auto',
                  bgcolor: '#000',
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  cursor: 'grab',
                  '&:active': { cursor: 'grabbing' },
                  // Centres a map smaller than the viewport; a larger one just
                  // scrolls from the top-left.
                  display: 'grid',
                  placeItems: 'center'
                }}
              >
                <canvas
                  ref={previewRef}
                  style={{ imageRendering: 'pixelated', display: 'block' }}
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pt: 1 }}>
                <Tooltip title="Zoom out">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => applyZoom(scale / ZOOM_STEP)}
                      disabled={!composite || scale <= MIN_ZOOM}
                    >
                      <ZoomOutIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Slider
                  size="small"
                  value={scale}
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step={0.01}
                  disabled={!composite}
                  onChange={(_, v) => applyZoom(v as number)}
                  sx={{ mx: 1, maxWidth: 220 }}
                />
                <Tooltip title="Zoom in">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => applyZoom(scale * ZOOM_STEP)}
                      disabled={!composite || scale >= MAX_ZOOM}
                    >
                      <ZoomInIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', minWidth: 44, textAlign: 'right' }}
                >
                  {Math.round(scale * 100)}%
                </Typography>
                <Button size="small" onClick={() => setZoom(null)} disabled={zoom === null}>
                  Fit
                </Button>
                <Button size="small" onClick={() => applyZoom(1)}>
                  1:1
                </Button>
                <Typography variant="caption" sx={{ color: 'text.secondary', ml: 1 }}>
                  Drag to pan
                </Typography>
              </Box>
            </Box>
            <Box sx={{ width: 340, flexShrink: 0, overflow: 'auto' }}>
              {other && layout ? (
                <>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                    Result: {layout.width} × {layout.height} tiles
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                    The tinted region is the incoming map.
                  </Typography>

                  <Typography variant="caption" sx={{ display: 'block', mt: 2 }}>
                    Offset along the seam
                  </Typography>
                  <Slider
                    size="small"
                    value={offset}
                    min={range.min}
                    max={range.max}
                    onChange={(_, v) => setOffset(v as number)}
                    valueLabelDisplay="auto"
                  />
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button size="small" onClick={() => setOffset(presets.start)}>
                      Start
                    </Button>
                    <Button size="small" onClick={() => setOffset(presets.center)}>
                      Center
                    </Button>
                    <Button size="small" onClick={() => setOffset(presets.end)}>
                      End
                    </Button>
                  </Box>

                  {tooBig && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                      The result exceeds {MAX_MAP_DIM} tiles on one axis.
                    </Alert>
                  )}
                  {oversized && (
                    <Alert severity="warning" sx={{ mt: 2 }}>
                      Maps larger than {WARN_DIM} tiles on an axis are outside what the client
                      normally handles.
                    </Alert>
                  )}

                  <Typography variant="caption" sx={{ display: 'block', mt: 3 }}>
                    Result
                  </Typography>
                  <ToggleButtonGroup
                    value={mode}
                    exclusive
                    fullWidth
                    onChange={(_, v) => v && setMode(v)}
                    size="small"
                    sx={{ mt: 0.5 }}
                  >
                    <ToggleButton value="new">Save as new map</ToggleButton>
                    <ToggleButton value="join">Join into current</ToggleButton>
                  </ToggleButtonGroup>
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.secondary', display: 'block', mt: 1 }}
                  >
                    {mode === 'new'
                      ? 'Opens in a new tab. Both source maps are left as they are.'
                      : 'Replaces this tab’s map, keeping its file. Ctrl+Z will not undo it.'}
                  </Typography>

                  {/* Only a join has an existing map XML to disagree with: a new
                      map has no warps yet, so nothing can be pointing anywhere. */}
                  {mode === 'join' && (
                    <Alert severity="info" sx={{ mt: 2 }}>
                      Tiles only — this map’s warps and other XML are not rewritten, so anything
                      whose coordinates the join moved needs re-pointing.
                    </Alert>
                  )}
                </>
              ) : (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Pick a map to join and it will be ghosted onto the chosen side.
                </Typography>
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={joining}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleJoin}
            disabled={joining || !composite || tooBig}
            startIcon={joining ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            {mode === 'new' ? 'Save as New Map' : 'Join'}
          </Button>
        </DialogActions>
      </Dialog>

      {pending && (
        <DimensionPickerDialog
          open
          filename={pending.filename}
          fileBuffer={pending.fileBuffer}
          clientPath={clientPath}
          onConfirm={handleDimConfirm}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  )
}

export default JoinMapDialog
