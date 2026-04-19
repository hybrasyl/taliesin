import React, { useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, Slider, FormControlLabel, Checkbox, CircularProgress,
} from '@mui/material'
import { MapFile } from '@eriscorp/dalib-ts'
import {
  loadMapAssets, renderMap, isoCanvasSize, tileToScreen, isTilePassable,
  ISO_HTILE_W, ISO_VTILE_STEP,
  type MapAssets,
} from '../../utils/mapRenderer'

interface Props {
  open: boolean
  mapFile: MapFile
  mapFilePath: string | null
  clientPath: string | null
  onClose: () => void
  onStatus: (msg: string) => void
}

const ExportMapDialog: React.FC<Props> = ({ open, mapFile, mapFilePath, clientPath, onClose, onStatus }) => {
  const [exportScale, setExportScale] = useState(1)
  const [transparent, setTransparent] = useState(false)
  const [exportCollision, setExportCollision] = useState(false)
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    const defaultName = mapFilePath
      ? mapFilePath.replace(/\\/g, '/').split('/').pop()?.replace(/\.map$/i, '.png') ?? 'map.png'
      : 'map.png'
    const savePath = await window.api.saveFile(
      [{ name: 'PNG Image', extensions: ['png'] }],
      defaultName,
    )
    if (!savePath) return

    setExporting(true)
    try {
      // Load assets
      let assets: MapAssets | null = null
      if (clientPath) {
        assets = await loadMapAssets(clientPath)
      }

      // Render map to offscreen canvas
      const canvas = document.createElement('canvas')
      const { w, h } = isoCanvasSize(mapFile.width, mapFile.height, exportScale)
      canvas.width = w
      canvas.height = h

      if (assets) {
        if (transparent) {
          // Don't fill black — leave transparent
          const ctx = canvas.getContext('2d')!
          ctx.clearRect(0, 0, w, h)
        }
        await renderMap(canvas, mapFile, assets, { scale: exportScale })

        // If transparent, clear the black background renderMap drew
        if (transparent) {
          // Re-render without the black fill
          const ctx = canvas.getContext('2d')!
          ctx.clearRect(0, 0, w, h)
          await renderMap(canvas, mapFile, assets, { scale: exportScale })
        }
      }

      // Convert to PNG blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Failed to create PNG')), 'image/png')
      })
      const arrayBuf = await blob.arrayBuffer()
      await window.api.writeBytes(savePath, new Uint8Array(arrayBuf))

      // Export collision wireframe if requested
      if (exportCollision && assets?.sotpTable) {
        const tabCanvas = document.createElement('canvas')
        tabCanvas.width = w
        tabCanvas.height = h
        const ctx = tabCanvas.getContext('2d')!

        if (!transparent) {
          ctx.fillStyle = '#000'
          ctx.fillRect(0, 0, w, h)
        }

        const originX = mapFile.height * ISO_HTILE_W
        const originY = 512 // ISO_FOREGROUND_PAD
        const sotp = assets.sotpTable

        // Draw passability diamonds
        for (let ty = 0; ty < mapFile.height; ty++) {
          for (let tx = 0; tx < mapFile.width; tx++) {
            const tile = mapFile.getTile(tx, ty)
            const { x: cx, y: cy } = tileToScreen(tx, ty, originX, originY, exportScale)
            const hw = ISO_HTILE_W * exportScale
            const hv = ISO_VTILE_STEP * exportScale

            ctx.beginPath()
            ctx.moveTo(cx, cy - hv)
            ctx.lineTo(cx + hw, cy)
            ctx.lineTo(cx, cy + hv)
            ctx.lineTo(cx - hw, cy)
            ctx.closePath()

            if (!isTilePassable(tile.leftForeground, tile.rightForeground, sotp)) {
              ctx.fillStyle = 'rgba(220,50,50,0.6)'
              ctx.fill()
            }
            ctx.strokeStyle = 'rgba(255,255,255,0.3)'
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }

        const tabBlob = await new Promise<Blob>((resolve, reject) => {
          tabCanvas.toBlob(b => b ? resolve(b) : reject(new Error('Failed to create tab PNG')), 'image/png')
        })
        const tabBuf = await tabBlob.arrayBuffer()
        const tabPath = savePath.replace(/\.png$/i, '_tab.png')
        await window.api.writeBytes(tabPath, new Uint8Array(tabBuf))
      }

      onStatus('Exported successfully')
      onClose()
    } catch (err) {
      onStatus(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Export Map as PNG</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Map: {mapFile.width} × {mapFile.height} tiles
          </Typography>

          <Typography variant="caption" color="text.secondary">
            Scale: {Math.round(exportScale * 100)}%
          </Typography>
          <Slider
            value={exportScale}
            onChange={(_, v) => setExportScale(v as number)}
            min={0.25}
            max={4}
            step={0.25}
            marks={[
              { value: 0.25, label: '25%' },
              { value: 1, label: '100%' },
              { value: 2, label: '200%' },
              { value: 4, label: '400%' },
            ]}
            sx={{ mt: 1, mb: 2 }}
          />

          <FormControlLabel
            control={<Checkbox checked={transparent} onChange={(_, v) => setTransparent(v)} />}
            label="Transparent background"
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={exportCollision}
                onChange={(_, v) => setExportCollision(v)}
                disabled={!clientPath}
              />
            }
            label="Export collision wireframe (_tab.png)"
          />
          {!clientPath && (
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', ml: 4 }}>
              Requires client path for sotp.dat
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={exporting}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleExport}
          disabled={exporting || !clientPath}
          startIcon={exporting ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {exporting ? 'Exporting…' : 'Export'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default ExportMapDialog
