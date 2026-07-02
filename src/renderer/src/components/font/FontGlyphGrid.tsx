import React from 'react'
import { Box, Tooltip } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import FontGlyphTile from './FontGlyphTile'
import { GLYPH_GRID_SX } from './glyph'

interface Props {
  glyphs: Uint8Array[]
  startCodepoint: number
  selectedIndex: number | null
  onSelect: (index: number) => void
  onAppend: () => void
}

const FontGlyphGrid: React.FC<Props> = ({
  glyphs,
  startCodepoint,
  selectedIndex,
  onSelect,
  onAppend
}) => {
  return (
    <Box sx={GLYPH_GRID_SX}>
      {glyphs.map((g, i) => (
        <FontGlyphTile
          key={i}
          glyph={g}
          index={i}
          codepoint={startCodepoint + i}
          selected={selectedIndex === i}
          onClick={() => onSelect(i)}
        />
      ))}
      <Tooltip title="Append blank glyph">
        <Box
          onClick={onAppend}
          role="button"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 64,
            border: '2px dashed',
            borderColor: 'divider',
            borderRadius: 1,
            cursor: 'pointer',
            color: 'text.secondary',
            '&:hover': { bgcolor: 'action.hover', borderColor: 'primary.main' }
          }}
        >
          <AddIcon />
        </Box>
      </Tooltip>
    </Box>
  )
}

export default FontGlyphGrid
