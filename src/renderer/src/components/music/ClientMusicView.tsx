import React, { useState, useCallback, useMemo } from 'react'
import { formatBytes } from '../../utils/format'
import { parseFilename } from '../../hooks/useMusicLibrary'
import { useWorldIndex } from '../../hooks/useWorldIndex'
import { mapsByMusicId } from '../../utils/musicMapUsage'
import {
  Box,
  Typography,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton,
  Chip,
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

// The Maps column shows which active maps play each track (HTOO-358). The
// index carries a map's Music attribute since hybindex-ts 1.3.0 (HTOO-357).
// Two rules from HTOO-169: the column is hidden when the index has no music
// data, because an empty column reads as "no map plays this track"; and 0 is
// a music id, not "no music".

/** Chips shown in a Maps cell before the rest go into a "+N" tooltip. */
const MAX_MAP_CHIPS = 4

const MapsCell: React.FC<{ maps: string[] | undefined }> = ({ maps }) => {
  if (!maps || maps.length === 0) {
    return (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        None
      </Typography>
    )
  }
  const shown = maps.slice(0, MAX_MAP_CHIPS)
  const rest = maps.slice(MAX_MAP_CHIPS)
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {shown.map((name) => (
        <Chip key={name} label={name} size="small" />
      ))}
      {rest.length > 0 && (
        <Tooltip title={rest.join(', ')}>
          <Chip label={`+${rest.length}`} size="small" variant="outlined" />
        </Tooltip>
      )}
    </Box>
  )
}

interface Props {
  clientPath: string | null
  /** Currently playing file path (to show stop icon) */
  playingFile: string | null
  isPlaying: boolean
  onPlay: (filePath: string, trackName: string) => void
}

const ClientMusicView: React.FC<Props> = ({ clientPath, playingFile, isPlaying, onPlay }) => {
  const [entries, setEntries] = useState<ClientEntry[]>([])
  const [scanned, setScanned] = useState(false)
  const [scanning, setScanning] = useState(false)
  const { index } = useWorldIndex()
  // Built once per index load, not per row.
  const mapsByMusic = useMemo(() => mapsByMusicId(index?.mapDetails), [index])

  const handleScan = useCallback(async () => {
    if (!clientPath) return
    setScanning(true)
    try {
      const raw = await window.api.musicClientScan(clientPath)
      const parsed: ClientEntry[] = raw
        .map((e) => {
          const musicId = parseFilename(e.filename)
          return musicId !== null ? { filename: e.filename, sizeBytes: e.sizeBytes, musicId } : null
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
        <Typography
          sx={{
            color: 'text.secondary'
          }}
        >
          No Dark Ages client path configured. Set it in Settings.
        </Typography>
      </Box>
    )
  }

  if (!scanned) {
    return (
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography
          variant="body2"
          sx={{
            color: 'text.secondary'
          }}
        >
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
        <Typography
          variant="body2"
          sx={{
            color: 'text.secondary',
            flex: 1
          }}
        >
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
              <TableCell>Size</TableCell>
              {mapsByMusic && <TableCell>Maps</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((e) => {
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
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'text.secondary'
                      }}
                    >
                      {formatBytes(e.sizeBytes)}
                    </Typography>
                  </TableCell>
                  {mapsByMusic && (
                    <TableCell>
                      <MapsCell maps={mapsByMusic.get(e.musicId)} />
                    </TableCell>
                  )}
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
