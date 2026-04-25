import React, { useState } from 'react'
import { Box, Popover } from '@mui/material'
import { HexColorPicker } from 'react-colorful'

interface Props {
  value: string                // hex "#RRGGBB"
  fallback?: string            // shown when value is invalid
  onChange: (next: string) => void
  size?: number
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/

const ColorSwatchPicker: React.FC<Props> = ({ value, fallback = '#000000', onChange, size = 28 }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const display = HEX_RE.test(value) ? value : fallback

  return (
    <>
      <Box
        onClick={e => setAnchor(e.currentTarget)}
        sx={{
          width: size,
          height: size,
          bgcolor: display,
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: 0.5,
          cursor: 'pointer',
          flexShrink: 0,
          '&:hover': { borderColor: 'secondary.light' },
        }}
      />
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { p: 1 } } }}
      >
        <HexColorPicker color={display} onChange={c => onChange(c.toUpperCase())} />
      </Popover>
    </>
  )
}

export default ColorSwatchPicker
