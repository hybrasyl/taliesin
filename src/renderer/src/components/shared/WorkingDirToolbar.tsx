import React from 'react'
import { Box, Typography, IconButton, Tooltip } from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'

/**
 * Top toolbar showing the current working directory with a change-dir button.
 * `children` fill the right side (status message, counts, refresh, …).
 */
export const WorkingDirToolbar: React.FC<{
  dir: string
  onChangeDir: () => void
  children?: React.ReactNode
}> = ({ dir, onChangeDir, children }) => (
  <Box
    sx={{
      px: 2,
      py: 1,
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      borderBottom: '1px solid',
      borderColor: 'divider'
    }}
  >
    <Tooltip title="Change working directory">
      <IconButton size="small" onClick={onChangeDir}>
        <FolderOpenIcon fontSize="small" />
      </IconButton>
    </Tooltip>
    <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1 }}>
      {dir}
    </Typography>
    {children}
  </Box>
)
