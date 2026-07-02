import React from 'react'
import { Typography } from '@mui/material'

/**
 * Success-styled transient status line shown in page toolbars. Renders nothing
 * when `message` is null. Extra `sx` is merged (MapMakerPage adds `mr: 1`).
 */
export const StatusMessage: React.FC<{ message: string | null; sx?: object }> = ({
  message,
  sx
}) =>
  message ? (
    <Typography variant="caption" sx={{ color: 'success.light', fontWeight: 'bold', ...sx }}>
      {message}
    </Typography>
  ) : null
