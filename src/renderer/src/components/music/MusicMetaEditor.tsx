import React from 'react'
import {
  Box,
  Typography,
  TextField,
  Chip,
  IconButton,
  Tooltip,
  Divider,
  Button
} from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { MAX_TAG_LENGTH, formatDuration, type MusicEntry } from '../../hooks/useMusicLibrary'

interface Props {
  entry: MusicEntry | null
  meta: MusicMeta | null
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

function formatChannels(n: number | undefined): string | null {
  if (n == null) return null
  if (n === 1) return 'Mono'
  if (n === 2) return 'Stereo'
  return `${n} ch`
}

const InfoChip: React.FC<{ label: React.ReactNode }> = ({ label }) => (
  <Typography variant="caption" color="text.secondary">
    {label}
  </Typography>
)

const MusicMetaEditor: React.FC<Props> = ({
  entry,
  meta,
  draft,
  dirty,
  usedByMaps,
  onUpdate,
  onSave,
  onPlay,
  onRemove,
  isPlaying
}) => {
  const [tagInput, setTagInput] = React.useState('')
  const tagTrimmed = tagInput.trim()
  const tagTooLong = tagTrimmed.length > MAX_TAG_LENGTH
  const canAddTag = tagTrimmed.length > 0 && !tagTooLong

  const handleAddTag = () => {
    const tag = tagTrimmed.toLowerCase()
    if (!tag || tag.length > MAX_TAG_LENGTH) return
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

  const durationStr = formatDuration(meta?.duration)
  const bitrateStr = meta?.bitrate != null ? `${Math.round(meta.bitrate / 1000)} kbps` : null
  const sampleStr = meta?.sampleRate != null ? `${(meta.sampleRate / 1000).toFixed(1)} kHz` : null
  const channelsStr = formatChannels(meta?.channels)

  return (
    <Box
      sx={{
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        height: '100%',
        overflow: 'auto'
      }}
    >
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
            <IconButton
              size="small"
              disabled={!dirty}
              onClick={onSave}
              color={dirty ? 'primary' : 'default'}
            >
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

      {/* Audio properties */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, rowGap: 0.5 }}>
        {durationStr && (
          <InfoChip
            label={
              <>
                Duration: <strong>{durationStr}</strong>
              </>
            }
          />
        )}
        {bitrateStr && (
          <InfoChip
            label={
              <>
                Bitrate: <strong>{bitrateStr}</strong>
              </>
            }
          />
        )}
        {sampleStr && (
          <InfoChip
            label={
              <>
                Sample rate: <strong>{sampleStr}</strong>
              </>
            }
          />
        )}
        {channelsStr && <InfoChip label={<strong>{channelsStr}</strong>} />}
        <InfoChip
          label={
            <>
              Size: <strong>{formatBytes(entry.sizeBytes)}</strong>
            </>
          }
        />
        {entry.musicId !== null && (
          <InfoChip
            label={
              <>
                Music ID: <strong>{entry.musicId}</strong>
              </>
            }
          />
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

      {/* Description */}
      <TextField
        label="Description"
        size="small"
        fullWidth
        multiline
        rows={2}
        value={draft.description ?? ''}
        onChange={(e) => onUpdate({ description: e.target.value })}
        placeholder="Longer prose about the track (auto-filled from genre tag on import)"
      />

      {/* Prompt — read-only, only when file has a TXXX:PROMPT frame */}
      {meta?.prompt && (
        <TextField
          label="Prompt"
          size="small"
          fullWidth
          multiline
          maxRows={6}
          value={meta.prompt}
          slotProps={{ input: { readOnly: true } }}
          helperText="From ID3 TXXX:PROMPT frame"
        />
      )}

      {/* Tags */}
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          Tags
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
          {(draft.tags ?? []).map((tag) => (
            <Chip key={tag} label={tag} size="small" onDelete={() => handleRemoveTag(tag)} />
          ))}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <TextField
            size="small"
            placeholder="Add tag…"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canAddTag) {
                e.preventDefault()
                handleAddTag()
              }
            }}
            error={tagTooLong}
            helperText={tagTooLong ? `Tags must be ${MAX_TAG_LENGTH} characters or less` : ' '}
            sx={{ flex: 1 }}
          />
          <IconButton size="small" onClick={handleAddTag} disabled={!canAddTag} sx={{ mt: 0.5 }}>
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
