import React, { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  FormControlLabel,
  Checkbox
} from '@mui/material'

interface Props {
  open: boolean
  selectionWidth: number
  selectionHeight: number
  onClose: () => void
  onCreate: (name: string, includeGround: boolean) => void
}

const CreatePrefabDialog: React.FC<Props> = ({
  open,
  selectionWidth,
  selectionHeight,
  onClose,
  onCreate
}) => {
  const [name, setName] = useState('')
  const [includeGround, setIncludeGround] = useState(true)

  React.useEffect(() => {
    if (open) setName('')
  }, [open])

  const handleCreate = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed, includeGround)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Create Prefab from Selection</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Selection: {selectionWidth} × {selectionHeight} tiles
        </Typography>
        <TextField
          label="Prefab Name"
          size="small"
          fullWidth
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate()
          }}
          sx={{ mb: 1 }}
        />
        <FormControlLabel
          control={<Checkbox checked={includeGround} onChange={(_, v) => setIncludeGround(v)} />}
          label="Include ground tiles"
        />
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
          Empty cells (tile ID 0) won't overwrite existing tiles when stamping. Tiles will be
          trimmed to the occupied bounding box.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleCreate} disabled={!name.trim()}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default CreatePrefabDialog
