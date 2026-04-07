import React from 'react'
import { Toolbar, IconButton, Tooltip, Divider, Box } from '@mui/material'
import {
  GiTreasureMap,
  GiParchment,
  GiWorld,
  GiArchiveResearch,
  GiSpellBook,
  GiSettingsKnobs
} from 'react-icons/gi'
import { useRecoilState } from 'recoil'
import { currentPageState, Page } from '../recoil/atoms'

const iconSx = {
  '& svg': {
    fontSize: '1.4em',
    stroke: 'rgba(0,0,0,0.25)',
    strokeWidth: 44
  }
}

const btnSx = {
  WebkitAppRegion: 'no-drag',
  mx: -0.5,
  color: 'text.button',
  ...iconSx,
  '&:hover': {
    backgroundColor: 'info.main',
    color: 'text.dark'
  }
} as const

const activeBtnSx = {
  ...btnSx,
  color: 'secondary.dark',
  backgroundColor: 'rgba(255,255,255,0.08)'
} as const

const NavToolbar: React.FC = () => {
  const [currentPage, setCurrentPage] = useRecoilState(currentPageState)

  const nav = (page: Page) => () => setCurrentPage(page)
  const sx = (page: Page) => (currentPage === page ? activeBtnSx : btnSx)

  return (
    <Toolbar variant="dense" sx={{ bgcolor: 'secondary.main', minHeight: 40, opacity: 0.9 }}>
      <Box sx={{ flexGrow: 1 }} />

      <Tooltip title="Map Catalog">
        <IconButton sx={sx('catalog')} onClick={nav('catalog')}>
          <GiTreasureMap />
        </IconButton>
      </Tooltip>
      <Tooltip title="Map XML Editor">
        <IconButton sx={sx('mapeditor')} onClick={nav('mapeditor')}>
          <GiParchment />
        </IconButton>
      </Tooltip>
      <Tooltip title="World Map Editor">
        <IconButton sx={sx('worldmap')} onClick={nav('worldmap')}>
          <GiWorld />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 1, borderColor: 'rgba(255,255,255,0.2)' }} />

      <Tooltip title="Archive Browser">
        <IconButton sx={sx('archive')} onClick={nav('archive')}>
          <GiArchiveResearch />
        </IconButton>
      </Tooltip>
      <Tooltip title="Sprite Viewer">
        <IconButton sx={sx('sprites')} onClick={nav('sprites')}>
          <GiSpellBook />
        </IconButton>
      </Tooltip>

      <Box sx={{ flexGrow: 1 }} />

      <Divider orientation="vertical" flexItem sx={{ mx: 1, borderColor: 'rgba(255,255,255,0.2)' }} />

      <Tooltip title="Settings">
        <IconButton sx={sx('settings')} onClick={nav('settings')}>
          <GiSettingsKnobs />
        </IconButton>
      </Tooltip>
    </Toolbar>
  )
}

export default NavToolbar
