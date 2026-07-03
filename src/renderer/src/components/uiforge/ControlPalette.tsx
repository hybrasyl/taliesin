import React from 'react'
import { Box, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material'
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

/** Left rail: the select tool plus click-to-arm control-placement buttons. */
const ControlPalette: React.FC<ControlPaletteProps> = ({ armedKind, onArm }) => {
  return (
    <Box
      sx={{
        width: 96,
        flexShrink: 0,
        borderRight: '1px solid',
        borderColor: 'divider',
        p: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 1
      }}
    >
      <Typography variant="overline" sx={{ color: 'text.disabled', lineHeight: 1.4 }}>
        Tools
      </Typography>
      <ToggleButtonGroup
        orientation="vertical"
        exclusive
        size="small"
        value={armedKind ?? 'select'}
        onChange={(_, v) => onArm(v === 'select' || v == null ? null : (v as UiControlKind))}
        sx={{
          '& .MuiToggleButton-root': {
            justifyContent: 'flex-start',
            textTransform: 'none',
            py: 0.5
          }
        }}
      >
        <ToggleButton value="select" aria-label="select tool">
          <NearMeIcon fontSize="small" sx={{ mr: 1 }} />
          Select
        </ToggleButton>
        {UI_CONTROL_KINDS.map((kind) => (
          <ToggleButton key={kind} value={kind} aria-label={`place ${kind}`}>
            <Box
              component="span"
              sx={{
                width: 10,
                height: 10,
                mr: 1,
                borderRadius: '2px',
                bgcolor: KIND_COLORS[kind],
                flexShrink: 0
              }}
            />
            {KIND_LABEL[kind]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Tooltip title="Pick a control, then click on the canvas to place it. Esc cancels.">
        <Typography variant="caption" sx={{ color: 'text.disabled', mt: 'auto' }}>
          {armedKind ? `Click to place ${KIND_LABEL[armedKind].toLowerCase()}` : 'Select & edit'}
        </Typography>
      </Tooltip>
    </Box>
  )
}

export default ControlPalette
