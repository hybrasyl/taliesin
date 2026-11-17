import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  TextField,
  Tooltip,
  Typography
} from '@mui/material'
import ClearIcon from '@mui/icons-material/Clear'
import CloseIcon from '@mui/icons-material/Close'
import GraphicEqIcon from '@mui/icons-material/GraphicEq'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import { FilterField } from '../shared/FilterField'
import { useAudioPreview } from '../../hooks/useAudioPreview'
import { reloadPacks } from '../../utils/packCaches'

/**
 * The map's ambient sound (HXML-14, HTOO-624).
 *
 * `Map/@AmbientSound` is an unsignedByte. 0 is the default and means no ambient
 * sound, so the field is empty for 0 and accepts 1 to 255. A value names an
 * `amb_{id}` in an ambient_sounds pack. Unlike music, the legacy client has no
 * ambient files, so the installed packs are the only source the picker and the
 * preview read. An id that no installed pack covers is still valid: the pack
 * can be on another machine, or not built yet.
 */

/** The installed pack subtype that main's ambient_sounds handler registers. */
const AMBIENT_SUBTYPE = 'ambient'

export const AMBIENT_MIN = 1
export const AMBIENT_MAX = 255

/** Parse the field's text. Empty is no ambient sound; junk is ignored (null). */
export function parseAmbientInput(raw: string): number | undefined | null {
  if (raw.trim() === '') return undefined
  const n = Number(raw)
  if (!Number.isInteger(n)) return null
  if (n < AMBIENT_MIN) return undefined
  return Math.min(AMBIENT_MAX, n)
}

/** Read the ambient ids that the installed packs cover, after a rescan. */
async function loadPackAmbientIds(): Promise<Set<number>> {
  // Rescan so a .datf put in the assets folder since launch is found.
  await reloadPacks()
  const ids = await window.api.packListCoveredIds(AMBIENT_SUBTYPE)
  return new Set(ids.map((x) => Number(x)).filter((n) => Number.isInteger(n)))
}

async function readAmbient(id: number): Promise<{ bytes: Uint8Array; mime: string } | null> {
  return window.api.packResolveAsset(AMBIENT_SUBTYPE, id)
}

function AmbientPickerDialog({
  open,
  value,
  onClose,
  onChange
}: {
  open: boolean
  value: number | undefined
  onClose: () => void
  onChange: (id: number) => void
}): React.ReactElement {
  const [ids, setIds] = useState<number[]>([])
  const [search, setSearch] = useState('')
  const { isPlaying, toggle, stop } = useAudioPreview<number>()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    loadPackAmbientIds()
      .then((set) => {
        if (!cancelled) setIds(Array.from(set).sort((a, b) => a - b))
      })
      .catch(() => {
        if (!cancelled) setIds([])
      })
    return () => {
      cancelled = true
    }
  }, [open])

  // Stop playback when the dialog closes. The hook stops it on unmount.
  useEffect(() => {
    if (!open) stop()
  }, [open, stop])

  const filtered = useMemo(() => {
    const q = search.trim()
    return q ? ids.filter((id) => String(id).includes(q)) : ids
  }, [ids, search])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      sx={{ '& .MuiDialog-paper': { width: 420 } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', py: 1.5, gap: 1 }}>
        Ambient Sound
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          ({ids.length} in installed packs)
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ ml: 'auto' }} aria-label="Close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 1.5, pt: '8px !important' }}>
        <FilterField
          fullWidth
          placeholder="Filter by id…"
          value={search}
          onChange={setSearch}
          sx={{ mb: 1 }}
        />
        {filtered.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', p: 2, textAlign: 'center' }}>
            No installed ambient_sounds pack covers an ambient id. Type the id in the field.
          </Typography>
        ) : (
          <List dense sx={{ maxHeight: 400, overflow: 'auto' }}>
            {filtered.map((id) => {
              const rowPlaying = isPlaying(id)
              return (
                <ListItemButton
                  key={id}
                  selected={id === value}
                  onClick={() => onChange(id)}
                  sx={{ borderRadius: 1, gap: 1 }}
                >
                  <Typography sx={{ fontFamily: 'monospace', flex: 1 }}>amb_{id}</Typography>
                  <Tooltip title={rowPlaying ? 'Stop' : 'Preview'}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation()
                        void toggle(id, () => readAmbient(id))
                      }}
                    >
                      {rowPlaying ? (
                        <StopIcon fontSize="small" />
                      ) : (
                        <PlayArrowIcon fontSize="small" />
                      )}
                    </IconButton>
                  </Tooltip>
                </ListItemButton>
              )
            })}
          </List>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default function AmbientSoundField({
  value,
  onChange
}: {
  value: number | undefined
  onChange: (v: number | undefined) => void
}): React.ReactElement {
  const [text, setText] = useState(value != null ? String(value) : '')
  const [packIds, setPackIds] = useState<Set<number>>(new Set())
  const [pickerOpen, setPickerOpen] = useState(false)
  const { playing, error, toggle, stop } = useAudioPreview('Failed to play ambient sound')

  useEffect(() => {
    setText(value != null ? String(value) : '')
  }, [value])

  useEffect(() => {
    let cancelled = false
    loadPackAmbientIds()
      .then((set) => {
        if (!cancelled) setPackIds(set)
      })
      .catch(() => {
        if (!cancelled) setPackIds(new Set())
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Stop playback when the value changes. The hook stops it on unmount.
  useEffect(() => {
    stop()
  }, [value, stop])

  const handleTextChange = (raw: string): void => {
    setText(raw)
    const parsed = parseAmbientInput(raw)
    if (parsed !== null) onChange(parsed)
  }

  const covered = value != null && packIds.has(value)

  const handleTogglePlay = useCallback(
    () => toggle(true, async () => (value == null ? null : readAmbient(value))),
    [toggle, value]
  )

  const playTooltip =
    value == null
      ? 'Set an Ambient Sound to preview'
      : !covered
        ? `No installed pack has amb_${value}`
        : playing
          ? 'Stop preview'
          : 'Preview ambient sound'

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
      <TextField
        label="Ambient Sound"
        size="small"
        type="number"
        sx={{ width: 120 }}
        value={text}
        placeholder="None"
        slotProps={{ htmlInput: { min: AMBIENT_MIN, max: AMBIENT_MAX } }}
        onChange={(e) => handleTextChange(e.target.value)}
        error={!!error}
        helperText={error ?? undefined}
      />
      <Tooltip title="Browse ambient sounds…">
        <IconButton size="small" onClick={() => setPickerOpen(true)}>
          <GraphicEqIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <AmbientPickerDialog
        open={pickerOpen}
        value={value}
        onClose={() => setPickerOpen(false)}
        onChange={(id) => {
          onChange(id)
          setPickerOpen(false)
        }}
      />
      <Tooltip title="Clear (no ambient sound)">
        <span>
          <IconButton
            size="small"
            onClick={() => {
              setText('')
              onChange(undefined)
            }}
            disabled={value == null}
          >
            <ClearIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={playTooltip}>
        <span>
          <IconButton
            size="small"
            onClick={handleTogglePlay}
            disabled={!covered}
            color={playing ? 'primary' : 'default'}
          >
            {playing ? <StopIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  )
}
