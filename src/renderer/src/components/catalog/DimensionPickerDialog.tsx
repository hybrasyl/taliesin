import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, MenuItem, Select, IconButton, Tooltip, CircularProgress
} from '@mui/material'
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import { MapFile } from 'dalib-ts'
import { loadMapAssets, renderMap } from '../../utils/mapRenderer'

interface DimPair {
  width: number
  height: number
  reasonable: boolean
}

interface Props {
  open: boolean
  filename: string
  fileBuffer: Uint8Array
  clientPath: string | null
  onConfirm: (width: number, height: number) => void
  onCancel: () => void
}

// ── Dimension factoring ───────────────────────────────────────────────────────

function factorDimensions(sizeBytes: number): DimPair[] {
  const totalTiles = sizeBytes / 6
  if (!Number.isInteger(totalTiles) || totalTiles <= 0) return []

  const pairs: DimPair[] = []
  for (let w = 1; w <= Math.sqrt(totalTiles); w++) {
    if (totalTiles % w === 0) {
      const h = totalTiles / w
      const r1 = isReasonable(w, h)
      pairs.push({ width: w, height: h, reasonable: r1 })
      if (w !== h) {
        pairs.push({ width: h, height: w, reasonable: r1 })
      }
    }
  }

  // Sort: reasonable first, then by squareness (smaller aspect ratio diff), then by width asc
  pairs.sort((a, b) => {
    if (a.reasonable !== b.reasonable) return a.reasonable ? -1 : 1
    const aDiff = Math.abs(a.width - a.height)
    const bDiff = Math.abs(b.width - b.height)
    if (aDiff !== bDiff) return aDiff - bDiff
    return a.width - b.width
  })

  return pairs
}

function isReasonable(w: number, h: number): boolean {
  return w >= 8 && h >= 8 && w <= 512 && h <= 512
}

function pairLabel(p: DimPair): string {
  return `${p.width} × ${p.height}`
}

// ── Schematic fallback ────────────────────────────────────────────────────────

const COLOR_VOID   = '#1a1a2e'
const COLOR_FLOOR  = '#2d5a3d'
const COLOR_OBJECT = '#8b4513'

function renderSchematic(canvas: HTMLCanvasElement, map: MapFile): void {
  const { width, height, tiles } = map
  const maxW = canvas.parentElement?.clientWidth  ?? 520
  const maxH = canvas.parentElement?.clientHeight ?? 420

  const scale = Math.max(1, Math.min(Math.floor(maxW / width), Math.floor(maxH / height)))
  canvas.width  = width  * scale
  canvas.height = height * scale

  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = tiles[y * width + x]!
      const hasObj = tile.leftForeground > 0 || tile.rightForeground > 0
      ctx.fillStyle = tile.background === 0 ? COLOR_VOID : hasObj ? COLOR_OBJECT : COLOR_FLOOR
      ctx.fillRect(x * scale, y * scale, scale, scale)
    }
  }
}

// ── Dialog ────────────────────────────────────────────────────────────────────

