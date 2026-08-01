import React, { useEffect, useMemo, useRef } from 'react'
import { Box, IconButton, Typography } from '@mui/material'
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import { lftGlyphWidth, lftGlyphHeight } from '@eriscorp/dalib-ts'
import { useLftFont, shortKey } from './lftFontContext'

/**
 * A page of glyphs drawn as one canvas.
 *
 * Paged rather than virtualised, following `TilesetPreview`: the cells are drawn
 * into a single canvas, so a page costs one element regardless of how many
 * glyphs it holds. `da.lft` has 65,535 records and only a few hundred are
 * populated, so the browsed list is `populatedKeys`, not the key space.
 */

const GLYPHS_PER_PAGE = 256
const COLUMNS = 16
/** Gap between cells, in unscaled pixels, so adjacent glyphs stay readable. */
const CELL_GAP = 1

interface Props {
  page: number
  zoom: number
  selectedKey: number | null
  onSelect: (key: number) => void
  onPageChange: (page: number) => void
}

const LftGlyphGrid: React.FC<Props> = ({ page, zoom, selectedKey, onSelect, onPageChange }) => {
  const { font, populatedKeys } = useLftFont()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const pageCount = Math.max(1, Math.ceil(populatedKeys.length / GLYPHS_PER_PAGE))
  const start = page * GLYPHS_PER_PAGE
  const keys = useMemo(
    () => populatedKeys.slice(start, start + GLYPHS_PER_PAGE),
    [populatedKeys, start]
  )

  // Cells are sized to the widest/tallest glyph on the page, never below the
  // font's nominal cell. A glyph's bounds can reach past the nominal box, and
  // clipping it would misreport the font.
  const { cellW, cellH } = useMemo(() => {
    let w = font.nominalWidth
    let h = font.nominalHeight
    for (const key of keys) {
      const glyph = font.getGlyph(key)
      if (!glyph) continue
      w = Math.max(w, glyph.left + lftGlyphWidth(glyph))
      h = Math.max(h, glyph.top + lftGlyphHeight(glyph))
    }
    return { cellW: w + CELL_GAP, cellH: h + CELL_GAP }
  }, [font, keys])

  const rows = Math.max(1, Math.ceil(keys.length / COLUMNS))
  const width = cellW * COLUMNS
  const height = cellH * rows

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const image = ctx.createImageData(width, height)
    keys.forEach((key, i) => {
      const glyph = font.getGlyph(key)
      if (!glyph) return
      const { width: gw, height: gh, data } = font.getGlyphPixels(key)
      if (gw === 0 || gh === 0) return
      const originX = (i % COLUMNS) * cellW + glyph.left
      const originY = Math.floor(i / COLUMNS) * cellH + glyph.top
      for (let y = 0; y < gh; y++) {
        const dstY = originY + y
        if (dstY < 0 || dstY >= height) continue
        for (let x = 0; x < gw; x++) {
          const dstX = originX + x
          if (dstX < 0 || dstX >= width) continue
          // The mask is one byte per pixel: 0 transparent, 255 ink.
          const alpha = data[y * gw + x] ?? 0
          if (alpha === 0) continue
          const off = (dstY * width + dstX) * 4
          image.data[off] = 255
          image.data[off + 1] = 255
          image.data[off + 2] = 255
          image.data[off + 3] = alpha
        }
      }
    })
    ctx.clearRect(0, 0, width, height)
    ctx.putImageData(image, 0, 0)
  }, [font, keys, cellW, cellH, width, height])

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    const col = Math.floor((event.clientX - rect.left) / (cellW * zoom))
    const row = Math.floor((event.clientY - rect.top) / (cellH * zoom))
    const index = row * COLUMNS + col
    const key = keys[index]
    if (key !== undefined) onSelect(key)
  }

  const selectedIndex = selectedKey === null ? -1 : keys.indexOf(selectedKey)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minHeight: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
        <IconButton
          size="small"
          aria-label="Previous page"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
        >
          <NavigateBeforeIcon fontSize="small" />
        </IconButton>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Glyphs {populatedKeys.length === 0 ? 0 : start + 1}–{start + keys.length} of{' '}
          {populatedKeys.length}
        </Typography>
        <IconButton
          size="small"
          aria-label="Next page"
          disabled={page >= pageCount - 1}
          onClick={() => onPageChange(page + 1)}
        >
          <NavigateNextIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box sx={{ overflow: 'auto', position: 'relative', minHeight: 0 }}>
        <Box sx={{ position: 'relative', width: width * zoom, height: height * zoom }}>
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            onClick={handleClick}
            style={{
              width: width * zoom,
              height: height * zoom,
              imageRendering: 'pixelated',
              cursor: 'pointer',
              display: 'block'
            }}
          />
          {selectedIndex >= 0 && (
            <Box
              sx={{
                position: 'absolute',
                pointerEvents: 'none',
                border: '1px solid',
                borderColor: 'primary.main',
                left: (selectedIndex % COLUMNS) * cellW * zoom,
                top: Math.floor(selectedIndex / COLUMNS) * cellH * zoom,
                width: cellW * zoom,
                height: cellH * zoom
              }}
            />
          )}
        </Box>
      </Box>
      {keys.length > 0 && (
        <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>
          Keys {shortKey(keys[0]!)}–{shortKey(keys[keys.length - 1]!)} · click a glyph to inspect it
        </Typography>
      )}
    </Box>
  )
}

export { GLYPHS_PER_PAGE }
export default LftGlyphGrid
