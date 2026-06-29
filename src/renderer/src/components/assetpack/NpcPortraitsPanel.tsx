import React from 'react'
import { Box, Typography, TextField } from '@mui/material'
import type { PackKindPanelProps } from '../../packKinds'
import { portraitSizeOf, type NpcPortraitsCovers } from '../../packKinds/npcPortraits'

const NpcPortraitsPanel: React.FC<PackKindPanelProps> = ({ draft, onChange, kind }) => {
  const size = portraitSizeOf(draft.covers)

  const portraitCount = draft.assets.reduce((n, asset) => (kind.parseSlot(asset.filename) ? n + 1 : n), 0)

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
    <Box
      sx={{
        px: 2,
        py: 1.5,
        borderTop: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        gap: 1
      }}
    >
      <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
        Portrait size (square)
      </Typography>
      <TextField
        type="number"
        size="small"
        value={size}
        onChange={(e) => setSize(Number(e.target.value))}
        label="Size (px)"
        helperText="Every portrait must be exactly this square size, or the client ignores it."
        inputProps={{ min: 1, step: 1, 'aria-label': 'Portrait square size in pixels' }}
        sx={{ maxWidth: 220 }}
      />
      <Typography variant="caption" color="text.secondary">
        {portraitCount === 0
          ? 'No portraits yet — use Add PNG → New portrait… to add one keyed by its Portrait value.'
          : `${portraitCount} portrait${portraitCount === 1 ? '' : 's'} · ${size}×${size}`}
      </Typography>
    </Box>
  )
}

export default NpcPortraitsPanel
