import React, { useState } from 'react'
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Stack } from '@mui/material'

interface Props {
  open: boolean
  existingIds: string[]
  onClose: () => void
  onCreate: (id: string, name: string) => void
}

const CreatePaletteDialog: React.FC<Props> = ({ open, existingIds, onClose, onCreate }) => {
  const [id, setId] = useState('')
  const [name, setName] = useState('')

  const idNorm = id.toLowerCase().replace(/\s+/g, '_')
  const idTaken = existingIds.includes(idNorm)
  const idValid = /^[a-z][a-z0-9_]*$/.test(idNorm) && !idTaken
  const canCreate = idValid && name.trim().length > 0

  const reset = () => { setId(''); setName('') }
  const handleClose = () => { reset(); onClose() }
  const handleCreate = () => {
    if (!canCreate) return
    onCreate(idNorm, name.trim())
    reset()
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>New Palette</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            autoFocus
            label="ID"
            helperText={idTaken ? 'ID already exists' : 'lowercase, no spaces (e.g. "elements")'}
            error={id.length > 0 && !idValid}
            value={id}
            onChange={e => setId(e.target.value)}
            size="small"
          />
          <TextField
            label="Name"
            helperText='Display name (e.g. "Elements")'
            value={name}
            onChange={e => setName(e.target.value)}
            size="small"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button variant="contained" onClick={handleCreate} disabled={!canCreate}>Create</Button>
      </DialogActions>
    </Dialog>
  )
}

export default CreatePaletteDialog
