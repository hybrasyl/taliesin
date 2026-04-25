import React, { useState } from 'react'
import {
  Box,
  Typography,
  Button,
  IconButton,
  Tooltip,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  TextField,
  Divider,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  MenuItem,
  Select,
  FormControl,
  InputLabel
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import type { MusicEntry } from '../../hooks/useMusicLibrary'

interface Props {
  packs: MusicPack[]
  selectedPack: MusicPack | null
  selectedPackId: string | null
  libraryEntries: MusicEntry[]
  metadata: Record<string, MusicMeta>
  musicWorkingDirs: string[]
  activeMusicWorkingDir: string | null
  onSelectPack: (id: string) => void
  onCreatePack: (name: string) => void
  onRenamePack: (id: string, name: string) => void
  onDeletePack: (id: string) => void
  onAddTrack: (packId: string, sourceFile: string, musicId: number) => void
  onRemoveTrack: (packId: string, sourceFile: string) => void
  onReorderTracks: (packId: string, tracks: MusicPackTrack[]) => void
  onUpdateTrackId: (packId: string, sourceFile: string, musicId: number) => void
  onDeploy: (packId: string, destDir: string) => Promise<void>
}

const PacksPanel: React.FC<Props> = ({
  packs,
  selectedPack,
  selectedPackId,
  libraryEntries,
  metadata,
  musicWorkingDirs,
  activeMusicWorkingDir,
  onSelectPack,
  onCreatePack,
  onRenamePack,
  onDeletePack,
  onAddTrack,
  onRemoveTrack,
  onReorderTracks,
  onUpdateTrackId,
  onDeploy
}) => {
  const [newPackName, setNewPackName] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameName, setRenameName] = useState('')
  const [deployOpen, setDeployOpen] = useState(false)
  const [deployDir, setDeployDir] = useState(activeMusicWorkingDir ?? '')
  const [deploying, setDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)

  // Tracks already in selected pack
  const usedFiles = new Set(selectedPack?.tracks.map((t) => t.sourceFile) ?? [])

  // Next suggested music ID
  const maxId = selectedPack?.tracks.reduce((m, t) => Math.max(m, t.musicId), 0) ?? 0
  const nextId = maxId + 1

  const handleCreate = () => {
    if (!newPackName.trim()) return
    onCreatePack(newPackName.trim())
    setNewPackName('')
    setCreateOpen(false)
  }

  const handleRenameOpen = () => {
    setRenameName(selectedPack?.name ?? '')
    setRenameOpen(true)
  }

  const handleRenameConfirm = () => {
    if (selectedPackId && renameName.trim()) {
      onRenamePack(selectedPackId, renameName.trim())
    }
    setRenameOpen(false)
  }

  const handleMoveTrack = (index: number, dir: -1 | 1) => {
    if (!selectedPack) return
    const tracks = [...selectedPack.tracks]
    const swapIdx = index + dir
    if (swapIdx < 0 || swapIdx >= tracks.length) return
    ;[tracks[index], tracks[swapIdx]] = [tracks[swapIdx], tracks[index]]
    onReorderTracks(selectedPack.id, tracks)
  }

  const handleDeploy = async () => {
    if (!selectedPackId || !deployDir) return
    setDeploying(true)
    setDeployError(null)
    try {
      await onDeploy(selectedPackId, deployDir)
      setDeployOpen(false)
    } catch (e) {
      setDeployError(String(e))
    } finally {
      setDeploying(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', height: '100%', gap: 0 }}>
      {/* Left: pack list */}
      <Box
        sx={{
          width: 220,
          flexShrink: 0,
          borderRight: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <Box sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle2" sx={{ flex: 1, color: 'text.button' }}>
            Packs
          </Typography>
          <Tooltip title="New pack">
            <IconButton size="small" onClick={() => setCreateOpen(true)}>
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Divider />
        <List dense sx={{ flex: 1, overflow: 'auto', p: 0 }}>
          {packs.length === 0 && (
            <ListItem>
              <ListItemText
                primary={
                  <Typography variant="caption" color="text.secondary">
                    No packs yet
                  </Typography>
                }
              />
            </ListItem>
          )}
          {packs.map((pack) => (
            <ListItemButton
              key={pack.id}
              onClick={() => onSelectPack(pack.id)}
              selected={pack.id === selectedPackId}
              sx={{ '&.Mui-selected': { bgcolor: 'action.selected' } }}
            >
              <ListItemText
                primary={pack.name}
                secondary={`${pack.tracks.length} track${pack.tracks.length !== 1 ? 's' : ''}`}
                primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                secondaryTypographyProps={{ variant: 'caption' }}
              />
            </ListItemButton>
          ))}
        </List>
      </Box>

      {/* Right: pack editor */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selectedPack ? (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography color="text.secondary">Select or create a pack</Typography>
          </Box>
        ) : (
          <>
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
                variant="subtitle1"
                sx={{ flex: 1, fontWeight: 'bold', color: 'text.button' }}
              >
                {selectedPack.name}
              </Typography>
              <Tooltip title="Rename pack">
                <IconButton size="small" onClick={handleRenameOpen}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete pack">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => onDeletePack(selectedPack.id)}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Button
                size="small"
                variant="contained"
                disabled={selectedPack.tracks.length === 0}
                onClick={() => {
                  setDeployDir(activeMusicWorkingDir ?? '')
                  setDeployOpen(true)
                }}
              >
                Deploy Pack
              </Button>
            </Box>

            {/* Track table */}
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 36 }}></TableCell>
                    <TableCell sx={{ width: 80 }}>ID</TableCell>
                    <TableCell>Source File</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell sx={{ width: 60 }}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedPack.tracks.map((track, idx) => {
                    const meta = metadata[track.sourceFile]
                    return (
                      <TableRow key={track.sourceFile} hover>
                        <TableCell sx={{ p: 0.5 }}>
                          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                            <IconButton
                              size="small"
                              disabled={idx === 0}
                              onClick={() => handleMoveTrack(idx, -1)}
                            >
                              <ArrowUpwardIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                            <IconButton
                              size="small"
                              disabled={idx === selectedPack.tracks.length - 1}
                              onClick={() => handleMoveTrack(idx, 1)}
                            >
                              <ArrowDownwardIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <TextField
                            size="small"
                            type="number"
                            value={track.musicId}
                            onChange={(e) =>
                              onUpdateTrackId(
                                selectedPack.id,
                                track.sourceFile,
                                parseInt(e.target.value) || 1
                              )
                            }
                            sx={{ width: 70 }}
                            slotProps={{ input: { inputProps: { min: 1 } } }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                            {track.sourceFile}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" noWrap color="text.secondary">
                            {meta?.name ?? ''}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => onRemoveTrack(selectedPack.id, track.sourceFile)}
                          >
                            <DeleteIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {selectedPack.tracks.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <Typography variant="caption" color="text.secondary">
                          No tracks. Select a track in the Library tab and use "Add to Pack".
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>

            {/* Add track from library */}
            <Box
              sx={{
                p: 1.5,
                borderTop: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                gap: 1,
                flexWrap: 'wrap'
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ width: '100%' }}>
                Add track from library:
              </Typography>
              {libraryEntries
                .filter((e) => !usedFiles.has(e.filename))
                .slice(0, 6)
                .map((e) => (
                  <Chip
                    key={e.filename}
                    label={metadata[e.filename]?.name || e.filename}
                    size="small"
                    variant="outlined"
                    onClick={() => onAddTrack(selectedPack.id, e.filename, nextId)}
                  />
                ))}
              {libraryEntries.filter((e) => !usedFiles.has(e.filename)).length > 6 && (
                <Typography variant="caption" color="text.secondary">
                  +{libraryEntries.filter((e) => !usedFiles.has(e.filename)).length - 6} more
                  (select in Library tab)
                </Typography>
              )}
            </Box>
          </>
        )}
      </Box>

      {/* Create pack dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New Pack</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <TextField
            autoFocus
            size="small"
            fullWidth
            label="Pack name"
            value={newPackName}
            onChange={(e) => setNewPackName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!newPackName.trim()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Rename Pack</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <TextField
            autoFocus
            size="small"
            fullWidth
            label="Pack name"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameConfirm()
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleRenameConfirm}>
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      {/* Deploy dialog */}
      <Dialog
        open={deployOpen}
        onClose={() => !deploying && setDeployOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Deploy Pack — {selectedPack?.name}</DialogTitle>
        <DialogContent
          sx={{ pt: '12px !important', display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          <Typography variant="body2" color="text.secondary">
            The destination directory will be <strong>fully cleared</strong> before deploying. All{' '}
            {selectedPack?.tracks.length} track{selectedPack?.tracks.length !== 1 ? 's' : ''} will
            be written as <code>N.mus</code> files.
          </Typography>

          {musicWorkingDirs.length > 0 ? (
            <FormControl size="small" fullWidth>
              <InputLabel>Working Directory</InputLabel>
              <Select
                value={deployDir}
                label="Working Directory"
                onChange={(e) => setDeployDir(e.target.value)}
              >
                {musicWorkingDirs.map((d) => (
                  <MenuItem key={d} value={d}>
                    {d}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <TextField
              size="small"
              fullWidth
              label="Destination directory"
              value={deployDir}
              onChange={(e) => setDeployDir(e.target.value)}
              helperText="No working directories configured. Enter a path manually or configure in Settings."
            />
          )}

          {deployError && (
            <Typography variant="caption" color="error">
              {deployError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeployOpen(false)} disabled={deploying}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={!deployDir || deploying}
            onClick={handleDeploy}
          >
            {deploying ? 'Deploying…' : 'Deploy & Overwrite'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default PacksPanel
