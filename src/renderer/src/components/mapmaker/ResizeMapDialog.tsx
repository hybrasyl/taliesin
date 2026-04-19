import React, { useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Box, Typography,
} from '@mui/material'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'

interface Props {
  open: boolean
  currentWidth: number
  currentHeight: number
  onClose: () => void
  onResize: (width: number, height: number) => void
}

const ResizeMapDialog: React.FC<Props> = ({ open, currentWidth, currentHeight, onClose, onResize }) => {
  const [width, setWidth] = useState(currentWidth)
  const [height, setHeight] = useState(currentHeight)

  // Reset when dialog opens
  React.useEffect(() => {
    if (open) { setWidth(currentWidth); setHeight(currentHeight) }
  }, [open, currentWidth, currentHeight])

  const valid = width >= 1 && width <= 512 && height >= 1 && height <= 512
  const shrinking = width < currentWidth || height < currentHeight
  const unchanged = width === currentWidth && height === currentHeight

  const handleResize = () => {
    if (!valid || unchanged) return
    onResize(width, height)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Resize Map</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Current: {currentWidth} × {currentHeight}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
          Tiles are anchored to the top-left corner. Growing adds empty tiles to the bottom and right edges. Shrinking removes tiles from the bottom and right.
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            label="Width"
            type="number"
            size="small"
            fullWidth
            value={width}
            onChange={(e) => setWidth(Math.max(1, Math.min(512, parseInt(e.target.value) || 1)))}
            inputProps={{ min: 1, max: 512 }}
          />
          <TextField
            label="Height"
            type="number"
            size="small"
            fullWidth
            value={height}
            onChange={(e) => setHeight(Math.max(1, Math.min(512, parseInt(e.target.value) || 1)))}
            inputProps={{ min: 1, max: 512 }}
          />
        </Box>
        {shrinking && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2, color: 'warning.main' }}>
            <WarningAmberIcon fontSize="small" />
            <Typography variant="caption">
              Shrinking will truncate tiles outside the new bounds. This can be undone.
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleResize} disabled={!valid || unchanged}>
          Resize
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default ResizeMapDialog
