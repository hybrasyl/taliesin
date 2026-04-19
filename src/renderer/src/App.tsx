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
  musicLibraryPathState,
  musicWorkingDirsState,
  activeMusicWorkingDirState,
  ffmpegPathState,
  packDirState,
  companionPathState,
  musEncodeKbpsState,
  musEncodeSampleRateState,
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

const scrollbarColors: Record<ThemeName, { thumb: string; thumbHover: string; track: string }> = {
  hybrasyl: { thumb: 'rgba(58,158,144,0.5)',  thumbHover: 'rgba(58,158,144,0.8)',  track: 'rgba(6,12,18,0.4)' },
  chadul:   { thumb: 'rgba(46,122,58,0.5)',   thumbHover: 'rgba(46,122,58,0.8)',   track: 'rgba(4,14,6,0.4)' },
  danaan:   { thumb: 'rgba(184,146,42,0.5)',  thumbHover: 'rgba(184,146,42,0.8)',  track: 'rgba(200,180,120,0.3)' },
  grinneal: { thumb: 'rgba(106,122,80,0.5)',  thumbHover: 'rgba(106,122,80,0.8)',  track: 'rgba(22,18,14,0.4)' },
}

export default function App(): React.ReactElement {
  const [theme, setTheme] = useRecoilState(themeState)
  const [, setClientPath] = useRecoilState(clientPathState)
  const [, setLibraries] = useRecoilState(librariesState)
  const [, setActiveLibrary] = useRecoilState(activeLibraryState)
  const [, setMapDirectories] = useRecoilState(mapDirectoriesState)
  const [, setActiveMapDirectory] = useRecoilState(activeMapDirectoryState)
  const [, setMusicLibraryPath] = useRecoilState(musicLibraryPathState)
  const [, setMusicWorkingDirs] = useRecoilState(musicWorkingDirsState)
  const [, setActiveMusicWorkingDir] = useRecoilState(activeMusicWorkingDirState)
  const [, setFfmpegPath]          = useRecoilState(ffmpegPathState)
  const [, setPackDir]             = useRecoilState(packDirState)
  const [, setCompanionPath]       = useRecoilState(companionPathState)
  const [, setMusEncodeKbps]       = useRecoilState(musEncodeKbpsState)
  const [, setMusEncodeSampleRate] = useRecoilState(musEncodeSampleRateState)
  const [, setCurrentPage] = useRecoilState(currentPageState)
  const [dirtyEditor, setDirtyEditor] = useRecoilState(dirtyEditorState)

  const [navDialogOpen, setNavDialogOpen] = React.useState(false)
  const [pendingPage, setPendingPage] = React.useState<string | null>(null)
  const dirtyEditorRef = useRef(dirtyEditor)
  const settingsLoaded = useRef(false)

  // Sync scrollbar CSS custom properties with active theme
  useEffect(() => {
    const colors = scrollbarColors[theme] ?? scrollbarColors.hybrasyl
    const root = document.documentElement
    root.style.setProperty('--scrollbar-thumb', colors.thumb)
    root.style.setProperty('--scrollbar-thumb-hover', colors.thumbHover)
    root.style.setProperty('--scrollbar-track', colors.track)
  }, [theme])

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
      if (typeof settings.musicLibraryPath === 'string') setMusicLibraryPath(settings.musicLibraryPath)
      if (Array.isArray(settings.musicWorkingDirs)) setMusicWorkingDirs(settings.musicWorkingDirs as string[])
      if (typeof settings.activeMusicWorkingDir === 'string') setActiveMusicWorkingDir(settings.activeMusicWorkingDir)
      if (typeof settings.ffmpegPath === 'string') setFfmpegPath(settings.ffmpegPath)
      if (typeof settings.packDir === 'string') setPackDir(settings.packDir)
      if (typeof settings.companionPath === 'string') setCompanionPath(settings.companionPath)
      if (typeof settings.musEncodeKbps === 'number') setMusEncodeKbps(settings.musEncodeKbps)
      if (typeof settings.musEncodeSampleRate === 'number') setMusEncodeSampleRate(settings.musEncodeSampleRate)
      settingsLoaded.current = true
    })
  }, [])

  // Persist settings when they change
  const clientPath        = useRecoilValue(clientPathState)
  const libraries         = useRecoilValue(librariesState)
  const activeLibrary     = useRecoilValue(activeLibraryState)
  const mapDirectories       = useRecoilValue(mapDirectoriesState)
  const activeMapDirectory   = useRecoilValue(activeMapDirectoryState)
  const musicLibraryPath     = useRecoilValue(musicLibraryPathState)
  const musicWorkingDirs     = useRecoilValue(musicWorkingDirsState)
  const activeMusicWorkingDir = useRecoilValue(activeMusicWorkingDirState)
  const ffmpegPath             = useRecoilValue(ffmpegPathState)
  const packDir                = useRecoilValue(packDirState)
  const companionPath          = useRecoilValue(companionPathState)
  const musEncodeKbps          = useRecoilValue(musEncodeKbpsState)
  const musEncodeSampleRate    = useRecoilValue(musEncodeSampleRateState)

  useEffect(() => {
    if (!settingsLoaded.current) return
    window.api.saveSettings({
      theme, clientPath, libraries, activeLibrary,
      mapDirectories, activeMapDirectory,
      musicLibraryPath, musicWorkingDirs, activeMusicWorkingDir,
      ffmpegPath, packDir, companionPath, musEncodeKbps, musEncodeSampleRate,
    })
  }, [theme, clientPath, libraries, activeLibrary, mapDirectories, activeMapDirectory,
      musicLibraryPath, musicWorkingDirs, activeMusicWorkingDir,
      ffmpegPath, packDir, companionPath, musEncodeKbps, musEncodeSampleRate])

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
