import React, { useEffect, useRef } from 'react'
import { Box, Typography } from '@mui/material'
import { lftGlyphWidth, lftGlyphHeight } from '@eriscorp/dalib-ts'
import { useLftFont, describeKey } from './lftFontContext'

/** One glyph's bitmap and metrics, read-only. LFT is not authored here. */

const ZOOM = 8

const Metric: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between' }}>
    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
      {label}
    </Typography>
    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
      {value}
    </Typography>
  </Box>
)

const LftGlyphInspector: React.FC<{ glyphKey: number }> = ({ glyphKey }) => {
  const { font } = useLftFont()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glyph = font.getGlyph(glyphKey)
  const pixels = font.getGlyphPixels(glyphKey)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || pixels.width === 0 || pixels.height === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const image = ctx.createImageData(pixels.width, pixels.height)
    for (let i = 0; i < pixels.width * pixels.height; i++) {
      const alpha = pixels.data[i] ?? 0
      image.data[i * 4] = 255
      image.data[i * 4 + 1] = 255
      image.data[i * 4 + 2] = 255
      image.data[i * 4 + 3] = alpha
    }
    ctx.clearRect(0, 0, pixels.width, pixels.height)
    ctx.putImageData(image, 0, 0)
  }, [pixels])

  if (!glyph) {
    return (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        No record for this key.
      </Typography>
    )
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        p: 1,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'background.paper',
        minWidth: 220
      }}
    >
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {describeKey(glyphKey)}
      </Typography>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          p: 1,
          bgcolor: 'background.default',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1
        }}
      >
        {pixels.width > 0 && pixels.height > 0 ? (
          <canvas
            ref={canvasRef}
            width={pixels.width}
            height={pixels.height}
            style={{
              width: pixels.width * ZOOM,
              height: pixels.height * ZOOM,
              imageRendering: 'pixelated'
            }}
          />
        ) : (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            This glyph has no bitmap.
          </Typography>
        )}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        <Metric label="advance" value={glyph.advance} />
        <Metric label="left" value={glyph.left} />
        <Metric label="top" value={glyph.top} />
        <Metric label="right" value={glyph.right} />
        <Metric label="bottom" value={glyph.bottom} />
        <Metric label="size" value={`${lftGlyphWidth(glyph)} × ${lftGlyphHeight(glyph)}`} />
        <Metric label="bitmap offset" value={glyph.bitmapOffset} />
      </Box>
    </Box>
  )
}

export default LftGlyphInspector
