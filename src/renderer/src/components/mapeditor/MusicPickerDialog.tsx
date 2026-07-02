import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { parseFilename } from '../../hooks/useMusicLibrary'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
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

type TrackMeta = { title: string | null; artist: string | null; album: string | null }

// "Title (Artist - Album)" — omit any missing part; empty string if no tags.
function formatMeta(m: TrackMeta | undefined): string {
  if (!m) return ''
  const suffix = [m.artist, m.album].filter(Boolean).join(' - ')
  const base = m.title ?? ''
  if (base && suffix) return `${base} (${suffix})`
  return base || suffix
}

// Picker for a map's background music id — mirrors Creidhne's sound picker.
// Lists the ids playable on this machine (client {id}.mus files, plus in
// Hybrasyl mode any ids an installed music pack overrides) with per-row preview.
const MusicPickerDialog: React.FC<Props> = ({ open, value, clientPath, onClose, onChange }) => {
  const [clientIds, setClientIds] = useState<Set<number>>(new Set())
  const [packIds, setPackIds] = useState<Set<number>>(new Set())
  const [metas, setMetas] = useState<Map<number, TrackMeta>>(new Map())
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
            const id = parseFilename(e.filename)
            if (id !== null) ids.add(id)
          }
          setClientIds(ids)
        }
      } catch {
        if (!cancelled) setClientIds(new Set())
      }
      try {
        // Rescan installed packs so a .datf dropped in since launch is picked
        // up without a restart, then read the (possibly updated) coverage.
        await window.api.packReload()
        const ids = (await window.api.packListCoveredIds('music')).map((x) => Number(x))
        if (!cancelled) setPackIds(new Set(ids))
        // ID3 title/artist/album for each pack track (curated, few) so rows can
        // be labelled with the track name instead of a bare id.
        const pairs = await Promise.all(
          ids.map(async (id) => [id, await window.api.packTrackMeta('music', id)] as const)
        )
        if (!cancelled) {
          const next = new Map<number, TrackMeta>()
          for (const [id, meta] of pairs) if (meta) next.set(id, meta)
          setMetas(next)
        }
      } catch {
        if (!cancelled) {
          setPackIds(new Set())
          setMetas(new Map())
        }
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
          // Main returns raw bytes + MIME; wrap in a blob: URL (CSP allows
          // media-src blob:, but blocks both fetch(data:) and <audio src=data:>).
          const res = await window.api.packResolveAsset('music', id)
          if (res) {
            const objUrl = URL.createObjectURL(
              new Blob([new Uint8Array(res.bytes)], { type: res.mime })
            )
            blobUrlRef.current = objUrl
            url = objUrl
          }
        } else if (clientIds.has(id) && clientPath) {
          const sep = clientPath.includes('\\') ? '\\' : '/'
          const buf = await window.api.readFile(`${clientPath}${sep}music${sep}${id}.mus`)
          const objUrl = URL.createObjectURL(
            new Blob([new Uint8Array(buf)], { type: 'audio/mpeg' })
          )
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
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      sx={{ '& .MuiDialog-paper': { width: 560 } }}
    >
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
              // Only label the pack (Hybrasyl) row — vanilla plays the original
              // {id}.mus, whose tags may differ from the pack override's.
              const title = fromPack ? formatMeta(metas.get(id)) : ''
              return (
                <ListItemButton
                  key={id}
                  selected={id === value}
                  onClick={() => onChange(id)}
                  sx={{ borderRadius: 1, gap: 1 }}
                >
                  <Typography sx={{ fontFamily: 'monospace', minWidth: 44 }}>{id}</Typography>
                  <Typography variant="body2" noWrap sx={{ flex: 1, color: 'text.secondary' }}>
                    {title}
                  </Typography>
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
                      {isPlaying ? (
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

export default MusicPickerDialog
