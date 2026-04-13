import React from 'react'
import {
  Box, Typography, TextField, Chip, IconButton,
  Tooltip, Divider, Button
} from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import type { MusicEntry } from '../../hooks/useMusicLibrary'

interface Props {
  entry: MusicEntry | null
  draft: MusicMeta
  dirty: boolean
  /** Map IDs that reference this track (from world index) */
  usedByMaps: string[]
  onUpdate: (changes: Partial<MusicMeta>) => void
  onSave: () => void
  onPlay: () => void
  onRemove: () => void
  isPlaying: boolean
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const MusicMetaEditor: React.FC<Props> = ({
  entry, draft, dirty, usedByMaps, onUpdate, onSave, onPlay, onRemove, isPlaying
}) => {
  const [tagInput, setTagInput] = React.useState('')

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase()
    if (!tag) return
    const current = draft.tags ?? []
    if (!current.includes(tag)) {
      onUpdate({ tags: [...current, tag] })
    }
    setTagInput('')
  }

  const handleRemoveTag = (tag: string) => {
    onUpdate({ tags: (draft.tags ?? []).filter((t) => t !== tag) })
  }

  if (!entry) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="text.secondary">Select a track to edit</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="h6" sx={{ flex: 1, color: 'text.button', fontWeight: 'bold' }}>
          {entry.filename}
        </Typography>
        <Tooltip title={isPlaying ? 'Stop' : 'Play'}>
          <IconButton
            size="small"
            onClick={onPlay}
            sx={{ color: isPlaying ? 'secondary.main' : 'text.button' }}
          >
            {isPlaying ? '⏹' : '▶'}
          </IconButton>
        </Tooltip>
        <Tooltip title={dirty ? 'Save changes' : 'No changes'}>
          <span>
            <IconButton size="small" disabled={!dirty} onClick={onSave} color={dirty ? 'primary' : 'default'}>
              <SaveIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Remove from library">
          <IconButton size="small" onClick={onRemove} sx={{ color: 'error.main' }}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Divider />

      {/* File info */}
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Size: <strong>{formatBytes(entry.sizeBytes)}</strong>
        </Typography>
        {entry.musicId !== null && (
          <Typography variant="caption" color="text.secondary">
            Music ID: <strong>{entry.musicId}</strong>
          </Typography>
        )}
      </Box>

      {/* Name */}
      <TextField
        label="Name"
        size="small"
        fullWidth
        value={draft.name ?? ''}
        onChange={(e) => onUpdate({ name: e.target.value })}
        placeholder="Human-readable title"
      />

      {/* Notes */}
      <TextField
        label="Notes"
        size="small"
        fullWidth
        multiline
        rows={3}
        value={draft.notes ?? ''}
        onChange={(e) => onUpdate({ notes: e.target.value })}
        placeholder="Optional notes about this track"
      />

      {/* Tags */}
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          Tags
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
          {(draft.tags ?? []).map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              onDelete={() => handleRemoveTag(tag)}
            />
          ))}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            size="small"
            placeholder="Add tag…"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag() } }}
            sx={{ flex: 1 }}
          />
          <IconButton size="small" onClick={handleAddTag}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* Map cross-reference */}
      {usedByMaps.length > 0 && (
        <Box>
          <Divider sx={{ mb: 1.5 }} />
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            Used by {usedByMaps.length} map{usedByMaps.length !== 1 ? 's' : ''}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {usedByMaps.map((name) => (
              <Chip key={name} label={name} size="small" variant="outlined" />
            ))}
          </Box>
        </Box>
      )}

      <Box sx={{ flex: 1 }} />

      {dirty && (
        <Button variant="contained" size="small" startIcon={<SaveIcon />} onClick={onSave}>
          Save Changes
        </Button>
      )}
    </Box>
  )
}

export default MusicMetaEditor
