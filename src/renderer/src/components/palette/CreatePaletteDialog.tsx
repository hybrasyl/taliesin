import React, { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography
} from '@mui/material'
import { PRESET_LIST, PresetId } from '../../utils/presets'

interface Props {
  open: boolean
  existingIds: string[]
  onClose: () => void
  onCreate: (id: string, name: string, preset: PresetId) => void
}

const CreatePaletteDialog: React.FC<Props> = ({ open, existingIds, onClose, onCreate }) => {
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [preset, setPreset] = useState<PresetId>('blank')

  const idNorm = id.toLowerCase().replace(/\s+/g, '_')
  const idTaken = existingIds.includes(idNorm)
  const idValid = /^[a-z][a-z0-9_]*$/.test(idNorm) && !idTaken
  const canCreate = idValid && name.trim().length > 0

  const reset = () => {
    setId('')
    setName('')
    setPreset('blank')
  }
  const handleClose = () => {
    reset()
    onClose()
  }
  const handleCreate = () => {
    if (!canCreate) return
    onCreate(idNorm, name.trim(), preset)
    reset()
  }

  const presetMeta = PRESET_LIST.find((p) => p.id === preset)

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>New Palette</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <FormControl size="small">
            <InputLabel>Start from</InputLabel>
            <Select
              label="Start from"
              value={preset}
              onChange={(e) => setPreset(e.target.value as PresetId)}
            >
              {PRESET_LIST.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {presetMeta && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
              {presetMeta.description}
            </Typography>
          )}
          <TextField
            autoFocus
            label="ID"
            helperText={idTaken ? 'ID already exists' : 'lowercase, no spaces (e.g. "elements")'}
            error={id.length > 0 && !idValid}
            value={id}
            onChange={(e) => setId(e.target.value)}
            size="small"
          />
          <TextField
            label="Name"
            helperText='Display name (e.g. "Elements")'
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="small"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button variant="contained" onClick={handleCreate} disabled={!canCreate}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default CreatePaletteDialog
