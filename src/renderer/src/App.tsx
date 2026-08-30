import React, { useEffect, useCallback, useRef, useState } from 'react'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { useSettingsStore, type ThemeName } from './store/settingsStore'
import { useUiStore, type CloseGuard } from './store/uiStore'
import { hasDirtyTabs, saveDirtyTabs } from './utils/mapMakerSave'
import { useMapMakerStore } from './store/mapMakerStore'
import { reportUnsaved } from './utils/unsavedReport'
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

  // ── App-close guard ────────────────────────────────────────────────────────
  //
  // Main cancels the first close and asks (`onCloseRequested`); the answer is
  // `confirmClose`. Every editor that can hold unsaved work registers a
  // CloseGuard in the store — the useUnsavedGuard hook does it for the XML
  // map editor and the others, and the Map Maker's tabs are registered here
  // because they live in a store rather than a page.

  useEffect(() => {
    const { registerCloseGuard, unregisterCloseGuard } = useUiStore.getState()
    registerCloseGuard('mapmaker', {
      label: 'Map Maker',
      isDirty: hasDirtyTabs,
      onSave: saveDirtyTabs
    })
    // Map Maker dirtiness lives in its store, not in a hook: report on every
    // store change (cheap — the report only sends on a transition).
    const unsubscribe = useMapMakerStore.subscribe(reportUnsaved)
    return () => {
      unsubscribe()
      unregisterCloseGuard('mapmaker')
    }
  }, [])

  /** The guards that were dirty when main asked; null while not asking. */
  const [closePrompt, setClosePrompt] = useState<CloseGuard[] | null>(null)

  useEffect(() => {
    // Optional-chained: the test mock returns no unsubscribe.
    const off = window.api.onCloseRequested?.(() => {
      const dirty = Object.values(useUiStore.getState().closeGuards).filter((g) => g.isDirty())
      // Main only asks when the last report said dirty; if that has since
      // cleared, answer at once.
      if (dirty.length === 0) {
        window.api.confirmClose()
        return
      }
      setClosePrompt(dirty)
    })
    return () => off?.()
  }, [])

  const handleCloseSave = useCallback(async () => {
    if (!closePrompt) return
    for (const guard of closePrompt) {
      try {
        await guard.onSave()
      } catch {
        // A failed save leaves the dialog up: closing anyway is the one
        // outcome the user did not ask for.
        return
      }
    }
    setClosePrompt(null)
    // A save can be declined without failing — a cancelled Save As dialog —
    // and that editor is still dirty. Then the window stays; the user asked
    // to save, not to lose the work.
    if (closePrompt.some((g) => g.isDirty())) return
    window.api.confirmClose()
  }, [closePrompt])

  const handleCloseDiscard = useCallback(() => {
    setClosePrompt(null)
    window.api.confirmClose()
  }, [])

  const handleCloseCancel = useCallback(() => setClosePrompt(null), [])

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
      <UnsavedChangesDialog
        open={closePrompt !== null}
        label={closePrompt?.map((g) => g.label).join(', ')}
        onSave={handleCloseSave}
        onDiscard={handleCloseDiscard}
        onCancel={handleCloseCancel}
      />
      <ReportIssueDialog open={reportIssueOpen} onClose={() => setReportIssueOpen(false)} />
      {/* Renders nothing unless a newer release exists, so it costs a mounted
          component and one request per launch (HTOO-65). */}
      <UpdateSnackbar />
    </ThemeProvider>
  )
}
