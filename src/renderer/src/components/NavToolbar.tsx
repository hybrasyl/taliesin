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
import { BUTTON, chromeKind, type ChromeKind } from './titleChrome'

const iconSx = {
  '& svg': {
    fontSize: '1.4em',
    stroke: 'rgba(0,0,0,0.25)',
    strokeWidth: 44
  }
}

/**
 * The nav bar is `secondary.main`, like the title bar, so its icons and caption
 * take the title bar's colours: `secondary.contrastText` at rest, and the house
 * hover of each chrome kind (titleChrome.ts). The decorated hover is
 * `info.main` with `info.contrastText`; the plain one is a white wash. Every
 * decorated bar is dark with light text, so nothing is engraved (HTOO-572).
 */
function navBtnSx(kind: ChromeKind): object {
  const c = BUTTON[kind]
  return {
    WebkitAppRegion: 'no-drag',
    mx: -0.5,
    color: c.color,
    ...iconSx,
    '&:hover': { backgroundColor: c.hoverBackground, color: c.hoverColor }
  }
}

/**
 * The open page's button. Its icon stays `secondary.contrastText`: the old
 * `secondary.dark` was the bar colour as text, 1.2:1 to 1.5:1 on the bar in
 * five themes. A white wash and a line along the button's lower edge mark it
 * instead, so the mark does not depend on a colour (HTOO-572).
 */
function activeNavBtnSx(kind: ChromeKind): object {
  return {
    ...navBtnSx(kind),
    backgroundColor: 'rgba(255,255,255,0.16)',
    boxShadow: 'inset 0 -2px 0 currentColor'
  }
}

/** The chrome kind of the active theme: plain for the corporate themes. */
function useChromeKind(): ChromeKind {
  return chromeKind(useSettingsStore((s) => s.theme))
}

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
  const kind = useChromeKind()
  const setCurrentPage = useUiStore((s) => s.setCurrentPage)
  return (
    <Tooltip title={title}>
      <IconButton
        data-testid={`nav-${page}`}
        sx={active ? activeNavBtnSx(kind) : navBtnSx(kind)}
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
  const barBtnSx = navBtnSx(useChromeKind())

  return (
    <Toolbar variant="dense" sx={{ bgcolor: 'secondary.main', minHeight: 40, opacity: 0.9 }}>
      {libName ? (
        <Typography
          variant="caption"
          sx={{
            color: 'secondary.contrastText',
            opacity: 0.7,
            letterSpacing: '0.03em'
          }}
        >
          Current Library: <strong>{libName}</strong>
        </Typography>
      ) : (
        // The bar's text colour, faded like the caption above. text.disabled is
        // a page colour: on danaan's bar it was 1.4:1 (HTOO-572).
        <Typography variant="caption" sx={{ color: 'secondary.contrastText', opacity: 0.7 }}>
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
        <IconButton sx={barBtnSx} onClick={() => setReportIssueOpen(true)}>
          <GiBugNet />
        </IconButton>
      </Tooltip>
      <NavButton page="settings" title="Settings" icon={<GiSettingsKnobs />} />
      <Tooltip title={companionFound ? 'Launch Creidhne' : 'Creidhne not found — see Settings'}>
        <span>
          <IconButton
            sx={barBtnSx}
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
