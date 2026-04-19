import React from 'react'
import { useRecoilValue } from 'recoil'
import { currentPageState } from '../recoil/atoms'
import CatalogPage from '../pages/CatalogPage'
import MapEditorPage from '../pages/MapEditorPage'
import WorldMapPage from '../pages/WorldMapPage'
import ArchivePage from '../pages/ArchivePage'
import MapMakerPage from '../pages/MapMakerPage'
import MusicPage from '../pages/MusicPage'
import SfxPage from '../pages/SfxPage'
import SettingsPage from '../pages/SettingsPage'

const PageRenderer: React.FC = () => {
  const currentPage = useRecoilValue(currentPageState)

  switch (currentPage) {
    case 'catalog':    return <CatalogPage />
    case 'mapeditor':  return <MapEditorPage />
    case 'worldmap':   return <WorldMapPage />
    case 'archive':    return <ArchivePage />
    case 'mapmaker':   return <MapMakerPage />
    case 'music':      return <MusicPage />
    case 'sfx':        return <SfxPage />
    case 'settings':   return <SettingsPage />
    default:           return <CatalogPage />
  }
}

export default PageRenderer
