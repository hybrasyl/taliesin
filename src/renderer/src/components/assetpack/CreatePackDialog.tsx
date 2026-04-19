import React, { useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Box, Select, MenuItem, InputLabel, FormControl,
} from '@mui/material'

interface Props {
  open: boolean
  onClose: () => void
  onCreate: (packId: string, contentType: string, version: string) => void
}

const CONTENT_TYPES = [
  { value: 'ability_icons', label: 'Ability Icons (skill/spell)' },
  { value: 'nation_badges', label: 'Nation Badges' },
]

const CreatePackDialog: React.FC<Props> = ({ open, onClose, onCreate }) => {
  const [packId, setPackId] = useState('')
  const [contentType, setContentType] = useState('ability_icons')
  const [version, setVersion] = useState('1.0.0')

  React.useEffect(() => {
    if (open) { setPackId(''); setVersion('1.0.0'); setContentType('ability_icons') }
  }, [open])

  const handleCreate = () => {
    const id = packId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    if (!id) return
    onCreate(id, contentType, version.trim() || '1.0.0')
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Create Asset Pack</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Pack ID"
            size="small"
            fullWidth
            autoFocus
            value={packId}
            onChange={(e) => setPackId(e.target.value)}
            helperText="Lowercase identifier (e.g. hybicons, my-badges)"
          />
          <FormControl size="small" fullWidth>
            <InputLabel>Content Type</InputLabel>
            <Select value={contentType} label="Content Type" onChange={(e) => setContentType(e.target.value)}>
              {CONTENT_TYPES.map(ct => (
                <MenuItem key={ct.value} value={ct.value}>{ct.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Version"
            size="small"
            fullWidth
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleCreate} disabled={!packId.trim()}>Create</Button>
      </DialogActions>
    </Dialog>
  )
}

export default CreatePackDialog
