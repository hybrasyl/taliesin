import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  Box,
  Typography,
  IconButton,
  InputAdornment,
  ToggleButtonGroup,
  ToggleButton,
  List,
  ListItemButton,
  Tooltip
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SearchIcon from '@mui/icons-material/Search'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'

interface Props {
  open: boolean
  value: number | undefined
  clientPath: string | null
  onClose: () => void
  onChange: (id: number) => void
}

// Picker for a map's background music id — mirrors Creidhne's sound picker.
// Lists the ids playable on this machine (client {id}.mus files, plus in
// Hybrasyl mode any ids an installed music pack overrides) with per-row preview.
const MusicPickerDialog: React.FC<Props> = ({ open, value, clientPath, onClose, onChange }) => {
  const [clientIds, setClientIds] = useState<Set<number>>(new Set())
  const [packIds, setPackIds] = useState<Set<number>>(new Set())
  const [mode, setMode] = useState<'vanilla' | 'hybrasyl'>('vanilla')
  const [search, setSearch] = useState('')
  const [playingId, setPlayingId] = useState<number | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  const packHasMusic = packIds.size > 0
  const preferPack = packHasMusic && mode === 'hybrasyl'

  const stop = useCallback(() => {
    audioRef.current?.pause()
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    setPlayingId(null)
  }, [])

  // Load available ids when the dialog opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const entries = clientPath ? await window.api.musicClientScan(clientPath) : []
        if (!cancelled) {
          const ids = new Set<number>()
          for (const e of entries) {
            const m = e.filename.match(/^(\d+)\.mus$/i)
            if (m) ids.add(parseInt(m[1], 10))
          }
          setClientIds(ids)
        }
      } catch {
        if (!cancelled) setClientIds(new Set())
      }
      try {
        const ids = await window.api.packListCoveredIds('music')
        if (!cancelled) setPackIds(new Set(ids.map((x) => Number(x))))
      } catch {
        if (!cancelled) setPackIds(new Set())
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, clientPath])

  // Stop playback whenever the dialog closes.
  useEffect(() => {
    if (!open) stop()
  }, [open, stop])
  useEffect(() => stop, [stop])

  const ids = useMemo(() => {
    const merged = new Set(clientIds)
    if (preferPack) for (const id of packIds) merged.add(id)
    return Array.from(merged).sort((a, b) => a - b)
  }, [clientIds, packIds, preferPack])

  const filtered = useMemo(() => {
    const q = search.trim()
    return q ? ids.filter((id) => String(id).includes(q)) : ids
  }, [ids, search])

  const play = useCallback(
    async (id: number) => {
      if (playingId === id) {
        stop()
        return
      }
      stop()
      try {
        let url: string | null = null
        if (preferPack && packIds.has(id)) {
          // The main process returns a data: URL, but the CSP only allows
          // media-src blob: — so convert to a blob: URL, matching the vanilla
          // path below. (data: is fine for <img> but Chromium blocks it for
          // <audio>.)
          const dataUrl = await window.api.packResolveAsset('music', id)
          if (dataUrl) {
            const blob = await (await fetch(dataUrl)).blob()
            const objUrl = URL.createObjectURL(blob)
            blobUrlRef.current = objUrl
            url = objUrl
          }
        } else if (clientIds.has(id) && clientPath) {
          const sep = clientPath.includes('\\') ? '\\' : '/'
          const buf = await window.api.readFile(`${clientPath}${sep}music${sep}${id}.mus`)
          const objUrl = URL.createObjectURL(new Blob([new Uint8Array(buf)], { type: 'audio/mpeg' }))
          blobUrlRef.current = objUrl
          url = objUrl
        }
        if (!url) return
        if (!audioRef.current) audioRef.current = new Audio()
        const audio = audioRef.current
        audio.src = url
        audio.onended = () => setPlayingId(null)
        audio.onerror = () => setPlayingId(null)
        await audio.play()
        setPlayingId(id)
      } catch {
        setPlayingId(null)
      }
    },
    [playingId, preferPack, packIds, clientIds, clientPath, stop]
  )

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', py: 1.5, gap: 1 }}>
        Music
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          ({ids.length} available)
        </Typography>
        {packHasMusic && (
          <ToggleButtonGroup
            size="small"
            exclusive
            value={mode}
            onChange={(_, v) => v && setMode(v)}
            sx={{ ml: 1 }}
          >
            <ToggleButton value="vanilla">Vanilla</ToggleButton>
            <ToggleButton value="hybrasyl">Hybrasyl</ToggleButton>
          </ToggleButtonGroup>
        )}
        <IconButton size="small" onClick={onClose} sx={{ ml: 'auto' }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 1.5, pt: '8px !important' }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Filter by id…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ mb: 1 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              )
            }
          }}
        />
        {filtered.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
            {clientPath ? 'No music tracks available.' : 'Set a client path in Settings.'}
          </Typography>
        ) : (
          <List dense sx={{ maxHeight: 400, overflow: 'auto' }}>
            {filtered.map((id) => {
              const isPlaying = playingId === id
              const fromPack = preferPack && packIds.has(id)
              return (
                <ListItemButton
                  key={id}
                  selected={id === value}
                  onClick={() => onChange(id)}
                  sx={{ borderRadius: 1, gap: 1 }}
                >
                  <Typography sx={{ flex: 1, fontFamily: 'monospace' }}>{id}</Typography>
                  {fromPack && (
                    <Typography variant="caption" sx={{ color: 'primary.main' }}>
                      pack
                    </Typography>
                  )}
                  <Tooltip title={isPlaying ? 'Stop' : 'Preview'}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation()
                        void play(id)
                      }}
                    >
                      {isPlaying ? <StopIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
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

export default MusicPickerDialog
