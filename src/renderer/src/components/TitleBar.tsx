import React from 'react'
import { Toolbar, IconButton, Tooltip, Box, Typography } from '@mui/material'
import { GiContract, GiExpand, GiDeathSkull } from 'react-icons/gi'

const iconSx = {
  '& svg': {
    fontSize: '1.4em',
    stroke: 'rgba(0,0,0,0.25)',
    strokeWidth: 44
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
      <img src="/taliesin.png" alt="Taliesin" style={{ height: 28, marginRight: 8 }} />
      <Typography variant="h6" sx={{ fontWeight: 'bold', flexGrow: 0, fontSize: '1.5rem' }}>
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
