import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Box, Typography, TextField, Table, TableHead, TableRow,
  TableCell, TableBody, IconButton, Tooltip, CircularProgress, Button, Divider
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import SaveIcon from '@mui/icons-material/Save'
import { useRecoilValue } from 'recoil'
import { clientPathState, activeLibraryState } from '../recoil/atoms'

interface SfxEntry {
  entryName: string
  sizeBytes: number
}

interface SfxMeta {
  name?: string
  comment?: string
}

type SfxIndex = Record<string, SfxMeta>

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function sfxId(entryName: string): number | null {
  const m = entryName.match(/(\d+)\.mp3$/i)
  return m ? parseInt(m[1], 10) : null
}

const SfxPage: React.FC = () => {
  const clientPath    = useRecoilValue(clientPathState)
  const activeLibrary = useRecoilValue(activeLibraryState)

  const [entries, setEntries]     = useState<SfxEntry[]>([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [filter, setFilter]       = useState('')
  const [selected, setSelected]   = useState<string | null>(null)

  // Index state
  const [index, setIndex]         = useState<SfxIndex>({})
  const [draft, setDraft]         = useState<SfxMeta>({})
  const [dirty, setDirty]         = useState(false)
  const [saving, setSaving]       = useState(false)

  // Audio state
  const [playingEntry, setPlayingEntry]   = useState<string | null>(null)
  const [loadingEntry, setLoadingEntry]   = useState<string | null>(null)
  const audioRef    = useRef<HTMLAudioElement | null>(null)
  const blobUrlRef  = useRef<string | null>(null)

  // Load entries from legend.dat
  useEffect(() => {
    if (!clientPath) return
    setLoading(true)
    setError(null)
    window.api.sfxList(clientPath)
      .then((list) => {
        const sorted = [...list].sort((a, b) => {
          const ia = sfxId(a.entryName) ?? Infinity
          const ib = sfxId(b.entryName) ?? Infinity
          return ia !== ib ? ia - ib : a.entryName.localeCompare(b.entryName)
        })
        setEntries(sorted)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load legend.dat'))
      .finally(() => setLoading(false))
  }, [clientPath])

  // Load index when library changes
  useEffect(() => {
    if (!activeLibrary) { setIndex({}); return }
    window.api.sfxIndexLoad(activeLibrary).then(setIndex).catch(() => setIndex({}))
  }, [activeLibrary])

  // Sync draft when selection changes
  useEffect(() => {
    if (!selected) { setDraft({}); setDirty(false); return }
    setDraft(index[selected] ?? {})
    setDirty(false)
  }, [selected, index])

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [])

  const stopCurrent = useCallback(() => {
    audioRef.current?.pause()
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    setPlayingEntry(null)
  }, [])

  const handlePlay = useCallback(async (entryName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!clientPath) return

    if (playingEntry === entryName) {
      stopCurrent()
      return
    }

    stopCurrent()
    setLoadingEntry(entryName)

    try {
      const buf = await window.api.sfxReadEntry(clientPath, entryName)
      const blob = new Blob([new Uint8Array(buf)], { type: 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      blobUrlRef.current = url

      if (!audioRef.current) audioRef.current = new Audio()
      const audio = audioRef.current
      audio.src = url
      audio.onended = () => setPlayingEntry(null)
      audio.onerror = () => setPlayingEntry(null)
      await audio.play()
      setPlayingEntry(entryName)
    } catch {
      // play failed — clear state
    } finally {
      setLoadingEntry(null)
    }
  }, [clientPath, playingEntry, stopCurrent])

  const handleSave = useCallback(async () => {
    if (!activeLibrary || !selected) return
    setSaving(true)
    const next: SfxIndex = { ...index }
    if (!draft.name && !draft.comment) {
      delete next[selected]
    } else {
      next[selected] = draft
    }
    try {
      await window.api.sfxIndexSave(activeLibrary, next)
      setIndex(next)
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }, [activeLibrary, selected, index, draft])

  const filtered = useMemo(() => {
    if (!filter.trim()) return entries
    const q = filter.trim().toLowerCase()
    return entries.filter((e) => {
      const id   = sfxId(e.entryName)
      const meta = index[e.entryName]
      return (
        e.entryName.toLowerCase().includes(q) ||
        (id !== null && String(id).includes(q)) ||
        (meta?.name?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [entries, filter, index])

  if (!clientPath) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography variant="h5" gutterBottom sx={{ color: 'text.button', fontWeight: 'bold' }}>
          Sound Effects Browser
        </Typography>
        <Typography color="text.secondary">
          No Dark Ages client path configured. Set it in Settings.
        </Typography>
      </Box>
    )
  }

  if (loading) {
    return (
      <Box sx={{ p: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
        <CircularProgress size={20} />
        <Typography color="text.secondary">Loading legend.dat…</Typography>
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    )
  }

  const selectedEntry = selected ? entries.find((e) => e.entryName === selected) ?? null : null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
          {filtered.length} / {entries.length} entries
        </Typography>
        <TextField
          size="small"
          placeholder="Filter by name or ID…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          sx={{ width: 260 }}
        />
        {playingEntry && (
          <Typography variant="caption" color="secondary.light" noWrap sx={{ flex: 1 }}>
            Playing: {index[playingEntry]?.name || playingEntry}
          </Typography>
        )}
      </Box>

      {/* Body: list + detail */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: list */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 48 }} />
                <TableCell sx={{ width: 70 }}>ID</TableCell>
                <TableCell>Name / File</TableCell>
                <TableCell sx={{ width: 80 }}>Size</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((e) => {
                const id        = sfxId(e.entryName)
                const meta      = index[e.entryName]
                const isPlaying = playingEntry === e.entryName
                const isLoading = loadingEntry === e.entryName
                const isSelected = selected === e.entryName
                return (
                  <TableRow
                    key={e.entryName}
                    hover
                    selected={isSelected}
                    onClick={() => setSelected(e.entryName)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell padding="checkbox" onClick={(ev) => ev.stopPropagation()}>
                      {isLoading ? (
                        <CircularProgress size={18} sx={{ mx: 1 }} />
                      ) : (
                        <Tooltip title={isPlaying ? 'Stop' : 'Play'}>
                          <IconButton size="small" onClick={(ev) => handlePlay(e.entryName, ev)}>
                            {isPlaying ? <StopIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{id ?? '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      {meta?.name ? (
                        <>
                          <Typography variant="body2">{meta.name}</Typography>
                          <Typography variant="caption" color="text.disabled">{e.entryName}</Typography>
                        </>
                      ) : (
                        <Typography variant="body2">{e.entryName}</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">{formatBytes(e.sizeBytes)}</Typography>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Box>

        {/* Right: detail panel */}
        <Divider orientation="vertical" flexItem />
        <Box sx={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selectedEntry ? (
            <Box sx={{ p: 3 }}>
              <Typography variant="body2" color="text.disabled">Select an entry to annotate it.</Typography>
            </Box>
          ) : (
            <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'auto' }}>
              <Box>
                <Typography variant="caption" color="text.secondary">{selectedEntry.entryName}</Typography>
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
                  ID: {sfxId(selectedEntry.entryName) ?? '—'} · {formatBytes(selectedEntry.sizeBytes)}
                </Typography>
              </Box>

              {!activeLibrary && (
                <Typography variant="caption" color="text.disabled">
                  No library configured — annotations cannot be saved.
                </Typography>
              )}

              <TextField
                label="Name"
                size="small"
                fullWidth
                value={draft.name ?? ''}
                disabled={!activeLibrary}
                onChange={(e) => { setDraft((d) => ({ ...d, name: e.target.value || undefined })); setDirty(true) }}
              />
              <TextField
                label="Comment"
                size="small"
                fullWidth
                multiline
                minRows={3}
                value={draft.comment ?? ''}
                disabled={!activeLibrary}
                onChange={(e) => { setDraft((d) => ({ ...d, comment: e.target.value || undefined })); setDirty(true) }}
              />

              <Button
                variant="contained"
                size="small"
                startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
                disabled={!dirty || !activeLibrary || saving}
                onClick={handleSave}
                sx={{ alignSelf: 'flex-start' }}
              >
                Save
              </Button>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  )
}

export default SfxPage
