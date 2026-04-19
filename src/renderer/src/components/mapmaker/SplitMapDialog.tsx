import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, ToggleButton, ToggleButtonGroup,
  TextField, CircularProgress,
} from '@mui/material'
import { MapFile } from '@eriscorp/dalib-ts'
import {
  loadMapAssets, renderMap, isoCanvasSize, tileToScreen,
  ISO_HTILE_W, ISO_VTILE_STEP,
} from '../../utils/mapRenderer'

type SplitMode = '2x1' | '1x2' | '2x2'

interface Props {
  open: boolean
  mapFile: MapFile
  clientPath: string | null
  onClose: () => void
  onStatus: (msg: string) => void
}

function splitDimensions(mode: SplitMode, W: number, H: number): { cols: number; rows: number; subW: number; subH: number } {
  const cols = mode === '1x2' ? 1 : 2
  const rows = mode === '2x1' ? 1 : 2
  return { cols, rows, subW: Math.floor(W / cols), subH: Math.floor(H / rows) }
}

const LABELS_2x2 = ['Top-Left', 'Top-Right', 'Bottom-Left', 'Bottom-Right']
const LABELS_2x1 = ['Left', 'Right']
const LABELS_1x2 = ['Top', 'Bottom']

function getLabels(mode: SplitMode): string[] {
  if (mode === '2x2') return LABELS_2x2
  if (mode === '2x1') return LABELS_2x1
  return LABELS_1x2
}

