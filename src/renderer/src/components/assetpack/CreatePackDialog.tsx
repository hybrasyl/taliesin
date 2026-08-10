import React, { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  FormHelperText,
  Typography
} from '@mui/material'
import { listKinds, getKind } from '../../packKinds'
import type { ContentType } from '../../packKinds'

interface Props {
  open: boolean
  onClose: () => void
  onCreate: (packId: string, contentType: ContentType, version: string) => void
}

const KIND_OPTIONS = listKinds().map((k) => ({ value: k.type, label: k.label }))
const DEFAULT_TYPE: ContentType = KIND_OPTIONS[0].value

const CreatePackDialog: React.FC<Props> = ({ open, onClose, onCreate }) => {
  const [packId, setPackId] = useState('')
  const [contentType, setContentType] = useState<ContentType>(DEFAULT_TYPE)
  const [version, setVersion] = useState('1.0.0')

  React.useEffect(() => {
    if (open) {
      setPackId('')
      setVersion('1.0.0')
      setContentType(DEFAULT_TYPE)
    }
  }, [open])

  const kind = getKind(contentType)

  const handleCreate = () => {
    const id = packId
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
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
            {/* `id` + `labelId` is what gives the Select an accessible NAME.
                Without the pair, MUI renders the label as a floating sibling and
                the combobox announces only its value -- a screen reader user
                hears "Ability Icons" with no idea what it selects, and
                getByRole('combobox', { name }) cannot find it either. The
                `label` prop below is a separate job: it only sizes the notch in
                the outline. */}
            <InputLabel id="create-pack-content-type-label">Content Type</InputLabel>
            <Select
              labelId="create-pack-content-type-label"
              value={contentType}
              label="Content Type"
              onChange={(e) => setContentType(e.target.value as ContentType)}
            >
              {KIND_OPTIONS.map((ct) => (
                <MenuItem key={ct.value} value={ct.value}>
                  {ct.label}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText component="div">
              <Typography variant="caption" component="div">
                {kind.description}
              </Typography>
              {kind.dimension && (
                <Typography variant="caption" component="div" sx={{ opacity: 0.7 }}>
                  Dimensions: {kind.dimension.label}
                </Typography>
              )}
            </FormHelperText>
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
        <Button variant="contained" onClick={handleCreate} disabled={!packId.trim()}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default CreatePackDialog
