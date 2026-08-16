import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Stack,
  TextField,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Alert
} from '@mui/material'
import { PixelBuffer } from '../../utils/duotone'
import { TileScale } from '../../utils/tileConvert'
import {
  getGroundBitmap,
  getStcBitmap,
  ISO_HTILE_W,
  GROUND_TILE_WIDTH,
  GROUND_TILE_HEIGHT
} from '../../utils/mapRenderer'
import type { MapAssets } from '../../utils/mapRenderer'

/**
 * See the converted tile standing beside real walls.
 *
 * A tile is judged by its neighbours: whether it is the right height, whether
 * its base sits on the same line, whether the raise puts it where it should be.
 * None of that is visible against a checkerboard. This draws a short run of
 * cells with the same geometry the map renderer uses, puts legacy walls on
 * either side, and puts the converted tile in the middle.
 *
 * The geometry is copied from `renderMap`, and must stay the same as it:
 *   ground  → (x − y)·28 − 28, (x + y)·14
 *   wall    → the cell's left slot is (x − y)·28 − 28, and every wall is
 *             bottom-anchored at (x + y)·14 + 28 − its own height
 * A wall is therefore placed by its BOTTOM edge, which is why blank rows below
 * the art raise it and why a wrong height floats or sinks the tile.
 */

/** Cells drawn in the strip. Three puts a neighbour on each side. */
const CELLS = 3
/** The converted tile goes in the middle cell. */
const SUBJECT_CELL = 1

interface Props {
  open: boolean
  onClose: () => void
  /** The converted tile, in output pixels (already at `scale`). */
  converted: PixelBuffer | null
  assets: MapAssets | null
  scale: TileScale
}

/** Draw a PixelBuffer through a scratch canvas, at 1× map geometry. */
function bufferToCanvas(buf: PixelBuffer): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = buf.width
  c.height = buf.height
  const ctx = c.getContext('2d')
  if (ctx) {
    const img = ctx.createImageData(buf.width, buf.height)
    img.data.set(buf.data)
    ctx.putImageData(img, 0, 0)
  }
  return c
}

const WallPlacementPreview: React.FC<Props> = ({ open, onClose, converted, assets, scale }) => {
  const [neighborId, setNeighborId] = useState<string>('')
  const [floorId, setFloorId] = useState<string>('1')
  const [zoom, setZoom] = useState<number>(3)
  const [neighborMissing, setNeighborMissing] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const draw = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // The strip is CELLS wide and one deep, so the run reads left to right.
    const originX = ISO_HTILE_W // one cell of margin, as H = 1 in renderMap
    const sceneW = (CELLS + 1) * ISO_HTILE_W + GROUND_TILE_WIDTH
    // Enough room above the ground for the tallest thing in the scene.
    const tallest = Math.max(
      GROUND_TILE_HEIGHT,
      converted ? converted.height / scale : 0,
      ISO_HTILE_W * 4
    )
    const headroom = Math.ceil(tallest) + ISO_HTILE_W
    const sceneH = headroom + CELLS * (ISO_HTILE_W / 2) + GROUND_TILE_HEIGHT

    canvas.width = Math.ceil(sceneW * zoom)
    canvas.height = Math.ceil(sceneH * zoom)
    ctx.imageSmoothingEnabled = false
    ctx.setTransform(zoom, 0, 0, zoom, 0, 0)
    ctx.clearRect(0, 0, sceneW, sceneH)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, sceneW, sceneH)

    const floor = Number.parseInt(floorId, 10)
    const neighbor = Number.parseInt(neighborId, 10)

    // Ground first, exactly as renderMap orders it.
    if (assets && Number.isInteger(floor) && floor > 0) {
      const bmp = await getGroundBitmap(floor, assets)
      if (bmp) {
        for (let x = 0; x < CELLS; x++) {
          ctx.drawImage(
            bmp,
            originX + x * ISO_HTILE_W - ISO_HTILE_W,
            headroom + x * (ISO_HTILE_W / 2)
          )
        }
      }
    }

    // Neighbours on the cells either side of the subject.
    let missing = false
    if (assets && Number.isInteger(neighbor) && neighbor > 0) {
      const bmp = await getStcBitmap(neighbor, assets)
      if (bmp) {
        for (let x = 0; x < CELLS; x++) {
          if (x === SUBJECT_CELL) continue
          const sx = originX + x * ISO_HTILE_W - ISO_HTILE_W
          const base = headroom + x * (ISO_HTILE_W / 2) + ISO_HTILE_W
          ctx.drawImage(bmp, sx, base - bmp.height)
        }
      } else {
        missing = true
      }
    }
    setNeighborMissing(missing)

    // The subject, bottom-anchored on its own cell like any other wall. Art
    // authored at 2× is drawn at its 1× footprint, because the scene is 1×.
    if (converted) {
      const sub = bufferToCanvas(converted)
      const w = converted.width / scale
      const h = converted.height / scale
      const sx = originX + SUBJECT_CELL * ISO_HTILE_W - ISO_HTILE_W
      const base = headroom + SUBJECT_CELL * (ISO_HTILE_W / 2) + ISO_HTILE_W
      ctx.drawImage(sub, 0, 0, converted.width, converted.height, sx, base - h, w, h)

      // Mark the cell base, so a tile that floats or sinks is obvious.
      ctx.strokeStyle = 'rgba(0, 200, 255, 0.9)'
      ctx.lineWidth = 1 / zoom
      ctx.beginPath()
      ctx.moveTo(sx, base + 0.5)
      ctx.lineTo(sx + w, base + 0.5)
      ctx.stroke()
    }
  }, [assets, converted, scale, floorId, neighborId, zoom])

  useEffect(() => {
    if (open) draw()
  }, [open, draw])

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Placement preview</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            The tile stands in the middle cell, on the same base line as the walls beside it. The
            blue line is that base.
          </Typography>

          <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="Neighbour wall id"
              type="number"
              value={neighborId}
              onChange={(e) => setNeighborId(e.target.value)}
              helperText="A legacy wall to stand beside. Leave empty for none."
              sx={{ width: 200 }}
            />
            <TextField
              size="small"
              label="Ground tile id"
              type="number"
              value={floorId}
              onChange={(e) => setFloorId(e.target.value)}
              helperText="The floor under the run."
              sx={{ width: 160 }}
            />
            <Box>
              <Typography variant="overline" color="text.secondary">
                Zoom
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={zoom}
                onChange={(_, v) => v && setZoom(v)}
              >
                <ToggleButton value={1}>1×</ToggleButton>
                <ToggleButton value={2}>2×</ToggleButton>
                <ToggleButton value={3}>3×</ToggleButton>
                <ToggleButton value={4}>4×</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Stack>

          {!assets && (
            <Alert severity="info" sx={{ py: 0 }}>
              No client loaded. Set a client path in Settings to draw legacy neighbours and ground.
            </Alert>
          )}
          {neighborMissing && (
            <Alert severity="warning" sx={{ py: 0 }}>
              No legacy wall for that id. Ids 1–12 and 10001–10012 are never drawn.
            </Alert>
          )}
          {!converted && (
            <Alert severity="info" sx={{ py: 0 }}>
              Import an image to see it placed.
            </Alert>
          )}

          <Box sx={{ overflow: 'auto', maxHeight: '60vh' }}>
            <Box
              component="canvas"
              ref={canvasRef}
              sx={{ imageRendering: 'pixelated', display: 'block' }}
            />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

export default WallPlacementPreview