const SplitMapDialog: React.FC<Props> = ({ open, mapFile, clientPath, onClose, onStatus }) => {
  const [mode, setMode] = useState<SplitMode | null>(null)
  const [baseName, setBaseName] = useState('lod30000')
  const [saving, setSaving] = useState(false)
  const previewRef = useRef<HTMLCanvasElement>(null)

  const { width: W, height: H } = mapFile
  const { cols, rows, subW, subH } = mode ? splitDimensions(mode, W, H) : { cols: 1, rows: 1, subW: W, subH: H }
  const count = cols * rows
  const labels = mode ? getLabels(mode) : []

  const canSplit = mode !== null && subW >= 1 && subH >= 1

  // Warning for non-even splits
  const remainder = mode === '2x2'
    ? (W % 2 !== 0 || H % 2 !== 0)
    : mode === '2x1' ? W % 2 !== 0
    : mode === '1x2' ? H % 2 !== 0
    : false

  // Draw isometric preview + cut lines
  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas) return
    let cancelled = false

    const draw = async () => {
      // Determine scale to fit preview area
      const previewScale = Math.min(0.5, 480 / ((W + H) * ISO_HTILE_W))
      const { w: pw, h: ph } = isoCanvasSize(W, H, previewScale)
      canvas.width = pw
      canvas.height = ph
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, pw, ph)

      // Render isometric map if we have assets
      if (clientPath) {
        try {
          const assets = await loadMapAssets(clientPath)
          if (cancelled) return
          await renderMap(canvas, mapFile, assets, { scale: previewScale })
        } catch { /* no assets — black bg is fine */ }
      }
      if (cancelled) return

      // Draw cut lines in isometric space
      if (mode) {
        const originX = H * ISO_HTILE_W
        const originY = 512 // ISO_FOREGROUND_PAD
        const hw = ISO_HTILE_W * previewScale
        const hv = ISO_VTILE_STEP * previewScale

        // Draw cut line along column boundary (vertical split)
        if (cols > 1) {
          ctx.strokeStyle = 'rgba(255,80,80,0.9)'
          ctx.lineWidth = 2
          ctx.setLineDash([6, 4])
          ctx.beginPath()
          // Walk along x = subW for all y values
          for (let y = 0; y <= H; y++) {
            const { x: sx, y: sy } = tileToScreen(subW, y, originX, originY, previewScale)
            if (y === 0) ctx.moveTo(sx - hw, sy)
            ctx.lineTo(sx - hw, sy)
          }
          ctx.stroke()
          ctx.setLineDash([])
        }

        // Draw cut line along row boundary (horizontal split)
        if (rows > 1) {
          ctx.strokeStyle = 'rgba(255,80,80,0.9)'
          ctx.lineWidth = 2
          ctx.setLineDash([6, 4])
          ctx.beginPath()
          for (let x = 0; x <= W; x++) {
            const { x: sx, y: sy } = tileToScreen(x, subH, originX, originY, previewScale)
            if (x === 0) ctx.moveTo(sx, sy - hv)
            ctx.lineTo(sx, sy - hv)
          }
          ctx.stroke()
          ctx.setLineDash([])
        }

        // Region labels
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        ctx.font = 'bold 13px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.strokeStyle = 'rgba(0,0,0,0.8)'
        ctx.lineWidth = 3
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const idx = r * cols + c
            const centerX = c * subW + subW / 2
            const centerY = r * subH + subH / 2
            const { x: sx, y: sy } = tileToScreen(centerX, centerY, originX, originY, previewScale)
            ctx.strokeText(labels[idx], sx, sy)
            ctx.fillText(labels[idx], sx, sy)
          }
        }
      }
    }

    draw()
    return () => { cancelled = true }
  }, [mode, mapFile, clientPath, W, H, cols, rows, subW, subH, labels])

  const handleSplit = useCallback(async () => {
    setSaving(true)
    try {
      const dir = await window.api.openDirectory()
      if (!dir) { setSaving(false); return }

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c
          const subMap = new MapFile(subW, subH)

          for (let y = 0; y < subH; y++) {
            for (let x = 0; x < subW; x++) {
              const srcX = c * subW + x
              const srcY = r * subH + y
              if (srcX < W && srcY < H) {
                subMap.setTile(x, y, { ...mapFile.getTile(srcX, srcY) })
              }
            }
          }

          const filename = `${baseName}_${idx + 1}.map`
          const path = `${dir}/${filename}`
          await window.api.writeBytes(path, subMap.toUint8Array())
        }
      }

      onStatus(`Split into ${count} maps (${subW}×${subH} each)`)
      onClose()
    } catch (err) {
      onStatus(`Split failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setSaving(false)
    }
  }, [mapFile, mode, baseName, W, H, cols, rows, subW, subH, count, onStatus, onClose])

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Split Map</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Current map: {W} × {H} tiles
        </Typography>

        {/* Split mode */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            Split mode
          </Typography>
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={(_, v) => v && setMode(v)}
            size="small"
          >
            <ToggleButton value="2x1">2×1 (Left / Right)</ToggleButton>
            <ToggleButton value="1x2">1×2 (Top / Bottom)</ToggleButton>
            <ToggleButton value="2x2">2×2 (Quadrants)</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Preview */}
        <Box sx={{ display: 'flex', gap: 3, mb: 2 }}>
          <canvas ref={previewRef} style={{ imageRendering: 'pixelated', border: '1px solid', borderRadius: 4 }} />
          <Box>
            {mode ? (
              <>
                <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                  {count} maps × {subW}×{subH} tiles each
                </Typography>
                {labels.map((label, i) => (
                  <Typography key={i} variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {baseName}_{i + 1}.map — {label}
                  </Typography>
                ))}
                {remainder && (
                  <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>
                    Map dimensions don't divide evenly. Extra tiles on the right/bottom edges will be discarded.
                  </Typography>
                )}
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Select a split mode to see the cut lines.
              </Typography>
            )}
          </Box>
        </Box>

        {/* Base name */}
        <TextField
          label="Base filename"
          size="small"
          fullWidth
          value={baseName}
          onChange={e => setBaseName(e.target.value)}
          helperText={`Files will be named ${baseName}_1.map, ${baseName}_2.map, etc.`}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSplit}
          disabled={saving || !canSplit || !baseName.trim()}
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {saving ? 'Splitting…' : `Split into ${count} Maps`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default SplitMapDialog
