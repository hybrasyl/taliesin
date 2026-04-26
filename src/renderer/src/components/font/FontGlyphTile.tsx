import React, { useEffect, useRef } from 'react'
import { Box, Typography } from '@mui/material'
import { codepointLabel, formatCodepoint } from '../../utils/unicodeBlocks'

const GLYPH_WIDTH = 8
const GLYPH_HEIGHT = 12
const SCALE = 3

export type FontGlyphTileVariant = 'filled' | 'placeholder'

interface Props {
  glyph?: Uint8Array
  index: number
  codepoint: number
  selected?: boolean
  variant?: FontGlyphTileVariant
  onClick?: () => void
}

const FontGlyphTile: React.FC<Props> = ({
  glyph,
  index,
  codepoint,
  selected = false,
  variant = 'filled',
  onClick
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (variant !== 'filled') return
    const canvas = canvasRef.current
    if (!canvas || !glyph) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = GLYPH_WIDTH
    canvas.height = GLYPH_HEIGHT
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, GLYPH_WIDTH, GLYPH_HEIGHT)
    const img = ctx.getImageData(0, 0, GLYPH_WIDTH, GLYPH_HEIGHT)
    const data = img.data
    for (let y = 0; y < GLYPH_HEIGHT; y++) {
      const row = glyph[y]
      for (let x = 0; x < GLYPH_WIDTH; x++) {
        if (((row >> (7 - x)) & 1) === 0) continue
        const off = (y * GLYPH_WIDTH + x) * 4
        data[off] = 255
        data[off + 1] = 255
        data[off + 2] = 255
        data[off + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [glyph, variant])

  const label = codepointLabel(codepoint)
  const cpLabel = formatCodepoint(codepoint)
  // Multi-char mnemonics (NUL, NBSP, …) need to shrink to fit a ~40px tile.
  const labelFontSize = label.length > 1 ? 9 : 12

  return (
    <Box
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.25,
        p: 0.5,
        cursor: onClick ? 'pointer' : 'default',
        border: '2px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        borderStyle: variant === 'placeholder' ? 'dashed' : 'solid',
        borderRadius: 1,
        bgcolor: selected ? 'action.selected' : 'background.paper',
        '&:hover': onClick ? { bgcolor: 'action.hover' } : undefined,
        minWidth: GLYPH_WIDTH * SCALE + 16
      }}
    >
      {variant === 'filled' ? (
        <canvas
          ref={canvasRef}
          style={{
            width: GLYPH_WIDTH * SCALE,
            height: GLYPH_HEIGHT * SCALE,
            imageRendering: 'pixelated',
            background: '#000'
          }}
        />
      ) : (
        <Box
          sx={{
            width: GLYPH_WIDTH * SCALE,
            height: GLYPH_HEIGHT * SCALE,
            border: '1px dashed',
            borderColor: 'divider',
            opacity: 0.4
          }}
        />
      )}
      <Typography variant="caption" sx={{ fontSize: 9, lineHeight: 1, color: 'text.secondary' }}>
        {index >= 0 ? `#${index}` : '—'}
      </Typography>
      <Typography variant="caption" sx={{ fontSize: 9, lineHeight: 1, color: 'text.secondary' }}>
        {cpLabel}
      </Typography>
      <Typography
        variant="caption"
        sx={{ fontSize: labelFontSize, lineHeight: 1, fontFamily: 'monospace', minHeight: 14 }}
      >
        {label || ' '}
      </Typography>
    </Box>
  )
}

export default FontGlyphTile
