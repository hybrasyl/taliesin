import React from 'react'
import { Toolbar, IconButton, Tooltip, Divider, Box, Typography } from '@mui/material'
import {
  GiCastle,
  GiTreasureMap,
  GiScrollQuill,
  GiWorld,
  GiArchiveResearch,
  GiBrickWall,
  GiPuzzle,
  GiCardboardBox,
  GiMusicalNotes,
  GiSoundWaves,
  GiSettingsKnobs
} from 'react-icons/gi'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { useRecoilState, useRecoilValue } from 'recoil'
import { currentPageState, activeLibraryState, Page } from '../recoil/atoms'
import { worldName } from '../hooks/useCatalog'
import AboutDialog from './AboutDialog'

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
  const activeLibrary = useRecoilValue(activeLibraryState)
  const libName = activeLibrary ? worldName(activeLibrary) : null
  const [aboutOpen, setAboutOpen] = React.useState(false)

  const nav = (page: Page) => () => setCurrentPage(page)
  const sx = (page: Page) => (currentPage === page ? activeBtnSx : btnSx)

  return (
    <Toolbar variant="dense" sx={{ bgcolor: 'secondary.main', minHeight: 40, opacity: 0.9 }}>
      {libName ? (
        <Typography variant="caption" sx={{ color: 'text.button', opacity: 0.7, letterSpacing: '0.03em' }}>
          Current Library: <strong>{libName}</strong>
        </Typography>
      ) : (
        <Typography variant="caption" sx={{ color: 'text.disabled', opacity: 0.5 }}>
          No library selected
        </Typography>
      )}
      <Box sx={{ flexGrow: 1 }} />

      <Tooltip title="Dashboard">
        <IconButton sx={sx('dashboard')} onClick={nav('dashboard')}>
          <GiCastle />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 1, borderColor: 'rgba(255,255,255,0.2)' }} />

      <Tooltip title="Map Catalog">
        <IconButton sx={sx('catalog')} onClick={nav('catalog')}>
          <GiTreasureMap />
        </IconButton>
      </Tooltip>
      <Tooltip title="Map XML Editor">
        <IconButton sx={sx('mapeditor')} onClick={nav('mapeditor')}>
          <GiScrollQuill />
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
      <Tooltip title="Map Maker">
        <IconButton sx={sx('mapmaker')} onClick={nav('mapmaker')}>
          <GiBrickWall />
        </IconButton>
      </Tooltip>
      <Tooltip title="Prefab Catalog">
        <IconButton sx={sx('prefabs')} onClick={nav('prefabs')}>
          <GiPuzzle />
        </IconButton>
      </Tooltip>
      <Tooltip title="Asset Pack Manager">
        <IconButton sx={sx('assetpacks')} onClick={nav('assetpacks')}>
          <GiCardboardBox />
        </IconButton>
      </Tooltip>
      <Tooltip title="Music Manager">
        <IconButton sx={sx('music')} onClick={nav('music')}>
          <GiMusicalNotes />
        </IconButton>
      </Tooltip>
      <Tooltip title="Sound Effects">
        <IconButton sx={sx('sfx')} onClick={nav('sfx')}>
          <GiSoundWaves />
        </IconButton>
      </Tooltip>

      <Box sx={{ flexGrow: 1 }} />

      <Divider orientation="vertical" flexItem sx={{ mx: 1, borderColor: 'rgba(255,255,255,0.2)' }} />

      <Tooltip title="Settings">
        <IconButton sx={sx('settings')} onClick={nav('settings')}>
          <GiSettingsKnobs />
        </IconButton>
      </Tooltip>
      <Tooltip title="About Taliesin">
        <IconButton sx={btnSx} onClick={() => setAboutOpen(true)}>
          <InfoOutlinedIcon sx={{ fontSize: '1.2em' }} />
        </IconButton>
      </Tooltip>

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </Toolbar>
  )
}

export default NavToolbar
