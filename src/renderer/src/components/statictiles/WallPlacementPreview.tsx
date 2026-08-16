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
import type { WallFace } from '../../utils/tileConvert'
import {
  getGroundBitmap,
  getStcBitmap,
  drawDiamond,
  ISO_HTILE_W,
  GROUND_TILE_HEIGHT
} from '../../utils/mapRenderer'
import type { MapAssets } from '../../utils/mapRenderer'
import { splitWallHeight } from '../../utils/tileShape'

/**
 * Stand the converted tile in a 3×3 patch of map, beside a real wall.
 *
 * The tile is not standing in for anything. It is a new tile, placed on a cell
 * and a slot of its own, next to walls the author picked to judge it against.
 * What the author needs to see is whether it lines up with them — so the patch
 * uses the map renderer's geometry exactly, and the tile can be moved from cell
 * to cell and from slot to slot without leaving the window.
 *
 * The geometry, from `renderMap`:
 *
 *     sxBase = originX + (x − y)·28        syBase = originY + (x + y)·14
 *     left  slot → (sxBase − 28, syBase + 28 − h)
 *     right slot → (sxBase,      syBase + 28 − h)
 *     ground     → (sxBase − 28, syBase)
 *
 * So the two slots of one cell share a base 28 apart, and each step of x or y
 * moves the next cell 14 pixels down. A wall face is a column or a row of that
 * grid, not a horizontal line, and not a diagonal:
 *
 * - A **left-facing** run goes down the y axis at constant x, in the RIGHT
 *   slot: (0,0), (0,1), (0,2). Its tiles step down and to the left.
 * - A **right-facing** run goes along the x axis at constant y, in the LEFT
 *   slot: (0,0), (1,0), (2,0). Its tiles step down and to the right. It is the
 *   mirror of the other.
 *
 * A tile made for one of those faces is placed in the opposite slot of a cell
 * beside the run.
 */

/** The patch is 3 cells on a side. */
const GRID = 3

/** Which way a wall face runs, and therefore which slot carries it. */
type Facing = 'left' | 'right'

/** A cell of the patch. */
interface Cell {
  x: number
  y: number
}

/** The cells a run of the given facing occupies, in draw order. */
function runCells(facing: Facing): Cell[] {
  return facing === 'left'
    ? [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: 2 }
      ]
    : [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 }
      ]
}