const DimensionPickerDialog: React.FC<Props> = ({
  open, filename, fileBuffer, clientPath, onConfirm, onCancel
}) => {
  const pairs = useMemo(() => factorDimensions(fileBuffer.length), [fileBuffer])
  const [index, setIndex] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rendering, setRendering] = useState(false)
  const [renderStatus, setRenderStatus] = useState<string | null>(null)

  const reasonablePairs = useMemo(() => pairs.filter((p) => p.reasonable), [pairs])
  const displayPairs = showAll ? pairs : (reasonablePairs.length > 0 ? reasonablePairs : pairs)

  // Reset index when dialog opens
  useEffect(() => {
    if (open) setIndex(0)
  }, [open, fileBuffer])

  const selected = displayPairs[index]

  const renderCanvas = useCallback((signal: { cancelled: boolean }) => {
    const canvas = canvasRef.current
    if (!canvas || !selected) return

    if (clientPath) {
      setRendering(true)
      setRenderStatus('Loading assets…')

      ;(async () => {
        try {
          const map = MapFile.fromBuffer(fileBuffer, selected.width, selected.height)
          const assets = await loadMapAssets(clientPath, (msg) => {
            if (!signal.cancelled) setRenderStatus(msg)
          })
          if (signal.cancelled) return

          // Compute scale to fit the canvas container
          const container = canvas.parentElement
          const maxW = (container?.clientWidth  ?? 520) - 2
          const maxH = (container?.clientHeight ?? 420) - 2
          const nativeW = (selected.width + selected.height) * 28 + 56
          const nativeH = (selected.width + selected.height) * 14 + 480
          const scale = Math.min(maxW / nativeW, maxH / nativeH, 1)

          setRenderStatus('Rendering…')
          await renderMap(canvas, map, assets, { scale }, (msg) => {
            if (!signal.cancelled) setRenderStatus(msg)
          })
          if (!signal.cancelled) { setRendering(false); setRenderStatus(null) }
        } catch (e) {
          if (!signal.cancelled) {
            setRendering(false)
            setRenderStatus(null)
            const ctx = canvas.getContext('2d')
            if (ctx) {
              canvas.width = 200; canvas.height = 40
              ctx.fillStyle = '#333'; ctx.fillRect(0, 0, 200, 40)
              ctx.fillStyle = '#f44'; ctx.font = '11px monospace'
              ctx.fillText(e instanceof Error ? e.message : 'Render error', 8, 24)
            }
          }
        }
      })()
    } else {
      setRendering(false)
      setRenderStatus(null)
      try {
        const map = MapFile.fromBuffer(fileBuffer, selected.width, selected.height)
        renderSchematic(canvas, map)
      } catch {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          canvas.width = 200; canvas.height = 40
          ctx.fillStyle = '#333'; ctx.fillRect(0, 0, 200, 40)
          ctx.fillStyle = '#f44'; ctx.font = '11px monospace'
          ctx.fillText('Parse error', 8, 24)
        }
      }
    }
  }, [fileBuffer, selected, clientPath])

  useEffect(() => {
    const signal = { cancelled: false }
    // Defer one frame so the Dialog has completed its initial layout before
    // we read clientWidth/clientHeight from the canvas container.
    const raf = requestAnimationFrame(() => {
      if (!signal.cancelled) renderCanvas(signal)
    })
    return () => {
      signal.cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [renderCanvas])

  const totalTiles = fileBuffer.length / 6
  const pairsInView = displayPairs.length
  const hasUnreasonable = pairs.some((p) => !p.reasonable)

  if (pairs.length === 0) {
    return (
      <Dialog open={open} onClose={onCancel}>
        <DialogTitle>Determine Dimensions</DialogTitle>
        <DialogContent>
          <Typography color="error">
            File size ({fileBuffer.length} bytes) is not divisible by 6 — this may not be a valid map file.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel}>Close</Button>
        </DialogActions>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="md" fullWidth>
      <DialogTitle>
        Determine Map Dimensions
        <Typography variant="body2" color="text.secondary" component="div">
          {filename} — {totalTiles.toLocaleString()} tiles — {pairsInView} valid size{pairsInView !== 1 ? 's' : ''}
          {!showAll && hasUnreasonable && (
            <> · <Box component="span" sx={{ color: 'primary.main', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { setShowAll(true); setIndex(0) }}>show all</Box></>
          )}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        {/* Dimension selector */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title="Previous">
            <span>
              <IconButton size="small" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0 || rendering}>
                <NavigateBeforeIcon />
              </IconButton>
            </span>
          </Tooltip>

          <Select
            size="small"
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
            sx={{ minWidth: 160 }}
            disabled={rendering}
          >
            {displayPairs.map((p, i) => (
              <MenuItem key={`${p.width}x${p.height}`} value={i}>
                {pairLabel(p)}
              </MenuItem>
            ))}
          </Select>

          <Tooltip title="Next">
            <span>
              <IconButton size="small" onClick={() => setIndex((i) => Math.min(pairsInView - 1, i + 1))} disabled={index === pairsInView - 1 || rendering}>
                <NavigateNextIcon />
              </IconButton>
            </span>
          </Tooltip>

          {selected && (
            <Typography variant="body2" color="text.secondary">
              {selected.width} × {selected.height}
              {!selected.reasonable && ' (unusual)'}
            </Typography>
          )}

          {rendering && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1 }}>
              <CircularProgress size={14} />
              <Typography variant="caption" color="text.secondary">{renderStatus}</Typography>
            </Box>
          )}
        </Box>

        {/* Canvas preview */}
        <Box sx={{
          flex: 1,
          minHeight: 380,
          bgcolor: 'background.default',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          overflow: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <canvas ref={canvasRef} style={{ imageRendering: 'pixelated', display: 'block', maxWidth: '100%', maxHeight: '100%' }} />
        </Box>

        {/* Legend — schematic only */}
        {!clientPath && (
          <Box sx={{ display: 'flex', gap: 2 }}>
            {[
              { color: COLOR_VOID,   label: 'Void / impassable' },
              { color: COLOR_FLOOR,  label: 'Open floor' },
              { color: COLOR_OBJECT, label: 'Object / wall' },
            ].map(({ color, label }) => (
              <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 12, height: 12, bgcolor: color, borderRadius: 0.5, flexShrink: 0 }} />
                <Typography variant="caption" color="text.secondary">{label}</Typography>
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => selected && onConfirm(selected.width, selected.height)}
          disabled={!selected || rendering}
        >
          Lock In {selected ? `${selected.width}×${selected.height}` : ''}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default DimensionPickerDialog
