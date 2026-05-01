import React from 'react'
import { Box, Typography, Tooltip } from '@mui/material'
import type { PackKindPanelProps } from '../../packKinds'
import { CANONICAL_DYE_HEX } from '../../packKinds/itemIconsDye'

const ItemIconsPanel: React.FC<PackKindPanelProps> = ({ draft, kind }) => {
  const noDyeIds: number[] = []
  for (const asset of draft.assets) {
    const meta = draft.assetMeta?.[asset.filename]
    if (meta?.noDye === true) {
      const slot = kind.parseSlot(asset.filename)
      if (slot) noDyeIds.push(slot.id)
    }
  }
  noDyeIds.sort((a, b) => a - b)

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
        Dye palette (paint dyeable surfaces with these only)
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        {CANONICAL_DYE_HEX.map((hex) => (
          <Tooltip key={hex} title={hex}>
            <Box
              sx={{
                width: 28,
                height: 28,
                backgroundColor: hex,
                border: '1px solid',
                borderColor: 'divider'
              }}
            />
          </Tooltip>
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary">
        {noDyeIds.length === 0
          ? 'No items flagged no_dye.'
          : `no_dye: ${noDyeIds.join(', ')}`}
      </Typography>
    </Box>
  )
}

export default ItemIconsPanel
