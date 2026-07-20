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
  MenuItem,
  Slider,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material'
import { MapFile } from '@eriscorp/dalib-ts'
import DimensionPickerDialog from '../catalog/DimensionPickerDialog'
import { filenameFromPath } from '../../utils/format'
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

interface Props {
  open: boolean
  /** The active tab's map — the one being joined *to*. */
  mapFile: MapFile
  sources: JoinSource[]
  clientPath: string | null
  onJoin: (joined: MapFile, label: string) => void
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
const PREVIEW_PX = 560
/** Long enough that dragging the offset slider doesn't queue a render per tick. */
const PREVIEW_DEBOUNCE_MS = 120

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
  const [joining, setJoining] = useState(false)
  const [pending, setPending] = useState<{ filename: string; fileBuffer: Uint8Array } | null>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)

  // Reset on every open: a stale pick from last time is never what's wanted.
  useEffect(() => {
    if (!open) return
    setSourceId('')
    setOther(null)
    setOtherLabel('')
    setSide('right')
    setOffset(0)
    setPending(null)
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

  // ── Preview ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas || !composite || !layout || !other) return
    let cancelled = false

    const draw = async (): Promise<void> => {
      const W = composite.width
      const H = composite.height
      const scale = Math.min(0.5, PREVIEW_PX / ((W + H) * ISO_HTILE_W))
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
  }, [composite, layout, other, clientPath])

  // ── Source selection ───────────────────────────────────────────────────────

  const handleBrowse = useCallback(async () => {
    const path = await window.api.openFile([{ name: 'DA Map Files', extensions: ['map'] }])
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
      onJoin(composite, otherLabel)
      onStatus(`Joined ${otherLabel} to the ${side} — ${composite.width}×${composite.height}`)
      onClose()
    } catch (err) {
      onStatus(`Join failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setJoining(false)
    }
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>Join Map</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            Current map: {mapFile.width} × {mapFile.height} tiles
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
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

          <Box sx={{ display: 'flex', gap: 3 }}>
            <canvas
              ref={previewRef}
              style={{ imageRendering: 'pixelated', border: '1px solid', borderRadius: 4 }}
            />
            <Box sx={{ flex: 1 }}>
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
                  <Alert severity="info" sx={{ mt: 2 }}>
                    Tiles only — warps and other map XML are not rewritten, so anything pointing
                    into the incoming map needs its coordinates re-pointed.
                  </Alert>
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
            Join
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