/** The slot a run of the given facing sits in. */
function runSlot(facing: Facing): WallFace {
  return facing === 'left' ? 'right' : 'left'
}

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
  const [facing, setFacing] = useState<Facing>('left')
  const [runId, setRunId] = useState<string>('')
  const [floorId, setFloorId] = useState<string>('')
  const [cell, setCell] = useState<Cell>({ x: 1, y: 1 })
  const [slot, setSlot] = useState<WallFace>('left')
  const [zoom, setZoom] = useState<number>(3)
  const [missing, setMissing] = useState<number[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const split = splitWallHeight(wallHeight, blankRows)

  // A tile for a left-facing wall goes in the slot the run does not use, and
  // the other way round. Changing the facing moves the tile with it.
  const changeFacing = useCallback((next: Facing) => {
    setFacing(next)
    setSlot(next === 'left' ? 'left' : 'right')
  }, [])

  const draw = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Collect the art first: the headroom depends on the tallest wall in it.
    const centre = Number.parseInt(runId, 10)
    const hasRun = assets && Number.isInteger(centre) && centre > 0
    const cells = runCells(facing)
    const walls: { cell: Cell; bitmap: ImageBitmap }[] = []
    const notFound: number[] = []
    if (hasRun) {
      for (let i = 0; i < cells.length; i++) {
        const id = centre + i
        const bitmap = await getStcBitmap(id, assets)
        if (bitmap) walls.push({ cell: cells[i]!, bitmap })
        else notFound.push(id)
      }
    }
    setMissing(notFound)

    const floor = Number.parseInt(floorId, 10)
    const ground =
      assets && Number.isInteger(floor) && floor > 0 ? await getGroundBitmap(floor, assets) : null

    const subjectH = converted ? converted.height / scale : 0
    const tallest = Math.max(subjectH, ...walls.map((w) => w.bitmap.height), ISO_HTILE_W)

    const originX = GRID * ISO_HTILE_W
    const headroom = Math.ceil(tallest) + ISO_HTILE_W
    const originY = headroom
    const sceneW = 2 * GRID * ISO_HTILE_W + ISO_HTILE_W * 2
    const sceneH = originY + 2 * GRID * (ISO_HTILE_W / 2) + GROUND_TILE_HEIGHT

    canvas.width = Math.ceil(sceneW * zoom)
    canvas.height = Math.ceil(sceneH * zoom)
    ctx.imageSmoothingEnabled = false
    ctx.setTransform(zoom, 0, 0, zoom, 0, 0)
    ctx.clearRect(0, 0, sceneW, sceneH)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, sceneW, sceneH)

    const sxBase = (c: Cell): number => originX + (c.x - c.y) * ISO_HTILE_W
    const syBase = (c: Cell): number => originY + (c.x + c.y) * (ISO_HTILE_W / 2)
    const slotX = (c: Cell, s: WallFace): number => sxBase(c) - (s === 'left' ? ISO_HTILE_W : 0)
    const footY = (c: Cell): number => syBase(c) + ISO_HTILE_W

    // Ground, then the outline of every cell, then the foreground — the order
    // renderMap uses, so a nearer tile covers a farther one.
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const c = { x, y }
        if (ground) ctx.drawImage(ground, sxBase(c) - ISO_HTILE_W, syBase(c))
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
        ctx.lineWidth = 1 / zoom
        drawDiamond(ctx, sxBase(c), syBase(c) + ISO_HTILE_W / 2)
        ctx.stroke()
      }
    }

    const sub = converted ? bufferToCanvas(converted) : null
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const wall = walls.find((w) => w.cell.x === x && w.cell.y === y)
        if (wall) {
          const c = wall.cell
          ctx.drawImage(wall.bitmap, slotX(c, runSlot(facing)), footY(c) - wall.bitmap.height)
        }
        if (sub && converted && cell.x === x && cell.y === y) {
          const c = { x, y }
          const w = converted.width / scale
          ctx.drawImage(
            sub,
            0,
            0,
            converted.width,
            converted.height,
            slotX(c, slot),
            footY(c) - subjectH,
            w,
            subjectH
          )
        }
      }
    }

    // Mark the tile's own slot: its foot, and where its art stops when raised.
    const x0 = slotX(cell, slot)
    const foot = footY(cell)
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.9)'
    ctx.lineWidth = 1 / zoom
    ctx.beginPath()
    ctx.moveTo(x0, foot + 0.5)
    ctx.lineTo(x0 + ISO_HTILE_W, foot + 0.5)
    ctx.stroke()
    if (converted && split.blank > 0) {
      ctx.strokeStyle = 'rgba(255, 180, 0, 0.9)'
      ctx.beginPath()
      ctx.moveTo(x0, foot - split.blank + 0.5)
      ctx.lineTo(x0 + ISO_HTILE_W, foot - split.blank + 0.5)
      ctx.stroke()
    }
  }, [assets, converted, scale, floorId, runId, zoom, facing, cell, slot, split.blank])

  useEffect(() => {
    if (open) draw()
  }, [open, draw])

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Placement preview</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            A 3×3 patch of map, drawn the way the game draws it. The wall runs down one edge. Your
            tile stands on a cell and a slot of its own — move it to see how it meets them. The blue
            line is the foot of your tile&apos;s slot. The orange line is where its art stops.
          </Typography>

          <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="overline" color="text.secondary">
                Wall face
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={facing}
                onChange={(_, v) => v && changeFacing(v)}
              >
                <ToggleButton value="left">Left-facing</ToggleButton>
                <ToggleButton value="right">Right-facing</ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
                {facing === 'left'
                  ? 'Run down x=0, in the right slot'
                  : 'Run along y=0, in the left slot'}
              </Typography>
            </Box>
            <TextField
              size="small"
              label="Reference wall id"
              type="number"
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              helperText="The first of three. It and the next two make the run."
              sx={{ width: 220 }}
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
          </Stack>

          <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="overline" color="text.secondary">
                Your tile&apos;s cell
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 32px)', gap: 0.5 }}>
                {Array.from({ length: GRID * GRID }, (_, i) => {
                  const x = i % GRID
                  const y = Math.floor(i / GRID)
                  const selected = cell.x === x && cell.y === y
                  return (
                    <Button
                      key={i}
                      size="small"
                      variant={selected ? 'contained' : 'outlined'}
                      onClick={() => setCell({ x, y })}
                      sx={{ minWidth: 0, px: 0 }}
                    >
                      {x},{y}
                    </Button>
                  )
                })}
              </Box>
            </Box>
            <Box>
              <Typography variant="overline" color="text.secondary">
                Slot
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={slot}
                onChange={(_, v) => v && setSlot(v)}
              >
                <ToggleButton value="left">Left</ToggleButton>
                <ToggleButton value="right">Right</ToggleButton>
              </ToggleButtonGroup>
            </Box>
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
