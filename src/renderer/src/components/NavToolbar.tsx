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
import { chromeKind, navButtonSx, type ChromeKind } from './titleChrome'

/**
 * The size and the soft dark outline of the game-icons glyphs, and the tight
 * spacing of the row. These are layout only. The colours, the hover and the
 * current-page mark are the house `navButtonSx` (titleChrome.ts): the bar's
 * text colour at rest, the house hover of each chrome kind, and a light wash
 * with a ring for the current page (HTOO-572).
 */
const layoutSx = {
  mx: -0.5,
  '& svg': {
    fontSize: '1.4em',
    stroke: 'rgba(0,0,0,0.25)',
    strokeWidth: 44
  }
}

/** A nav-bar button: the house colours and mark, with this bar's layout. */
function navBtnSx(kind: ChromeKind, current = false): object {
  return { ...navButtonSx(kind, current), ...layoutSx }
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
        sx={navBtnSx(kind, active)}
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
    // No opacity on the bar or its captions: a fade is not in the computed
    // colour, and it took the captions below 4.5:1 on screen in hybrasyl,
    // danaan and grinneal. The caption variant and the letter-spacing keep the
    // captions quiet (HTOO-572).
    //
    // The bar paints tertiary.main, so it reads as its own bar; with
    // secondary.main, the title bar's colour, the two read as one band. Its
    // text keeps secondary.contrastText, which tertiary.contrastText repeats
    // (HTOO-629).
    <Toolbar variant="dense" sx={{ bgcolor: 'tertiary.main', minHeight: 40 }}>
      {libName ? (
        <Typography
          variant="caption"
          sx={{ color: 'secondary.contrastText', letterSpacing: '0.03em' }}
        >
          Current Library: <strong>{libName}</strong>
        </Typography>
      ) : (
        // The bar's text colour, like the caption above. text.disabled is a
        // page colour: on danaan's bar it was 1.4:1 (HTOO-572).
        <Typography
          variant="caption"
          sx={{ color: 'secondary.contrastText', letterSpacing: '0.03em' }}
        >
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
