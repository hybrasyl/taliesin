import React from 'react'
import { Typography, TextField } from '@mui/material'
import type { PackKindPanelProps } from '../../packKinds'
import { portraitSizeOf, type NpcPortraitsCovers } from '../../packKinds/npcPortraits'
import { PanelContainer } from './PanelContainer'

const NpcPortraitsPanel: React.FC<PackKindPanelProps> = ({ draft, onChange, kind }) => {
  const size = portraitSizeOf(draft.covers)

  const portraitCount = draft.assets.reduce(
    (n, asset) => (kind.parseSlot(asset.filename) ? n + 1 : n),
    0
  )

  const setSize = (next: number): void => {
    if (!Number.isFinite(next) || next <= 0) return
    const rounded = Math.round(next)
    const existing = (draft.covers.npc_portraits ?? {}) as NpcPortraitsCovers
    onChange({
      covers: {
        ...draft.covers,
        npc_portraits: { ...existing, dimensions: [rounded, rounded] }
      }
    })
  }

  return (
    <PanelContainer title="Portrait size (square)">
      <TextField
        type="number"
        size="small"
        value={size}
        onChange={(e) => setSize(Number(e.target.value))}
        label="Size (px)"
        helperText="Every portrait must be exactly this square size, or the client ignores it."
        slotProps={{
          htmlInput: { min: 1, step: 1, 'aria-label': 'Portrait square size in pixels' }
        }}
        sx={{ maxWidth: 220 }}
      />
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary'
        }}
      >
        {portraitCount === 0
          ? 'No portraits yet — use Add PNG → New portrait… to add one keyed by its Portrait value.'
          : `${portraitCount} portrait${portraitCount === 1 ? '' : 's'} · ${size}×${size}`}
      </Typography>
    </PanelContainer>
  )
}

export default NpcPortraitsPanel
