import React from 'react'
import { Box, Typography } from '@mui/material'

/**
 * Shared bottom-panel chrome for the pack-kind editor panels (item icons,
 * ui-sprite sources, npc portraits): a top-bordered column with a bold caption.
 */
export const PanelContainer: React.FC<{ title: string; children?: React.ReactNode }> = ({
  title,
  children
}) => (
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
      {title}
    </Typography>
    {children}
  </Box>
)
