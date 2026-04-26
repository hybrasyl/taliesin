import React, { useCallback, useMemo } from 'react'
import { Box, Button, Stack, Typography } from '@mui/material'
import RestoreIcon from '@mui/icons-material/Restore'
import ClearIcon from '@mui/icons-material/Clear'
import {
  codepointLabel,
  formatCodepoint,
  getBlock,
  OTHER_BLOCK
} from '../../utils/unicodeBlocks'

const GLYPH_WIDTH = 8
const GLYPH_HEIGHT = 12
const CELL = 36

interface Props {
  glyph: Uint8Array | null
  index: number | null
  codepoint: number | null
  onPixelToggle: (x: number, y: number) => void
  onReset: () => void
  onClear: () => void
  resetDisabled?: boolean
}

const FontPixelEditor: React.FC<Props> = ({
  glyph,
  index,
  codepoint,
  onPixelToggle,
  onReset,
  onClear,
  resetDisabled
}) => {
  const cells = useMemo(() => {
    if (!glyph) return null
    const out: boolean[][] = []
    for (let y = 0; y < GLYPH_HEIGHT; y++) {
      const row: boolean[] = []
      const byte = glyph[y]
      for (let x = 0; x < GLYPH_WIDTH; x++) {
        row.push(((byte >> (7 - x)) & 1) === 1)
      }
      out.push(row)
    }
    return out
  }, [glyph])

  const handleCell = useCallback(
    (x: number, y: number) => () => onPixelToggle(x, y),
    [onPixelToggle]
  )

  if (glyph === null || cells === null || index === null || codepoint === null) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">Select a glyph to edit</Typography>
      </Box>
    )
  }

  const block = getBlock(codepoint)
  const blockLabel = block === OTHER_BLOCK ? 'Other' : block.name
  const label = codepointLabel(codepoint)

  return (
    <Stack spacing={1.5} sx={{ p: 2, alignItems: 'center' }}>
      <Typography variant="caption" color="text.secondary">
        Idx {index} · {formatCodepoint(codepoint)}
        {label ? ` '${label}'` : ''} · {blockLabel}
      </Typography>
      <Box
        sx={{
          display: 'inline-grid',
          gridTemplateColumns: `repeat(${GLYPH_WIDTH}, ${CELL}px)`,
          gridTemplateRows: `repeat(${GLYPH_HEIGHT}, ${CELL}px)`,
          gap: '1px',
          bgcolor: 'divider',
          border: '1px solid',
          borderColor: 'divider',
          userSelect: 'none'
        }}
      >
        {cells.flatMap((row, y) =>
          row.map((on, x) => (
            <Box
              key={`${x},${y}`}
              onClick={handleCell(x, y)}
              sx={{
                width: CELL,
                height: CELL,
                bgcolor: on ? '#fff' : '#000',
                cursor: 'pointer',
                '&:hover': {
                  outline: '1px solid',
                  outlineColor: 'primary.main',
                  outlineOffset: -1
                }
              }}
            />
          ))
        )}
      </Box>
      <Stack direction="row" spacing={1}>
        <Button
          size="small"
          startIcon={<RestoreIcon />}
          onClick={onReset}
          disabled={resetDisabled}
        >
          Reset glyph
        </Button>
        <Button size="small" startIcon={<ClearIcon />} onClick={onClear}>
          Clear glyph
        </Button>
      </Stack>
    </Stack>
  )
}

export default FontPixelEditor
