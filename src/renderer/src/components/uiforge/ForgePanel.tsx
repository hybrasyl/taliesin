import React, { useEffect, useState } from 'react'
import { Box, Typography, Chip, Stack } from '@mui/material'
import type { PackProject } from '../../packKinds'
import type { UiPanelLayout } from '../../uiforge/types'
import { parsePanelXml } from '../../uiforge/panelXml'

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

/**
 * Editor shell for one panel layout. M2 scaffold: loads and summarizes the
 * layout XML; the canvas editor lands here next.
 */
const ForgePanel: React.FC<ForgePanelProps> = ({ projectAssetsDir, panelId, onStatus }) => {
  const [layout, setLayout] = useState<UiPanelLayout | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const buf = await window.api.readFile(`${projectAssetsDir}/${panelId}.xml`)
        const xml = new TextDecoder().decode(buf)
        const parsed = parsePanelXml(xml)
        if (!cancelled) {
          setLayout(parsed)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'unknown error'
          setError(msg)
          onStatus(`Failed to load ${panelId}.xml: ${msg}`)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectAssetsDir, panelId, onStatus])

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
  if (!layout) return null

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h6">{layout.id}</Typography>
      <Typography variant="body2" sx={{ color: 'text.disabled', mb: 2 }}>
        anchor {layout.anchor.w}×{layout.anchor.h} · layout-version {layout.layoutVersion}
      </Typography>
      <Stack direction="row" spacing={1}>
        {layout.variants.map((v) => (
          <Chip
            key={v.name}
            size="small"
            label={`${v.name} (${v.controls.length} control${v.controls.length !== 1 ? 's' : ''})`}
          />
        ))}
      </Stack>
      <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 3 }}>
        Canvas editor coming online in the next milestone.
      </Typography>
    </Box>
  )
}

export default ForgePanel
