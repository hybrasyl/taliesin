import React, { useEffect, useRef } from 'react'
import { Box, Typography } from '@mui/material'
import { PixelBuffer } from '../../utils/duotone'
import { previewScale } from '../../utils/previewFit'

/**
 * Every cell of a sliced source, on screen at once.
 *
 * A run of wall tiles is a single drawing that was cut up, so it is judged as a
 * run: whether the cuts fall in the right places, whether the pieces still line
 * up. A next button shows one piece at a time and hides exactly that. The cells
 * are drawn touching, in order, so the strip reads as the art it came from, and
 * the selected one carries an outline.
 */

/** The tallest a thumbnail is drawn. Wide runs stay legible by scrolling. */
const STRIP_BOX = 96

interface Props {
  cells: PixelBuffer[]
  selected: number
  onSelect: (index: number) => void
  /** What one cell is called: a sliced tile, or a cell of a grid sheet. */
  noun: string
}

/** One cell, painted at the scale the whole strip shares. */
const Cell: React.FC<{
  buf: PixelBuffer
  scale: number
  selected: boolean
  index: number
  noun: string
  onSelect: () => void
}> = ({ buf, scale, selected, index, noun, onSelect }) => {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = Math.max(1, Math.round(buf.width * scale))
    canvas.height = Math.max(1, Math.round(buf.height * scale))
    const tmp = document.createElement('canvas')
    tmp.width = buf.width
    tmp.height = buf.height
    const tctx = tmp.getContext('2d')
    if (!tctx) return
    const img = tctx.createImageData(buf.width, buf.height)
    img.data.set(buf.data)
    tctx.putImageData(img, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(tmp, 0, 0, buf.width, buf.height, 0, 0, canvas.width, canvas.height)
  }, [buf, scale])

  return (
    <Box
      component="button"
      type="button"
      onClick={onSelect}
      aria-label={`${noun} ${index + 1}`}
      aria-pressed={selected}
      sx={{
        p: 0,
        border: '2px solid',
        borderColor: selected ? 'primary.main' : 'transparent',
        background: 'repeating-conic-gradient(#0000 0% 25%, #8884 0% 50%) 50% / 8px 8px',
        cursor: 'pointer',
        lineHeight: 0,
        flexShrink: 0,
        '&:hover': { borderColor: selected ? 'primary.main' : 'divider' }
      }}
    >
      <Box component="canvas" ref={ref} sx={{ imageRendering: 'pixelated', display: 'block' }} />
    </Box>
  )
}

const CellStrip: React.FC<Props> = ({ cells, selected, onSelect, noun }) => {
  if (cells.length <= 1) return null

  // One scale for the whole strip, from the largest cell, so the pieces keep
  // their sizes relative to each other and the run lines up.
  const maxW = Math.max(...cells.map((c) => c.width))
  const maxH = Math.max(...cells.map((c) => c.height))
  const scale = previewScale(maxW, maxH, STRIP_BOX)

  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {cells.length} {noun.toLowerCase()}s — {noun.toLowerCase()} {selected + 1} is previewed
        below
      </Typography>
      <Box sx={{ display: 'flex', overflowX: 'auto', alignItems: 'flex-end', pb: 1 }}>
        {cells.map((c, i) => (
          <Cell
            key={i}
            buf={c}
            scale={scale}
            index={i}
            noun={noun}
            selected={i === selected}
            onSelect={() => onSelect(i)}
          />
        ))}
      </Box>
    </Box>
  )
}

export default CellStrip
