import React, { useState, useCallback } from 'react'
import {
  Box,
  Typography,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  IconButton,
  Tooltip
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import SyncIcon from '@mui/icons-material/Sync'

interface ClientEntry {
  filename: string
  sizeBytes: number
  musicId: number
}

interface Props {
  clientPath: string | null
  /** mapDetails from world index for cross-reference */
  mapDetails: Array<{ name: string; music?: number }> | null
  /** Currently playing file path (to show stop icon) */
  playingFile: string | null
  isPlaying: boolean
  onPlay: (filePath: string, trackName: string) => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const ClientMusicView: React.FC<Props> = ({
  clientPath,
  mapDetails,
  playingFile,
  isPlaying,
  onPlay
}) => {
  const [entries, setEntries] = useState<ClientEntry[]>([])
  const [scanned, setScanned] = useState(false)
  const [scanning, setScanning] = useState(false)

  // Build a lookup: musicId → map names
  const musicToMaps = React.useMemo(() => {
    const map = new Map<number, string[]>()
    if (!mapDetails) return map
    for (const md of mapDetails) {
      if (md.music == null) continue
      const existing = map.get(md.music) ?? []
      existing.push(md.name)
      map.set(md.music, existing)
    }
    return map
  }, [mapDetails])

  const handleScan = useCallback(async () => {
    if (!clientPath) return
    setScanning(true)
    try {
      const raw = await window.api.musicClientScan(clientPath)
      const parsed: ClientEntry[] = raw
        .map((e) => {
          const m = e.filename.match(/^(\d+)\.mus$/i)
          return m
            ? { filename: e.filename, sizeBytes: e.sizeBytes, musicId: parseInt(m[1], 10) }
            : null
        })
        .filter((e): e is ClientEntry => e !== null)
        .sort((a, b) => a.musicId - b.musicId)
      setEntries(parsed)
      setScanned(true)
    } finally {
      setScanning(false)
    }
  }, [clientPath])

  if (!clientPath) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="text.secondary">
          No Dark Ages client path configured. Set it in Settings.
        </Typography>
      </Box>
    )
  }

  if (!scanned) {
    return (
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Client music folder: <code>{clientPath}/music</code>
        </Typography>
        <Button
          variant="outlined"
          startIcon={<SyncIcon />}
          onClick={handleScan}
          disabled={scanning}
          sx={{ alignSelf: 'flex-start' }}
        >
          {scanning ? 'Scanning…' : 'Scan Client Music Folder'}
        </Button>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderBottom: '1px solid',
          borderColor: 'divider'
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {entries.length} tracks in <code>{clientPath}/music</code>
        </Typography>
        <Button size="small" startIcon={<SyncIcon />} onClick={handleScan} disabled={scanning}>
          Refresh
        </Button>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 40 }} />
              <TableCell sx={{ width: 80 }}>ID</TableCell>
              <TableCell sx={{ width: 100 }}>File</TableCell>
              <TableCell sx={{ width: 90 }}>Size</TableCell>
              <TableCell>Used by maps</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((e) => {
              const maps = musicToMaps.get(e.musicId) ?? []
              const filePath = `${clientPath}/music/${e.filename}`.replace(/\\/g, '/')
              const isThisPlaying = isPlaying && playingFile === filePath
              return (
                <TableRow key={e.filename} hover>
                  <TableCell sx={{ px: 0.5 }}>
                    <IconButton size="small" onClick={() => onPlay(filePath, `${e.musicId}.mus`)}>
                      {isThisPlaying ? (
                        <StopIcon fontSize="small" />
                      ) : (
                        <PlayArrowIcon fontSize="small" />
                      )}
                    </IconButton>
                  </TableCell>
                  <TableCell>{e.musicId}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{e.filename}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {formatBytes(e.sizeBytes)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {maps.length === 0 ? (
                      <Typography variant="caption" color="text.disabled">
                        —
                      </Typography>
                    ) : (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {maps.slice(0, 4).map((name) => (
                          <Chip key={name} label={name} size="small" variant="outlined" />
                        ))}
                        {maps.length > 4 && (
                          <Tooltip title={maps.slice(4).join(', ')}>
                            <Chip label={`+${maps.length - 4}`} size="small" />
                          </Tooltip>
                        )}
                      </Box>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Box>
    </Box>
  )
}

export default ClientMusicView
