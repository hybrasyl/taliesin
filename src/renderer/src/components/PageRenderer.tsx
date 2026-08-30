import React, { useEffect, useState } from 'react'
import { Box } from '@mui/material'
import { useUiStore, type Page } from '../store/uiStore'
import DashboardPage from '../pages/DashboardPage'
import CatalogPage from '../pages/CatalogPage'
import MapEditorPage from '../pages/MapEditorPage'
import WorldMapPage from '../pages/WorldMapPage'
import ArchivePage from '../pages/ArchivePage'
import MapMakerPage from '../pages/MapMakerPage'
import PrefabCatalogPage from '../pages/PrefabCatalogPage'
import AssetPackPage from '../pages/AssetPackPage'
import StaticTileManagerPage from '../pages/StaticTileManagerPage'
import UiForgePage from '../pages/UiForgePage'
import PalettePage from '../pages/PalettePage'
import MusicPage from '../pages/MusicPage'
import SfxPage from '../pages/SfxPage'
import SettingsPage from '../pages/SettingsPage'

/**
 * The page switch, plus one kept-alive page.
 *
 * Pages unmount on navigation, which is right for most of them and wrong for
 * the XML map editor: its open map, edits, tab and zoom all live in component
 * state, so a trip to the tile picker and back meant reopening the map. The
 * Map Maker keeps its maps across navigation through its store; the XML editor
 * keeps its whole subtree instead — mounted on first visit, then hidden rather
 * than unmounted. Session-only by construction: nothing is written anywhere.
 *
 * `display: contents` when visible keeps the layout identical to a bare page;
 * `display: none` when hidden keeps the subtree alive but out of the flow and
 * out of hit-testing. The editor's own window key listener checks the current
 * page, so a hidden editor does not answer keys meant for the visible one.
 */
const PageRenderer: React.FC = () => {
  const currentPage = useUiStore((s) => s.currentPage)
  const [mapEditorMounted, setMapEditorMounted] = useState(false)
  useEffect(() => {
    if (currentPage === 'mapeditor') setMapEditorMounted(true)
  }, [currentPage])

  const mapEditorVisible = currentPage === 'mapeditor'
  const keptAlive = mapEditorMounted && (
    <Box sx={{ display: mapEditorVisible ? 'contents' : 'none' }}>
      <MapEditorPage />
    </Box>
  )

  return (
    <>
      {keptAlive}
      {!mapEditorVisible && <CurrentPage page={currentPage} />}
    </>
  )
}

const CurrentPage: React.FC<{ page: Page }> = ({ page }) => {
  switch (page) {
    case 'dashboard':
      return <DashboardPage />
    case 'catalog':
      return <CatalogPage />
    case 'mapeditor':
      return null // kept alive above
    case 'worldmap':
      return <WorldMapPage />
    case 'archive':
      return <ArchivePage />
    case 'mapmaker':
      return <MapMakerPage />
    case 'prefabs':
      return <PrefabCatalogPage />
    case 'assetpacks':
      return <AssetPackPage />
    case 'statictiles':
      return <StaticTileManagerPage />
    case 'uiforge':
      return <UiForgePage />
    case 'palettes':
      return <PalettePage />
    case 'music':
      return <MusicPage />
    case 'sfx':
      return <SfxPage />
    case 'settings':
      return <SettingsPage />
    default:
      return <DashboardPage />
  }
}

export default PageRenderer
