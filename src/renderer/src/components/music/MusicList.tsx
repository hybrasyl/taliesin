import React, { useState, useRef, useEffect } from 'react'
import {
  Box, Typography, TextField, InputAdornment, IconButton, Tooltip, Chip
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import SyncIcon from '@mui/icons-material/Sync'
import AddIcon from '@mui/icons-material/Add'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { MusicEntry } from '../../hooks/useMusicLibrary'

interface Props {
  entries: MusicEntry[]
  metadata: Record<string, MusicMeta>
  selectedFilename: string | null
  scanning: boolean
  onSelect: (filename: string) => void
  onScan: () => void
  onImport: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function extOf(filename: string): string {
  return filename.slice(filename.lastIndexOf('.') + 1).toLowerCase()
}

const EXT_COLOR: Record<string, 'default' | 'primary' | 'secondary' | 'info'> = {
  mp3:  'primary',
  ogg:  'secondary',
  mus:  'info',
  flac: 'secondary',
  wav:  'default',
}

const MusicList: React.FC<Props> = ({
  entries, metadata, selectedFilename, scanning, onSelect, onScan, onImport
}) => {
  const [query, setQuery] = useState('')

  const filtered = query.trim()
    ? entries.filter((e) => {
        const q = query.toLowerCase()
        const name = (metadata[e.filename]?.name ?? '').toLowerCase()
        return e.filename.toLowerCase().includes(q) || name.includes(q)
      })
    : entries

  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 10,
  })

  // Scroll selected item into view on first load
  useEffect(() => {
    if (!selectedFilename) return
    const idx = filtered.findIndex((e) => e.filename === selectedFilename)
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'auto' })
  }, [selectedFilename]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <Box sx={{ px: 1.5, pt: 1.5, pb: 1, display: 'flex', gap: 0.5, alignItems: 'center' }}>
        <TextField
          size="small" placeholder="Search…" value={query}
          onChange={(e) => setQuery(e.target.value)}
          sx={{ flex: 1 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }
          }}
        />
        <Tooltip title="Import files">
          <IconButton size="small" onClick={onImport}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={scanning ? 'Scanning…' : 'Refresh'}>
          <span>
            <IconButton size="small" onClick={onScan} disabled={scanning}>
              <SyncIcon fontSize="small" sx={scanning ? { animation: 'spin 1s linear infinite' } : {}} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, pb: 0.5 }}>
        {filtered.length} track{filtered.length !== 1 ? 's' : ''}
      </Typography>

      {/* Virtualized list */}
      <Box ref={parentRef} sx={{ flex: 1, overflow: 'auto' }}>
        <Box sx={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const entry = filtered[vi.index]
            const meta  = metadata[entry.filename]
            const label = meta?.name || entry.filename
            const ext   = extOf(entry.filename)
            const isSelected = entry.filename === selectedFilename

            return (
              <Box
                key={entry.filename}
                onClick={() => onSelect(entry.filename)}
                sx={{
                  position: 'absolute', top: vi.start, left: 0, right: 0,
                  height: vi.size,
                  display: 'flex', alignItems: 'center', gap: 1,
                  px: 1.5, cursor: 'pointer',
                  bgcolor: isSelected ? 'action.selected' : 'transparent',
                  '&:hover': { bgcolor: isSelected ? 'action.selected' : 'action.hover' },
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Chip
                  label={ext}
                  size="small"
                  color={EXT_COLOR[ext] ?? 'default'}
                  variant="outlined"
                  sx={{ fontSize: '0.65rem', height: 18, minWidth: 32 }}
                />
                <Box sx={{ flex: 1, overflow: 'hidden' }}>
                  <Typography variant="body2" noWrap sx={{ color: 'text.primary', fontWeight: isSelected ? 600 : 400 }}>
                    {label}
                  </Typography>
                  {(() => {
                    const slashIdx = entry.filename.lastIndexOf('/')
                    const folder = slashIdx > 0 ? entry.filename.slice(0, slashIdx) : null
                    const secondary = meta?.name
                      ? folder ? `${entry.filename.slice(slashIdx + 1)} · ${folder}` : entry.filename
                      : folder ?? null
                    return secondary ? (
                      <Typography variant="caption" noWrap color="text.secondary">
                        {secondary}
                      </Typography>
                    ) : null
                  })()}
                </Box>
                <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }}>
                  {formatBytes(entry.sizeBytes)}
                </Typography>
              </Box>
            )
          })}
        </Box>
      </Box>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </Box>
  )
}

export default MusicList
