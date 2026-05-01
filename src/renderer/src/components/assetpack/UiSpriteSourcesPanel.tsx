import React, { useMemo } from 'react'
import { Box, Typography, Chip } from '@mui/material'
import type { PackKindPanelProps } from '../../packKinds'

const UiSpriteSourcesPanel: React.FC<PackKindPanelProps> = ({ draft, kind }) => {
  const groups = useMemo(() => {
    const counts = new Map<string, number>()
    for (const asset of draft.assets) {
      const slot = kind.parseSlot(asset.filename)
      if (!slot) continue
      counts.set(slot.namespace, (counts.get(slot.namespace) ?? 0) + 1)
    }
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [draft.assets, kind])

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
        Source-file groups
      </Typography>
      {groups.length === 0 ? (
        <Typography variant="caption" color="text.secondary">
          No source-file groups yet — use Add PNG → New source file… to create one.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {groups.map(([ns, count]) => (
            <Chip key={ns} label={`${ns} · ${count}`} size="small" variant="outlined" />
          ))}
        </Box>
      )}
    </Box>
  )
}

export default UiSpriteSourcesPanel
