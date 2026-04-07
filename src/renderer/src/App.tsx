import React, { useEffect, useCallback, useRef } from 'react'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { useRecoilState, useRecoilValue } from 'recoil'
import {
  themeState,
  currentPageState,
  clientPathState,
  librariesState,
  activeLibraryState,
  mapDirectoriesState,
  activeMapDirectoryState,
  dirtyEditorState,
  ThemeName,
  type MapDirectory
} from './recoil/atoms'
import { hybrasylTheme, chadulTheme, danaanTheme, grinnealTheme } from './themes'
import type { Theme } from '@mui/material/styles'
import MainLayout from './components/MainLayout'
import PageRenderer from './components/PageRenderer'
import UnsavedChangesDialog from './components/UnsavedChangesDialog'

const themes: Record<ThemeName, Theme> = {
  hybrasyl: hybrasylTheme,
  chadul:   chadulTheme,
  danaan:   danaanTheme,
  grinneal: grinnealTheme
}

export default function App(): React.ReactElement {
  const [theme, setTheme] = useRecoilState(themeState)
  const [, setClientPath] = useRecoilState(clientPathState)
  const [, setLibraries] = useRecoilState(librariesState)
  const [, setActiveLibrary] = useRecoilState(activeLibraryState)
  const [, setMapDirectories] = useRecoilState(mapDirectoriesState)
  const [, setActiveMapDirectory] = useRecoilState(activeMapDirectoryState)
  const [, setCurrentPage] = useRecoilState(currentPageState)
  const [dirtyEditor, setDirtyEditor] = useRecoilState(dirtyEditorState)

  const [navDialogOpen, setNavDialogOpen] = React.useState(false)
  const [pendingPage, setPendingPage] = React.useState<string | null>(null)
  const dirtyEditorRef = useRef(dirtyEditor)

  // Load settings on mount
  useEffect(() => {
    window.api.loadSettings().then((s) => {
      const settings = s as Record<string, unknown>
      if (settings.theme && settings.theme in themes) setTheme(settings.theme as ThemeName)
      if (typeof settings.clientPath === 'string') setClientPath(settings.clientPath)
      if (Array.isArray(settings.libraries)) setLibraries(settings.libraries as string[])
      if (typeof settings.activeLibrary === 'string') setActiveLibrary(settings.activeLibrary)
      if (Array.isArray(settings.mapDirectories)) setMapDirectories(settings.mapDirectories as MapDirectory[])
      if (typeof settings.activeMapDirectory === 'string') setActiveMapDirectory(settings.activeMapDirectory)
    })
  }, [])

  // Persist settings when they change
  const clientPath = useRecoilValue(clientPathState)
  const libraries = useRecoilValue(librariesState)
  const activeLibrary = useRecoilValue(activeLibraryState)
  const mapDirectories = useRecoilValue(mapDirectoriesState)
  const activeMapDirectory = useRecoilValue(activeMapDirectoryState)

  useEffect(() => {
    window.api.saveSettings({ theme, clientPath, libraries, activeLibrary, mapDirectories, activeMapDirectory })
  }, [theme, clientPath, libraries, activeLibrary, mapDirectories, activeMapDirectory])

  // Keep ref in sync for the close listener
  useEffect(() => { dirtyEditorRef.current = dirtyEditor }, [dirtyEditor])

  const handleNavDiscard = useCallback(() => {
    setNavDialogOpen(false)
    setDirtyEditor(null)
    if (pendingPage) setCurrentPage(pendingPage as never)
    setPendingPage(null)
  }, [pendingPage, setCurrentPage, setDirtyEditor])

  const handleNavSave = useCallback(async () => {
    setNavDialogOpen(false)
    try {
      await dirtyEditor?.onSave()
    } catch { return }
    if (pendingPage) setCurrentPage(pendingPage as never)
    setPendingPage(null)
  }, [pendingPage, dirtyEditor, setCurrentPage])

  const handleNavCancel = useCallback(() => {
    setNavDialogOpen(false)
    setPendingPage(null)
  }, [])

  return (
    <ThemeProvider theme={themes[theme] ?? hybrasylTheme}>
      <CssBaseline />
      <MainLayout>
        <PageRenderer />
      </MainLayout>
      <UnsavedChangesDialog
        open={navDialogOpen}
        label={dirtyEditor?.label}
        onSave={handleNavSave}
        onDiscard={handleNavDiscard}
        onCancel={handleNavCancel}
      />
    </ThemeProvider>
  )
}
