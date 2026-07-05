import React from 'react'
import { Toolbar, IconButton, Tooltip, Box, Typography } from '@mui/material'
import { GiContract, GiExpand, GiDeathSkull } from 'react-icons/gi'

// Shared shadow vocabulary for the title bar (ported from Oghma). KEYLINE is the
// crisp four-way #000 outline; DEPTH is the soft layer that lifts the glyph off
// the bar.
const KEYLINE = ['1px 1px 0 #000', '-1px -1px 0 #000', '1px -1px 0 #000', '-1px 1px 0 #000']
const DEPTH = '0 2px 3px rgba(0,0,0,0.55)'

// The wordmark is real text: CSS text-shadow paints every layer independently
// from the glyph, so keyline + depth both read at full strength.
const TITLE_TEXT_SHADOW = [...KEYLINE, DEPTH].join(', ')

const iconSx = {
  '& svg': {
    fontSize: '1.4em',
    // SVG glyphs can't take text-shadow, so the keyline comes from a solid
    // (full-opacity) stroke and the depth from a SINGLE drop-shadow — chaining
    // the four keyline offsets as drop-shadows too would compound and wash the
    // depth layer out. One depth shadow off the crisp stroked glyph matches the
    // wordmark's lift.
    stroke: '#000',
    strokeWidth: 11,
    filter: `drop-shadow(${DEPTH})`
  }
}

const winBtnSx = {
  WebkitAppRegion: 'no-drag',
  color: 'text.button',
  ...iconSx,
  '&:hover': {
    backgroundColor: 'info.main',
    color: 'text.dark'
  }
} as const

const TitleBar: React.FC = () => {
  return (
    <Toolbar variant="dense" sx={{ bgcolor: 'secondary.main', minHeight: 36, px: 1.5 }}>
      <img
        src="./taliesin.png"
        alt="Taliesin"
        style={{ height: 28, marginRight: 8, filter: `drop-shadow(${DEPTH})` }}
      />
      <Typography
        variant="h6"
        sx={{
          fontWeight: 'bold',
          flexGrow: 0,
          fontSize: '1.5rem',
          textShadow: TITLE_TEXT_SHADOW
        }}
      >
        Taliesin
      </Typography>

      <Box sx={{ flexGrow: 1 }} />

      <Tooltip title="Minimize">
        <IconButton size="small" sx={winBtnSx} onClick={() => window.api.minimizeWindow()}>
          <GiContract />
        </IconButton>
      </Tooltip>
      <Tooltip title="Maximize">
        <IconButton size="small" sx={winBtnSx} onClick={() => window.api.maximizeWindow()}>
          <GiExpand />
        </IconButton>
      </Tooltip>
      <Tooltip title="Close">
        <IconButton
          size="small"
          sx={{
            ...winBtnSx,
            '&:hover': { backgroundColor: 'info.main', color: 'warning.main' }
          }}
          onClick={() => window.api.closeWindow()}
        >
          <GiDeathSkull />
        </IconButton>
      </Tooltip>
    </Toolbar>
  )
}

export default TitleBar
