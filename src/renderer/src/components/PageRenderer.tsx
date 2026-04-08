import React from 'react'
import { useRecoilValue } from 'recoil'
import { currentPageState } from '../recoil/atoms'
import CatalogPage from '../pages/CatalogPage'
import MapEditorPage from '../pages/MapEditorPage'
import WorldMapPage from '../pages/WorldMapPage'
import ArchivePage from '../pages/ArchivePage'
import SpritesPage from '../pages/SpritesPage'
import MusicPage from '../pages/MusicPage'
import SettingsPage from '../pages/SettingsPage'

const PageRenderer: React.FC = () => {
  const currentPage = useRecoilValue(currentPageState)

  switch (currentPage) {
    case 'catalog':    return <CatalogPage />
    case 'mapeditor':  return <MapEditorPage />
    case 'worldmap':   return <WorldMapPage />
    case 'archive':    return <ArchivePage />
    case 'sprites':    return <SpritesPage />
    case 'music':      return <MusicPage />
    case 'settings':   return <SettingsPage />
    default:           return <CatalogPage />
  }
}

export default PageRenderer
