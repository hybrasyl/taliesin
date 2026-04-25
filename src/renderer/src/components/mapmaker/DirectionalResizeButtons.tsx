import React from 'react'
import { Box, IconButton, Tooltip } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'

interface Props {
  mapWidth: number
  mapHeight: number
  onResize: (side: 'top' | 'bottom' | 'left' | 'right', delta: number) => void
}

const btnSx = {
  bgcolor: 'rgba(0,0,0,0.6)',
  color: 'text.primary',
  border: '1px solid',
  borderColor: 'divider',
  width: 24,
  height: 24,
  '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' }
} as const

const DirectionalResizeButtons: React.FC<Props> = ({ mapWidth, mapHeight, onResize }) => {
  return (
    <>
      {/* Top edge */}
      <Box
        sx={{
          position: 'absolute',
          top: 4,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          display: 'flex',
          gap: 0.5
        }}
      >
        <Tooltip title="Add row at top">
          <IconButton size="small" sx={btnSx} onClick={() => onResize('top', 1)}>
            <AddIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
        {mapHeight > 1 && (
          <Tooltip title="Remove row from top">
            <IconButton size="small" sx={btnSx} onClick={() => onResize('top', -1)}>
              <RemoveIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Bottom edge — offset above horizontal scrollbar */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          display: 'flex',
          gap: 0.5
        }}
      >
        <Tooltip title="Add row at bottom">
          <IconButton size="small" sx={btnSx} onClick={() => onResize('bottom', 1)}>
            <AddIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
        {mapHeight > 1 && (
          <Tooltip title="Remove row from bottom">
            <IconButton size="small" sx={btnSx} onClick={() => onResize('bottom', -1)}>
              <RemoveIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Left edge — offset past vertical scrollbar */}
      <Box
        sx={{
          position: 'absolute',
          left: 20,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5
        }}
      >
        <Tooltip title="Add column at left" placement="right">
          <IconButton size="small" sx={btnSx} onClick={() => onResize('left', 1)}>
            <AddIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
        {mapWidth > 1 && (
          <Tooltip title="Remove column from left" placement="right">
            <IconButton size="small" sx={btnSx} onClick={() => onResize('left', -1)}>
              <RemoveIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Right edge — offset past vertical scrollbar */}
      <Box
        sx={{
          position: 'absolute',
          right: 20,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5
        }}
      >
        <Tooltip title="Add column at right" placement="left">
          <IconButton size="small" sx={btnSx} onClick={() => onResize('right', 1)}>
            <AddIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
        {mapWidth > 1 && (
          <Tooltip title="Remove column from right" placement="left">
            <IconButton size="small" sx={btnSx} onClick={() => onResize('right', -1)}>
              <RemoveIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </>
  )
}

export default DirectionalResizeButtons
