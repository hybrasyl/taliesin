import React from 'react'
import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import NearMeIcon from '@mui/icons-material/NearMe'
import { UI_CONTROL_KINDS, type UiControlKind } from '../../uiforge/types'
import { KIND_COLORS } from './LayoutCanvas'

interface ControlPaletteProps {
  /** Currently armed placement kind, or null for the select tool. */
  armedKind: UiControlKind | null
  onArm: (kind: UiControlKind | null) => void
}

const KIND_LABEL: Record<UiControlKind, string> = {
  label: 'Label',
  button: 'Button',
  image: 'Image',
  textbox: 'Textbox',
  progressbar: 'Progress'
}

/** Horizontal tool strip: the select tool plus click-to-arm placement buttons. */
const ControlPalette: React.FC<ControlPaletteProps> = ({ armedKind, onArm }) => {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 0.75,
        borderBottom: '1px solid',
        borderColor: 'divider'
      }}
    >
      <Typography variant="overline" sx={{ color: 'text.disabled', lineHeight: 1 }}>
        Tools
      </Typography>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={armedKind ?? 'select'}
        onChange={(_, v) => onArm(v === 'select' || v == null ? null : (v as UiControlKind))}
        sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 1.25, py: 0.4 } }}
      >
        <ToggleButton value="select" aria-label="select tool">
          <NearMeIcon fontSize="small" sx={{ mr: 0.75 }} />
          Select
        </ToggleButton>
        {UI_CONTROL_KINDS.map((kind) => (
          <ToggleButton key={kind} value={kind} aria-label={`place ${kind}`}>
            <Box
              component="span"
              sx={{
                width: 10,
                height: 10,
                mr: 0.75,
                borderRadius: '2px',
                bgcolor: KIND_COLORS[kind],
                flexShrink: 0
              }}
            />
            {KIND_LABEL[kind]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Typography variant="caption" sx={{ color: 'text.disabled', ml: 'auto' }}>
        {armedKind
          ? `Click the canvas to place ${KIND_LABEL[armedKind].toLowerCase()} · Esc cancels`
          : 'Select & edit'}
      </Typography>
    </Box>
  )
}

export default ControlPalette
