import React, { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box
} from '@mui/material'

interface Props {
  open: boolean
  onClose: () => void
  onCreate: (width: number, height: number) => void
}

const NewMapDialog: React.FC<Props> = ({ open, onClose, onCreate }) => {
  const [width, setWidth] = useState(32)
  const [height, setHeight] = useState(32)

  const valid = width >= 1 && width <= 512 && height >= 1 && height <= 512

  const handleCreate = () => {
    if (!valid) return
    onCreate(width, height)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>New Map</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
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
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleCreate} disabled={!valid}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default NewMapDialog
