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
  GROUND_TILE_HEIGHT
} from '../../utils/mapRenderer'
import type { MapAssets } from '../../utils/mapRenderer'
import { splitWallHeight } from '../../utils/tileShape'

/**
 * See the converted tile standing in a wall.
 *
 * A tile is judged by the tiles beside it: whether the bases line up, whether
 * the art is the right height, whether the raise puts it where it should be.
 * None of that shows against a checkerboard.
 *
 * **The bases must be on one line.** In a map cell the two foreground slots are
 * drawn at `sx_base − 28` and `sx_base`, both anchored at `sy_base + 28` — the
 * same base, 28 apart. A wall face is therefore a row of slots that all share
 * one base, and it runs along the `x − y` diagonal, where `x + y` does not
 * change. Stepping along `x` instead moves the base down 14 pixels per cell,
 * which is a stair rather than a wall, and it is what this window drew before.
 *
 * A ground diamond is 56 wide and covers two slots. It sits at the left slot's
 * x, 28 above the base — so the base line is the bottom of the diamond.
 */

/** Wall slots in the run. Two of them make one map cell. */
const SLOTS = 6
/** The converted tile takes this slot, leaving neighbours on both sides. */
const SUBJECT_SLOT = 2

interface Props {
  open: boolean
  onClose: () => void
  /** The converted tile, in output pixels (already at `scale`). */
  converted: PixelBuffer | null
  assets: MapAssets | null
  scale: TileScale
  /** The whole tile height, in 1× pixels. Editable here so it can be lined up. */
  wallHeight: number
  onWallHeightChange: (height: number) => void
  /** Blank rows at the base, which raise the art. Editable for the same reason. */
  blankRows: number
  onBlankRowsChange: (rows: number) => void
}

/** Draw a PixelBuffer through a scratch canvas. */
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

const WallPlacementPreview: React.FC<Props> = ({
  open,
  onClose,
  converted,
  assets,
  scale,
  wallHeight,
  onWallHeightChange,
  blankRows,
  onBlankRowsChange
}) => {
  const [runId, setRunId] = useState<string>('')
  const [floorId, setFloorId] = useState<string>('')
  const [zoom, setZoom] = useState<number>(3)
  const [missing, setMissing] = useState<number[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const split = splitWallHeight(wallHeight, blankRows)

  const draw = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const subjectH = converted ? converted.height / scale : 0
    const sceneW = SLOTS * ISO_HTILE_W
    // Room above the base for the tallest thing that can stand on it.
    const headroom = Math.ceil(Math.max(subjectH, ISO_HTILE_W * 6)) + ISO_HTILE_W
    const baseY = headroom
    const sceneH = baseY + GROUND_TILE_HEIGHT + ISO_HTILE_W

    canvas.width = Math.ceil(sceneW * zoom)
    canvas.height = Math.ceil(sceneH * zoom)
    ctx.imageSmoothingEnabled = false
    ctx.setTransform(zoom, 0, 0, zoom, 0, 0)
    ctx.clearRect(0, 0, sceneW, sceneH)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, sceneW, sceneH)

    // Ground: one 56-wide diamond per cell, its bottom on the base line.
    const floor = Number.parseInt(floorId, 10)
    if (assets && Number.isInteger(floor) && floor > 0) {
      const bmp = await getGroundBitmap(floor, assets)
      if (bmp) {
        for (let slot = 0; slot < SLOTS; slot += 2) {
          ctx.drawImage(bmp, slot * ISO_HTILE_W, baseY - ISO_HTILE_W)
        }
      }
    }

    // Neighbours: consecutive ids either side, which is how a legacy wall runs.
    const centre = Number.parseInt(runId, 10)
    const notFound: number[] = []
    if (assets && Number.isInteger(centre) && centre > 0) {
      for (let slot = 0; slot < SLOTS; slot++) {
        if (slot === SUBJECT_SLOT) continue
        const id = centre + (slot - SUBJECT_SLOT)
        if (id < 1) continue
        const bmp = await getStcBitmap(id, assets)
        if (!bmp) {
          notFound.push(id)
          continue
        }
        // Every wall is bottom-anchored on the shared base.
        ctx.drawImage(bmp, slot * ISO_HTILE_W, baseY - bmp.height)
      }
    }
    setMissing(notFound)

    // The subject, on the same base. Art authored at 2× draws at its 1×
    // footprint, because the scene is 1×.
    if (converted) {
      const sub = bufferToCanvas(converted)
      const w = converted.width / scale
      const x = SUBJECT_SLOT * ISO_HTILE_W
      ctx.drawImage(sub, 0, 0, converted.width, converted.height, x, baseY - subjectH, w, subjectH)
    }

    // The base line itself, across the whole run.
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.55)'
    ctx.lineWidth = 1 / zoom
    ctx.beginPath()
    ctx.moveTo(0, baseY + 0.5)
    ctx.lineTo(sceneW, baseY + 0.5)
    ctx.stroke()

    // Where the art of the subject ends, when it is raised off the base.
    if (converted && split.blank > 0) {
      const y = baseY - split.blank
      ctx.strokeStyle = 'rgba(255, 180, 0, 0.8)'
      ctx.beginPath()
      ctx.moveTo(SUBJECT_SLOT * ISO_HTILE_W, y + 0.5)
      ctx.lineTo((SUBJECT_SLOT + 1) * ISO_HTILE_W, y + 0.5)
      ctx.stroke()
    }
  }, [assets, converted, scale, floorId, runId, zoom, split.blank])

  useEffect(() => {
    if (open) draw()
  }, [open, draw])

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Placement preview</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Every tile in the run stands on one base line, which is how a wall is drawn in a map.
            The blue line is that base. The orange line is where the art of your tile stops, when
            blank rows raise it.
          </Typography>

          <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="Wall run from id"
              type="number"
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              helperText="The tile this one stands in for. Its run fills the slots beside it."
              sx={{ width: 240 }}
            />
            <TextField
              size="small"
              label="Ground tile id"
              type="number"
              value={floorId}
              onChange={(e) => setFloorId(e.target.value)}
              helperText="Empty for no floor."
              sx={{ width: 150 }}
            />
            <TextField
              size="small"
              label="Tile height"
              type="number"
              value={wallHeight}
              onChange={(e) => onWallHeightChange(Math.max(1, Number(e.target.value) || 1))}
              helperText="Multiples of 14 match a legacy run."
              sx={{ width: 150 }}
            />
            <TextField
              size="small"
              label="Blank rows below"
              type="number"
              value={blankRows}
              onChange={(e) => onBlankRowsChange(Math.max(0, Number(e.target.value) || 0))}
              helperText={`Art ${split.art}px, base ${split.blank}px`}
              sx={{ width: 150 }}
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
              No client loaded. Set a client path in Settings to draw the run and the ground.
            </Alert>
          )}
          {missing.length > 0 && (
            <Alert severity="warning" sx={{ py: 0 }}>
              No legacy wall for {missing.join(', ')}. Ids 1–12 and 10001–10012 are never drawn.
            </Alert>
          )}
          {!converted && (
            <Alert severity="info" sx={{ py: 0 }}>
              Import an image to see it placed.
            </Alert>
          )}

          <Box sx={{ overflow: 'auto', maxHeight: '55vh' }}>
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
