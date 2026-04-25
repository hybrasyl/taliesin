import React, { useState } from 'react'
import { Box, Typography, IconButton, Tooltip, Popover } from '@mui/material'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'

const shortcuts = [
  { key: 'D', action: 'Draw tool' },
  { key: 'E', action: 'Erase tool' },
  { key: 'S', action: 'Sample tool' },
  { key: 'Shift+G', action: 'Fill tool' },
  { key: 'L', action: 'Line tool' },
  { key: 'U', action: 'Shape tool' },
  { key: 'Shift+U', action: 'Cycle shape mode' },
  { key: 'V', action: 'Select tool' },
  { key: 'R', action: 'Random fill' },
  { key: 'P', action: 'Stamp prefab' },
  { key: '', action: '' },
  { key: 'T', action: 'Toggle ground/wall' },
  { key: 'F', action: 'Toggle L-FG / R-FG' },
  { key: 'G', action: 'Toggle grid' },
  { key: 'Alt+click', action: 'Quick eyedropper' },
  { key: '', action: '' },
  { key: 'Ctrl+C', action: 'Copy selection' },
  { key: 'Ctrl+X', action: 'Cut selection' },
  { key: 'Ctrl+V', action: 'Paste' },
  { key: 'Delete', action: 'Clear selection' },
  { key: 'Escape', action: 'Cancel / deselect' },
  { key: '', action: '' },
  { key: 'Ctrl+Z', action: 'Undo' },
  { key: 'Ctrl+Y', action: 'Redo' },
  { key: 'Ctrl+S', action: 'Save' },
  { key: 'Ctrl+Shift+S', action: 'Save As' },
  { key: '', action: '' },
  { key: 'Shift+wheel', action: 'Zoom' },
  { key: 'Ctrl+wheel', action: 'Horizontal scroll' },
  { key: 'Right-click', action: 'Context menu' }
]

const ShortcutHelpPanel: React.FC = () => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)

  return (
    <>
      <Tooltip title="Keyboard Shortcuts">
        <IconButton
          size="small"
          onClick={(e) => setAnchorEl(anchorEl ? null : e.currentTarget)}
          sx={{ color: anchorEl ? 'info.light' : 'text.primary' }}
        >
          <HelpOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 1.5, minWidth: 220 }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
            Keyboard Shortcuts
          </Typography>
          {shortcuts.map((s, i) =>
            s.key === '' ? (
              <Box key={i} sx={{ height: 6 }} />
            ) : (
              <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.15 }}>
                <Typography
                  variant="caption"
                  sx={{ fontFamily: 'monospace', color: 'info.light', minWidth: 100 }}
                >
                  {s.key}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {s.action}
                </Typography>
              </Box>
            )
          )}
        </Box>
      </Popover>
    </>
  )
}

export default ShortcutHelpPanel
