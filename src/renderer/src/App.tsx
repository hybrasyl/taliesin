import React, { useEffect, useCallback, useRef } from 'react'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { useSettingsStore, type ThemeName } from './store/settingsStore'
import { useUiStore } from './store/uiStore'
import { clearAllCaches } from './utils/mapRenderer'
import { clearFieldCache } from './utils/worldMapRenderer'
import { hybrasylTheme, chadulTheme, danaanTheme, grinnealTheme } from './themes'
import type { Theme } from '@mui/material/styles'
import MainLayout from './components/MainLayout'
import PageRenderer from './components/PageRenderer'
import UnsavedChangesDialog from './components/UnsavedChangesDialog'

const themes: Record<ThemeName, Theme> = {
  hybrasyl: hybrasylTheme,
  chadul: chadulTheme,
  danaan: danaanTheme,
  grinneal: grinnealTheme
}

const scrollbarColors: Record<ThemeName, { thumb: string; thumbHover: string; track: string }> = {
  hybrasyl: {
    thumb: 'rgba(58,158,144,0.5)',
    thumbHover: 'rgba(58,158,144,0.8)',
    track: 'rgba(6,12,18,0.4)'
  },
  chadul: {
    thumb: 'rgba(46,122,58,0.5)',
    thumbHover: 'rgba(46,122,58,0.8)',
    track: 'rgba(4,14,6,0.4)'
  },
  danaan: {
    thumb: 'rgba(184,146,42,0.5)',
    thumbHover: 'rgba(184,146,42,0.8)',
    track: 'rgba(200,180,120,0.3)'
  },
  grinneal: {
    thumb: 'rgba(106,122,80,0.5)',
    thumbHover: 'rgba(106,122,80,0.8)',
    track: 'rgba(22,18,14,0.4)'
  }
}

export default function App(): React.ReactElement {
  const theme = useSettingsStore((s) => s.theme)
  const clientPath = useSettingsStore((s) => s.clientPath)
  const brigidAssetsPath = useSettingsStore((s) => s.brigidAssetsPath)
  const dirtyEditor = useUiStore((s) => s.dirtyEditor)
  const setDirtyEditor = useUiStore((s) => s.setDirtyEditor)
  const setCurrentPage = useUiStore((s) => s.setCurrentPage)

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

  // Hydrate the settings store from disk on mount, then reveal the window.
  // The store owns persistence (a debounced subscribe pushes changes back), so
  // App no longer wires save-on-change effects.
  useEffect(() => {
    useSettingsStore
      .getState()
      .hydrate()
      .finally(() => {
        settingsLoaded.current = true
        // Settings are now in the store — tell main to reveal the window and
        // dismiss the startup splash (first visible frame is already populated).
        window.api.appReady()
      })
  }, [])

  // When the pack sources change, drop cached tile/field bitmaps so the map +
  // worldmap editors re-resolve against the newly installed packs on next render.
  useEffect(() => {
    if (!settingsLoaded.current) return
    clearAllCaches()
    clearFieldCache()
  }, [clientPath, brigidAssetsPath])

  useEffect(() => {
    dirtyEditorRef.current = dirtyEditor
  }, [dirtyEditor])

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
    } catch {
      return
    }
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
