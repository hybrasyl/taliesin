import React, { useEffect, useState } from 'react'
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
  GiHexes,
  GiPaintBrush,
  GiMusicalNotes,
  GiSoundWaves,
  GiSettingsKnobs,
  GiAnvil,
  GiBlacksmith,
  GiBugNet
} from 'react-icons/gi'
import { useSettingsStore, flushSettings } from '../store/settingsStore'
import { useUiStore, Page } from '../store/uiStore'
import { worldName } from '../hooks/useCatalog'

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
  // Tripled self-selector raises specificity so the active tint (secondary.dark)
  // wins over any theme-level chrome icon color — e.g. the Mundanes theme forces
  // all chrome IconButtons white. A no-op for themes without that override.
  '&&&': { color: 'secondary.dark' },
  backgroundColor: 'rgba(255,255,255,0.08)'
} as const

const NavToolbar: React.FC = () => {
  const currentPage = useUiStore((s) => s.currentPage)
  const setCurrentPage = useUiStore((s) => s.setCurrentPage)
  const setReportIssueOpen = useUiStore((s) => s.setReportIssueOpen)
  const activeLibrary = useSettingsStore((s) => s.activeLibrary)
  const libName = activeLibrary ? worldName(activeLibrary) : null
  const companionPath = useSettingsStore((s) => s.companionPath)
  // Resolved by main, not read from settings: the button must work before anyone
  // visits Settings, because Creidhne is usually found without being configured
  // (HTOO-292). Re-asked when the override changes so clearing it is visible.
  const [companionFound, setCompanionFound] = useState(false)
  useEffect(() => {
    let cancelled = false
    // Flushed first for the same reason as the Settings card: main reads the
    // override from disk, and the store's write is debounced.
    void (async () => {
      try {
        await flushSettings()
        const s = await window.api.companionStatus()
        if (!cancelled) setCompanionFound(!!s.resolved)
      } catch {
        if (!cancelled) setCompanionFound(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [companionPath])

  const nav = (page: Page) => () => setCurrentPage(page)
  const sx = (page: Page) => (currentPage === page ? activeBtnSx : btnSx)

  return (
    <Toolbar variant="dense" sx={{ bgcolor: 'secondary.main', minHeight: 40, opacity: 0.9 }}>
      {libName ? (
        <Typography
          variant="caption"
          sx={{ color: 'text.button', opacity: 0.7, letterSpacing: '0.03em' }}
        >
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

      <Divider
        orientation="vertical"
        flexItem
        sx={{ mx: 1, borderColor: 'rgba(255,255,255,0.2)' }}
      />

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

      <Divider
        orientation="vertical"
        flexItem
        sx={{ mx: 1, borderColor: 'rgba(255,255,255,0.2)' }}
      />

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
        <IconButton data-testid="nav-assetpacks" sx={sx('assetpacks')} onClick={nav('assetpacks')}>
          <GiCardboardBox />
        </IconButton>
      </Tooltip>
      <Tooltip title="Static Tile Manager">
        <IconButton sx={sx('statictiles')} onClick={nav('statictiles')}>
          <GiHexes />
        </IconButton>
      </Tooltip>
      <Tooltip title="UI Layout Forge">
        <IconButton sx={sx('uiforge')} onClick={nav('uiforge')}>
          <GiBlacksmith />
        </IconButton>
      </Tooltip>
      <Tooltip title="Palettes & Duotone">
        <IconButton sx={sx('palettes')} onClick={nav('palettes')}>
          <GiPaintBrush />
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

      <Divider
        orientation="vertical"
        flexItem
        sx={{ mx: 1, borderColor: 'rgba(255,255,255,0.2)' }}
      />

      <Tooltip title="Report an issue">
        <IconButton sx={btnSx} onClick={() => setReportIssueOpen(true)}>
          <GiBugNet />
        </IconButton>
      </Tooltip>
      <Tooltip title="Settings">
        {/* Only the two pages an e2e spec navigates to carry a testid -- this one
            and Asset Pack Manager below. The rest get one when a spec needs them:
            a testid with no spec behind it is an untested claim about what
            matters (HTOO-174). */}
        <IconButton data-testid="nav-settings" sx={sx('settings')} onClick={nav('settings')}>
          <GiSettingsKnobs />
        </IconButton>
      </Tooltip>
      <Tooltip title={companionFound ? 'Launch Creidhne' : 'Creidhne not found — see Settings'}>
        <span>
          <IconButton
            sx={btnSx}
            disabled={!companionFound}
            onClick={() => void window.api.launchCompanion()}
          >
            <GiAnvil />
          </IconButton>
        </span>
      </Tooltip>
    </Toolbar>
  )
}

export default NavToolbar
