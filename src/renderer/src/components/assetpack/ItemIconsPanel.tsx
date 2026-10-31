import React from 'react'
import { Box, Typography, Tooltip } from '@mui/material'
import type { PackKindPanelProps } from '../../packKinds'
import { CANONICAL_DYE_HEX, dyeableList } from '../../packKinds/itemIconsDye'
import { PanelContainer } from './PanelContainer'

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
  const dyeable = dyeableList(draft.covers)

  return (
    <PanelContainer title="Dye palette (paint dyeable surfaces with these only)">
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
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary'
        }}
      >
        {noDyeIds.length === 0 ? 'No items flagged no_dye.' : `no_dye: ${noDyeIds.join(', ')}`}
      </Typography>
      {dyeable && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }} data-testid="dyeable-list">
          This pack has an explicit dyeable list ({dyeable.length}{' '}
          {dyeable.length === 1 ? 'id' : 'ids'}). Brigid dyes exactly those ids and ignores No dye.
          Taliesin keeps the list when it saves and compiles the pack.
        </Typography>
      )}
    </PanelContainer>
  )
}

export default ItemIconsPanel
