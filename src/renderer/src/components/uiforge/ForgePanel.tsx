import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton
} from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import type { PackProject } from '../../packKinds'
import type { UiPanelLayout } from '../../uiforge/types'
import { parsePanelXml, serializePanelXml } from '../../uiforge/panelXml'
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard'
import UnsavedChangesDialog from '../UnsavedChangesDialog'
import LayoutCanvas, { type ForgeZoom } from './LayoutCanvas'
import VariantTabs from './VariantTabs'

export interface ForgePanelProps {
  project: PackProject
  /** Absolute path of the pack's asset directory (packDir/pack_id). */
  projectAssetsDir: string
  /** Absolute path of the project .json file. */
  projectFilePath: string
  panelId: string
  /** Persist project-level mutations (assets list / covers). */
  onProjectChange: (updated: PackProject) => Promise<void>
  onStatus: (msg: string) => void
}

/** Editor shell for one panel layout: variant tabs, zoom, canvas, save. */
const ForgePanel: React.FC<ForgePanelProps> = ({
  project,
  projectAssetsDir,
  panelId,
  onProjectChange,
  onStatus
}) => {
  const [layout, setLayout] = useState<UiPanelLayout | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeVariant, setActiveVariant] = useState<string>('')
  const [zoom, setZoom] = useState<ForgeZoom>(2)
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null)
  const [selectedControl, setSelectedControl] = useState<string | null>(null)

  const layoutPath = `${projectAssetsDir}/${panelId}.xml`

  const { markDirty, markClean, saveRef, dialogOpen, handleDialogSave, handleDialogDiscard, handleDialogCancel } =
    useUnsavedGuard(`UI panel ${panelId}`)

  // Load the layout XML.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const buf = await window.api.readFile(layoutPath)
        const parsed = parsePanelXml(new TextDecoder().decode(buf))
        if (cancelled) return
        setLayout(parsed)
        setActiveVariant(parsed.variants[0]?.name ?? '')
        setSelectedControl(null)
        setError(null)
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : 'unknown error'
        setError(msg)
        onStatus(`Failed to load ${panelId}.xml: ${msg}`)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [layoutPath, panelId, onStatus])

  const variant = useMemo(
    () => layout?.variants.find((v) => v.name === activeVariant) ?? layout?.variants[0] ?? null,
    [layout, activeVariant]
  )

  // Resolve the variant background PNG to a blob URL (readFile avoids file:// taint).
  useEffect(() => {
    let url: string | null = null
    let cancelled = false
    setBackgroundUrl(null)
    const bg = variant?.background
    if (!bg) return
    ;(async () => {
      try {
        const buf = await window.api.readFile(`${projectAssetsDir}/${bg}`)
        if (cancelled) return
        url = URL.createObjectURL(new Blob([new Uint8Array(buf)], { type: 'image/png' }))
        setBackgroundUrl(url)
      } catch {
        // Background referenced but not on disk yet — canvas shows neutral fill.
      }
    })()
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [variant?.background, projectAssetsDir])

  const handleSave = useCallback(async () => {
    if (!layout) return
    await window.api.writeFile(layoutPath, serializePanelXml(layout))
    // Keep the project's covers (panel_ids) honest via the page-level saver.
    await onProjectChange(project)
    markClean()
    onStatus(`Saved ${panelId}.xml`)
  }, [layout, layoutPath, project, onProjectChange, markClean, onStatus, panelId])

  // Register save with the unsaved-changes guard.
  useEffect(() => {
    saveRef.current = handleSave
  }, [handleSave, saveRef])

  // Panel switches remount this component (key prop) — drop any stale global
  // dirty registration on the way out.
  useEffect(() => () => markClean(), [markClean])

  /** All layout mutations funnel through here (marks dirty). */
  const changeLayout = useCallback(
    (mutate: (prev: UiPanelLayout) => UiPanelLayout) => {
      setLayout((prev) => (prev ? mutate(prev) : prev))
      markDirty()
    },
    [markDirty]
  )

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error">Failed to load {panelId}.xml</Typography>
        <Typography variant="body2" sx={{ color: 'text.disabled', mt: 1 }}>
          {error}
        </Typography>
      </Box>
    )
  }
  if (!layout || !variant) return null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderBottom: '1px solid',
          borderColor: 'divider'
        }}
      >
        <Typography variant="h6" sx={{ flex: 1 }}>
          {layout.id}
          <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.disabled' }}>
            {layout.anchor.w}×{layout.anchor.h} · layout-version {layout.layoutVersion}
          </Typography>
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={zoom}
          onChange={(_, v) => v && setZoom(v)}
          aria-label="zoom"
        >
          <ToggleButton value={1}>1×</ToggleButton>
          <ToggleButton value={2}>2×</ToggleButton>
          <ToggleButton value={4}>4×</ToggleButton>
        </ToggleButtonGroup>
        <Tooltip title="Save layout">
          <span>
            <IconButton size="small" onClick={handleSave} aria-label="save layout">
              <SaveIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <VariantTabs
        layout={layout}
        activeVariant={variant.name}
        onSelect={(name) => {
          setActiveVariant(name)
          setSelectedControl(null)
        }}
        onChange={changeLayout}
      />

      <LayoutCanvas
        layout={layout}
        variant={variant}
        zoom={zoom}
        backgroundUrl={backgroundUrl}
        selectedControl={selectedControl}
      />

      <UnsavedChangesDialog
        open={dialogOpen}
        onSave={handleDialogSave}
        onDiscard={handleDialogDiscard}
        onCancel={handleDialogCancel}
      />
    </Box>
  )
}

export default ForgePanel
