import React from 'react'
import { Box, Typography, Button } from '@mui/material'
import SettingsIcon from '@mui/icons-material/Settings'

/**
 * Centered "configure a working directory in Settings" empty state, shared by
 * the pages that require a working dir (palettes, asset packs, map catalog).
 */
export const EmptyStateSettings: React.FC<{
  title: string
  description: string
  onOpenSettings: () => void
}> = ({ title, description, onOpenSettings }) => (
  <Box sx={{ p: 4, textAlign: 'center' }}>
    <Typography variant="h5" gutterBottom sx={{ color: 'text.button', fontWeight: 'bold' }}>
      {title}
    </Typography>
    <Typography color="text.secondary" sx={{ mb: 3 }}>
      {description}
    </Typography>
    <Button variant="outlined" startIcon={<SettingsIcon />} onClick={onOpenSettings}>
      Open Settings
    </Button>
  </Box>
)
