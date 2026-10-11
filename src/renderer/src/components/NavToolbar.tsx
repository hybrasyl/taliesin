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
  GiHexes,
  GiPaintBrush,
  GiMusicalNotes,
  GiSoundWaves,
  GiSettingsKnobs,
  GiAnvil,
  GiBlacksmith,
  GiBugNet
} from 'react-icons/gi'
import { useSettingsStore } from '../store/settingsStore'
import { useCompanionStatus } from '../hooks/useCompanionStatus'
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

/**
 * One button per page. Each carries `nav-<page>`, because
 * e2e/nav-pages.spec.js clicks every page in PAGES by that id (HTOO-393).
 */
const NavButton: React.FC<{ page: Page; title: string; icon: React.ReactElement }> = ({
  page,
  title,
  icon
}) => {
  const active = useUiStore((s) => s.currentPage === page)
  const setCurrentPage = useUiStore((s) => s.setCurrentPage)
  return (
    <Tooltip title={title}>
      <IconButton
        data-testid={`nav-${page}`}
        sx={active ? activeBtnSx : btnSx}
        onClick={() => setCurrentPage(page)}
      >
        {icon}
      </IconButton>
    </Tooltip>
  )
}

const NavToolbar: React.FC = () => {
  const setReportIssueOpen = useUiStore((s) => s.setReportIssueOpen)
  const activeLibrary = useSettingsStore((s) => s.activeLibrary)
  const libName = activeLibrary ? worldName(activeLibrary) : null
  const { found: companionFound } = useCompanionStatus()

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

      <NavButton page="dashboard" title="Dashboard" icon={<GiCastle />} />

      <Divider
        orientation="vertical"
        flexItem
        sx={{ mx: 1, borderColor: 'rgba(255,255,255,0.2)' }}
      />

      <NavButton page="catalog" title="Map Catalog" icon={<GiTreasureMap />} />
      <NavButton page="mapeditor" title="Map XML Editor" icon={<GiScrollQuill />} />
      <NavButton page="worldmap" title="World Map Editor" icon={<GiWorld />} />

      <Divider
        orientation="vertical"
        flexItem
        sx={{ mx: 1, borderColor: 'rgba(255,255,255,0.2)' }}
      />

      <NavButton page="archive" title="Archive Browser" icon={<GiArchiveResearch />} />
      <NavButton page="mapmaker" title="Map Maker" icon={<GiBrickWall />} />
      <NavButton page="prefabs" title="Prefab Catalog" icon={<GiPuzzle />} />
      <NavButton page="assetpacks" title="Asset Pack Manager" icon={<GiCardboardBox />} />
      <NavButton page="statictiles" title="Static Tile Manager" icon={<GiHexes />} />
      <NavButton page="uiforge" title="UI Layout Forge" icon={<GiBlacksmith />} />
      <NavButton page="palettes" title="Palettes & Duotone" icon={<GiPaintBrush />} />
      <NavButton page="music" title="Music Manager" icon={<GiMusicalNotes />} />
      <NavButton page="sfx" title="Sound Effects" icon={<GiSoundWaves />} />

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
      <NavButton page="settings" title="Settings" icon={<GiSettingsKnobs />} />
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
