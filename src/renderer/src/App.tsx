import React, { useEffect, useCallback, useRef } from 'react'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { useSettingsStore, type ThemeName } from './store/settingsStore'
import { useUiStore } from './store/uiStore'
import { clearAllCaches } from './utils/mapRenderer'
import { clearFieldCache } from './utils/worldMapRenderer'
import {
  hybrasylTheme,
  chadulTheme,
  danaanTheme,
  grinnealTheme,
  mundanesTheme,
  dubhaimidTheme
} from './themes'
import type { Theme } from '@mui/material/styles'
import MainLayout from './components/MainLayout'
import PageRenderer from './components/PageRenderer'
import UnsavedChangesDialog from './components/UnsavedChangesDialog'
import ReportIssueDialog from './components/ReportIssueDialog'
import UpdateSnackbar from './components/UpdateSnackbar'

const themes: Record<ThemeName, Theme> = {
  hybrasyl: hybrasylTheme,
  chadul: chadulTheme,
  danaan: danaanTheme,
  grinneal: grinnealTheme,
  mundanes: mundanesTheme,
  dubhaimid: dubhaimidTheme
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
  },
  mundanes: {
    thumb: 'rgba(25,118,210,0.5)',
    thumbHover: 'rgba(25,118,210,0.8)',
    track: 'rgba(201,205,212,0.4)'
  },
  dubhaimid: {
    thumb: 'rgba(92,139,196,0.5)',
    thumbHover: 'rgba(92,139,196,0.8)',
    track: 'rgba(30,30,30,0.4)'
  }
}

export default function App(): React.ReactElement {
  const theme = useSettingsStore((s) => s.theme)
  const clientPath = useSettingsStore((s) => s.clientPath)
  const brigidAssetsPath = useSettingsStore((s) => s.brigidAssetsPath)
  const dirtyEditor = useUiStore((s) => s.dirtyEditor)
  const pendingPage = useUiStore((s) => s.pendingPage)
  const commitPendingPage = useUiStore((s) => s.commitPendingPage)
  const cancelPendingPage = useUiStore((s) => s.cancelPendingPage)
  const reportIssueOpen = useUiStore((s) => s.reportIssueOpen)
  const setReportIssueOpen = useUiStore((s) => s.setReportIssueOpen)

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

  // Navigation blocked by a dirty editor: the store parks the destination in
  // pendingPage, and these three answer for it.
  const handleNavDiscard = useCallback(() => commitPendingPage(), [commitPendingPage])

  const handleNavSave = useCallback(async () => {
    try {
      await dirtyEditor?.onSave()
    } catch {
      // Leave the dialog up on a failed save — navigating anyway is the one
      // outcome the user did not ask for.
      return
    }
    commitPendingPage()
  }, [dirtyEditor, commitPendingPage])

  const handleNavCancel = useCallback(() => cancelPendingPage(), [cancelPendingPage])

  return (
    <ThemeProvider theme={themes[theme] ?? hybrasylTheme}>
      <CssBaseline />
      <MainLayout>
        <PageRenderer />
      </MainLayout>
      <UnsavedChangesDialog
        open={pendingPage !== null}
        label={dirtyEditor?.label}
        onSave={handleNavSave}
        onDiscard={handleNavDiscard}
        onCancel={handleNavCancel}
      />
      <ReportIssueDialog open={reportIssueOpen} onClose={() => setReportIssueOpen(false)} />
      {/* Renders nothing unless a newer release exists, so it costs a mounted
          component and one request per launch (HTOO-65). */}
      <UpdateSnackbar />
    </ThemeProvider>
  )
}
