import React, { useEffect, useRef, useState } from 'react'
import { Box, Typography, CircularProgress, LinearProgress } from '@mui/material'
import { MapFile } from '@eriscorp/dalib-ts'
import { loadMapAssets, renderMap } from '../../utils/mapRenderer'

interface Props {
  fileBuffer: Uint8Array | null
  width: number | null
  height: number | null
  /** DA client install path. When set, enables full isometric rendering. */
  clientPath: string | null
}

// ── Schematic fallback (no client assets) ─────────────────────────────────────

const COLOR_VOID   = '#1a1a2e'
const COLOR_FLOOR  = '#2d5a3d'
const COLOR_OBJECT = '#8b4513'

function renderSchematic(canvas: HTMLCanvasElement, map: MapFile): void {
  const { width, height, tiles } = map
  const container = canvas.parentElement
  const maxW = container?.clientWidth  ?? 600
  const maxH = container?.clientHeight ?? 400
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
  if (scale >= 3) {
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= width; x++) {
      ctx.beginPath(); ctx.moveTo(x * scale, 0); ctx.lineTo(x * scale, height * scale); ctx.stroke()
    }
    for (let y = 0; y <= height; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * scale); ctx.lineTo(width * scale, y * scale); ctx.stroke()
    }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

const MapCanvas: React.FC<Props> = ({ fileBuffer, width, height, clientPath }) => {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [progress, setProgress] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !fileBuffer || width == null || height == null) return

    let cancelled = false
    setError(null)

    async function draw() {
      if (!canvas || !fileBuffer || width == null || height == null) return
      try {
        const map = MapFile.fromBuffer(fileBuffer, width, height)

        if (clientPath) {
          setProgress(true)
          setStatus('Loading assets…')
          const assets = await loadMapAssets(clientPath, (msg) => {
            if (!cancelled) setStatus(msg)
          })
          if (cancelled) return

          setStatus('Rendering…')
          await renderMap(canvas, map, assets, {}, (msg) => {
            if (!cancelled) setStatus(msg)
          })
          if (!cancelled) { setStatus(null); setProgress(false) }
        } else {
          // No client path — schematic fallback
          renderSchematic(canvas, map)
          setStatus(null)
          setProgress(false)
        }
      } catch (e) {
        if (!cancelled) {
          setProgress(false)
          setError(e instanceof Error ? e.message : 'Render failed')
          setStatus(null)
        }
      }
    }

    draw()
    return () => { cancelled = true }
  }, [fileBuffer, width, height, clientPath])

  if (!fileBuffer) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">No map file loaded.</Typography>
      </Box>
    )
  }

  if (width == null || height == null) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Enter Width and Height above to preview the map.
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ flex: 1, overflow: 'auto', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {/* Status / progress overlay */}
      {(progress || status) && (
        <Box sx={{ px: 2, py: 0.5, display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          {progress && <CircularProgress size={14} />}
          <Typography variant="caption" color="text.secondary">{status}</Typography>
          {progress && <LinearProgress sx={{ flex: 1 }} />}
        </Box>
      )}
      {error && (
        <Box sx={{ px: 2, py: 0.5 }}>
          <Typography variant="caption" color="error">{error}</Typography>
        </Box>
      )}
      {!clientPath && (
        <Box sx={{ px: 2, py: 0.5, flexShrink: 0 }}>
          <Typography variant="caption" color="text.disabled">
            Schematic view — set DA Client path in Settings for full rendering.
          </Typography>
        </Box>
      )}
      <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
        <canvas ref={canvasRef} style={{ imageRendering: 'pixelated', display: 'block' }} />
      </Box>
    </Box>
  )
}

export default MapCanvas
