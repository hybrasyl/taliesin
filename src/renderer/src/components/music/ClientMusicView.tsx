import React, { useState, useCallback } from 'react'
import { formatBytes } from '../../utils/format'
import { parseFilename } from '../../hooks/useMusicLibrary'
import {
  Box,
  Typography,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import SyncIcon from '@mui/icons-material/Sync'

interface ClientEntry {
  filename: string
  sizeBytes: number
  musicId: number
}

// There is deliberately no "used by maps" cross-reference here. The world index
// carries no `music` field on mapDetails, so the lookup could only ever return
// nothing, and a permanently empty column reads as "no map uses this track"
// rather than "this is not implemented" — the two are indistinguishable to
// whoever is looking at it. Reinstating it is hybindex-ts work first: the map
// XML already has `music`, and the indexer has to project it into mapDetails.
// See HTOO-169; the column this replaced is in git history.
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
