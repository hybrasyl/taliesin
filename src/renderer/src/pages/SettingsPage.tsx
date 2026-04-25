import React, { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Divider,
  Tooltip,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Alert,
  Tabs,
  Tab
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import HelpIcon from '@mui/icons-material/Help'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RefreshIcon from '@mui/icons-material/Refresh'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import LaunchIcon from '@mui/icons-material/Launch'
import { useRecoilState } from 'recoil'
import {
  themeState,
  clientPathState,
  librariesState,
  activeLibraryState,
  mapDirectoriesState,
  activeMapDirectoryState,
  musicLibraryPathState,
  musicWorkingDirsState,
  activeMusicWorkingDirState,
  ffmpegPathState,
  musEncodeKbpsState,
  musEncodeSampleRateState,
  packDirState,
  companionPathState,
  ThemeName,
  type MapDirectory
} from '../recoil/atoms'

const THEMES: { value: ThemeName; label: string }[] = [
  { value: 'hybrasyl', label: 'Hybrasyl' },
  { value: 'chadul', label: 'Chadul' },
  { value: 'danaan', label: 'Danaan' },
  { value: 'grinneal', label: 'Grinneal' }
]

// ── Shared path input ────────────────────────────────────────────────────────

function PathInput({
  value,
  onChange,
  placeholder,
  onBrowse
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  onBrowse: () => void
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box
        component="input"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        sx={{
          flex: 1,
          px: 1.5,
          py: '6px',
          fontSize: '0.875rem',
          bgcolor: 'background.paper',
          color: 'text.primary',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          outline: 'none',
          fontFamily: 'inherit',
          '&:focus': { borderColor: 'primary.main' }
        }}
      />
      <Tooltip title="Browse...">
        <IconButton size="small" onClick={onBrowse}>
          <FolderOpenIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  )
}

// ── Index status sub-component ───────────────────────────────────────────────

interface IndexStatusProps {
  status: { exists: boolean; builtAt?: string } | undefined
  building: boolean
  onBuild: () => void
}

function IndexStatus({ status, building, onBuild }: IndexStatusProps) {
  if (building) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={14} />
        <Typography variant="caption" color="text.secondary">
          Building...
        </Typography>
      </Box>
    )
  }
  if (!status) return null
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {status.exists ? (
        <>
          <Chip
            label={`Index built ${new Date(status.builtAt!).toLocaleDateString()}`}
            size="small"
            color="success"
            variant="outlined"
          />
          <Tooltip title="Rebuild index">
            <IconButton size="small" onClick={onBuild}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </>
      ) : (
        <>
          <Chip label="Index not built" size="small" color="warning" variant="outlined" />
          <Button size="small" variant="outlined" onClick={onBuild}>
            Build Index
          </Button>
        </>
      )}
    </Box>
  )
}

// ── Tab: General ─────────────────────────────────────────────────────────────

function GeneralTab() {
  const [theme, setTheme] = useRecoilState(themeState)
  const [clientPath, setClientPath] = useRecoilState(clientPathState)
  const [companionPath, setCompanionPath] = useRecoilState(companionPathState)
  return (
    <Box>
      {/* Theme */}
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>
        Theme
      </Typography>
      <FormControl size="small" sx={{ minWidth: 280, mb: 4, display: 'block', mt: 1 }}>
        <InputLabel>Theme</InputLabel>
        <Select value={theme} label="Theme" onChange={(e) => setTheme(e.target.value as ThemeName)}>
          {THEMES.map((t) => (
            <MenuItem key={t.value} value={t.value}>
              {t.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Divider sx={{ mb: 3 }} />

      {/* DA Client Path */}
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>
        Dark Ages Client
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, mt: 0.5 }}>
        Path to your Dark Ages install directory. Used to open .dat archives and load tile assets.
      </Typography>
      <Box sx={{ mb: 4 }}>
        <PathInput
          value={clientPath ?? ''}
          onChange={(v) => setClientPath(v || null)}
          placeholder="e.g. C:\Program Files (x86)\Dark Ages"
          onBrowse={async () => {
            const d = await window.api.openDirectory()
            if (d) setClientPath(d)
          }}
        />
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* Companion App Path */}
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>
        Companion App
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, mt: 0.5 }}>
        Path to the Creidhne executable. Enables the "Launch Creidhne" button on the Dashboard.
      </Typography>
      <Box sx={{ mb: 2 }}>
        <PathInput
          value={companionPath ?? ''}
          onChange={(v) => setCompanionPath(v || null)}
          placeholder="e.g. D:\tools\Creidhne.exe"
          onBrowse={async () => {
            const f = await window.api.openFile([{ name: 'Executable', extensions: ['exe'] }])
            if (f) setCompanionPath(f)
          }}
        />
      </Box>
      {companionPath && (
        <Button
          variant="outlined"
          size="small"
          startIcon={<LaunchIcon />}
          onClick={() => window.api.launchCompanion(companionPath)}
          sx={{ mb: 4 }}
        >
          Test Launch
        </Button>
      )}
    </Box>
  )
}

// ── Tab: Libraries ───────────────────────────────────────────────────────────

function LibrariesTab() {
  const [libraries, setLibraries] = useRecoilState(librariesState)
  const [activeLibrary, setActiveLibrary] = useRecoilState(activeLibraryState)
  const [selected, setSelected] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [indexStatuses, setIndexStatuses] = useState<
    Record<string, { exists: boolean; builtAt?: string }>
  >({})
  const [building, setBuilding] = useState<Record<string, boolean>>({})
  const [resolveError, setResolveError] = useState<string | null>(null)

  const loadStatuses = useCallback(async () => {
    const statuses: Record<string, { exists: boolean; builtAt?: string }> = {}
    for (const lib of libraries) {
      statuses[lib] = await window.api.indexStatus(lib)
    }
    setIndexStatuses(statuses)
  }, [libraries])

  useEffect(() => {
    loadStatuses()
  }, [loadStatuses])

  const handleAdd = async () => {
    setResolveError(null)
    const dir = await window.api.openDirectory()
    if (!dir) return
    const resolved = await window.api.libraryResolve(dir)
    if (!resolved) {
      setResolveError(
        `Could not find a valid Hybrasyl library at "${dir}". Select the repo root, world/, or world/xml/ folder.`
      )
      return
    }
    if (libraries.includes(resolved)) return
    const updated = [...libraries, resolved]
    setLibraries(updated)
    if (!activeLibrary) setActiveLibrary(resolved)
  }

  const handleBuildIndex = async (lib: string) => {
    setBuilding((prev) => ({ ...prev, [lib]: true }))
    try {
      const result = await window.api.indexBuild(lib)
      setIndexStatuses((prev) => ({ ...prev, [lib]: { exists: true, builtAt: result.builtAt } }))
    } finally {
      setBuilding((prev) => ({ ...prev, [lib]: false }))
    }
  }

  const handleRemoveConfirmed = async () => {
    if (!selected) return
    await window.api.indexDelete(selected)
    const updated = libraries.filter((l) => l !== selected)
    setLibraries(updated)
    if (activeLibrary === selected) setActiveLibrary(updated[0] ?? null)
    setSelected(null)
    setConfirmOpen(false)
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Typography variant="overline" sx={{ color: 'text.secondary' }}>
          Hybrasyl World Libraries
        </Typography>
        <Tooltip
          title="Add the world/xml directory of your Hybrasyl repo (e.g. C:\hybrasyl\world\xml). Each library shares an index with Creidhne at world/.creidhne/index.json."
          placement="top"
        >
          <IconButton size="small" sx={{ ml: 1 }}>
            <HelpIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
          Add Library
        </Button>
        <Tooltip title="Remove selected library">
          <span>
            <Button
              variant="contained"
              color="error"
              startIcon={<DeleteIcon />}
              disabled={!selected}
              onClick={() => setConfirmOpen(true)}
            >
              Remove
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Set selected library as active">
          <span>
            <Button
              variant="contained"
              color="success"
              disabled={!selected || selected === activeLibrary}
              onClick={() => selected && setActiveLibrary(selected)}
            >
              Set Active
            </Button>
          </span>
        </Tooltip>
      </Box>

      {resolveError && (
        <Alert severity="warning" onClose={() => setResolveError(null)} sx={{ mb: 1.5 }}>
          {resolveError}
        </Alert>
      )}

      <List sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 0 }}>
        {libraries.length === 0 && (
          <ListItem>
            <ListItemText
              primary={
                <Typography variant="body2" color="text.secondary">
                  No libraries added yet.
                </Typography>
              }
            />
          </ListItem>
        )}
        {libraries.map((lib) => (
          <ListItemButton
            key={lib}
            onClick={() => setSelected(lib)}
            selected={selected === lib}
            sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 1.5 }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
              <Typography
                variant="body2"
                sx={{ flex: 1, color: 'text.button', wordBreak: 'break-all' }}
              >
                {lib}
              </Typography>
              {lib === activeLibrary && (
                <Chip label="Active" size="small" color="primary" icon={<CheckCircleIcon />} />
              )}
            </Box>
            <Box sx={{ mt: 0.5 }}>
              <IndexStatus
                status={indexStatuses[lib]}
                building={building[lib] ?? false}
                onBuild={() => handleBuildIndex(lib)}
              />
            </Box>
          </ListItemButton>
        ))}
      </List>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Remove Library</DialogTitle>
        <DialogContent>
          <Typography>
            Remove <strong>{selected}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Its index file will also be deleted.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleRemoveConfirmed} color="error">
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// ── Tab: Map Directories ─────────────────────────────────────────────────────

function MapDirectoriesTab() {
  const [mapDirectories, setMapDirectories] = useRecoilState(mapDirectoriesState)
  const [activeMapDirectory, setActiveMapDirectory] = useRecoilState(activeMapDirectoryState)
  const [selected, setSelected] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [pendingPath, setPendingPath] = useState<string>('')
  const [pendingName, setPendingName] = useState<string>('')

  const handleAdd = async () => {
    const dir = await window.api.openDirectory()
    if (!dir || mapDirectories.some((d) => d.path === dir)) return
    const folderName = dir.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? dir
    setPendingPath(dir)
    setPendingName(folderName)
    setAddDialogOpen(true)
  }

  const handleAddConfirmed = () => {
    const entry: MapDirectory = { path: pendingPath, name: pendingName.trim() || pendingPath }
    const updated = [...mapDirectories, entry]
    setMapDirectories(updated)
    if (!activeMapDirectory) setActiveMapDirectory(pendingPath)
    setAddDialogOpen(false)
  }

  const handleRemoveConfirmed = () => {
    if (!selected) return
    const updated = mapDirectories.filter((d) => d.path !== selected)
    setMapDirectories(updated)
    if (activeMapDirectory === selected) setActiveMapDirectory(updated[0]?.path ?? null)
    setSelected(null)
    setConfirmOpen(false)
  }

  const selectedEntry = mapDirectories.find((d) => d.path === selected)

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Typography variant="overline" sx={{ color: 'text.secondary' }}>
          Binary .map File Directories
        </Typography>
        <Tooltip
          title="Directories containing binary .map files. Used by the Map Catalog to manage and import maps."
          placement="top"
        >
          <IconButton size="small" sx={{ ml: 1 }}>
            <HelpIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
          Add Directory
        </Button>
        <Tooltip title="Remove selected directory">
          <span>
            <Button
              variant="contained"
              color="error"
              startIcon={<DeleteIcon />}
              disabled={!selected}
              onClick={() => setConfirmOpen(true)}
            >
              Remove
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Set selected directory as active">
          <span>
            <Button
              variant="contained"
              color="success"
              disabled={!selected || selected === activeMapDirectory}
              onClick={() => selected && setActiveMapDirectory(selected)}
            >
              Set Active
            </Button>
          </span>
        </Tooltip>
      </Box>

      <List sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 0 }}>
        {mapDirectories.length === 0 && (
          <ListItem>
            <ListItemText
              primary={
                <Typography variant="body2" color="text.secondary">
                  No directories added yet.
                </Typography>
              }
            />
          </ListItem>
        )}
        {mapDirectories.map((entry) => (
          <ListItemButton
            key={entry.path}
            onClick={() => setSelected(entry.path)}
            selected={selected === entry.path}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
              <ListItemText
                primary={entry.name}
                secondary={entry.path}
                primaryTypographyProps={{ variant: 'body2', color: 'text.button', fontWeight: 500 }}
                secondaryTypographyProps={{ variant: 'caption', sx: { wordBreak: 'break-all' } }}
              />
              {entry.path === activeMapDirectory && (
                <Chip
                  label="Active"
                  size="small"
                  color="primary"
                  icon={<CheckCircleIcon />}
                  sx={{ flexShrink: 0 }}
                />
              )}
            </Box>
          </ListItemButton>
        ))}
      </List>

      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Map Directory</DialogTitle>
        <DialogContent
          sx={{ pt: '16px !important', display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          <TextField
            label="Nickname"
            size="small"
            fullWidth
            autoFocus
            value={pendingName}
            onChange={(e) => setPendingName(e.target.value)}
            helperText="A short label to identify this map set"
          />
          <TextField
            label="Path"
            size="small"
            fullWidth
            value={pendingPath}
            slotProps={{ input: { readOnly: true } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleAddConfirmed} variant="contained">
            Add
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Remove Directory</DialogTitle>
        <DialogContent>
          <Typography>
            Remove <strong>{selectedEntry?.name ?? selected}</strong>?
          </Typography>
          {selectedEntry && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
              {selectedEntry.path}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleRemoveConfirmed} color="error">
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// ── Tab: Music ───────────────────────────────────────────────────────────────

function MusicTab() {
  const [musicLibraryPath, setMusicLibraryPath] = useRecoilState(musicLibraryPathState)
  const [musicWorkingDirs, setMusicWorkingDirs] = useRecoilState(musicWorkingDirsState)
  const [activeMusicWorkingDir, setActiveMusicWorkingDir] = useRecoilState(
    activeMusicWorkingDirState
  )
  const [ffmpegPath, setFfmpegPath] = useRecoilState(ffmpegPathState)
  const [musEncodeKbps, setMusEncodeKbps] = useRecoilState(musEncodeKbpsState)
  const [musEncodeSampleRate, setMusEncodeSampleRate] = useRecoilState(musEncodeSampleRateState)
  const [selected, setSelected] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const handleAddWorkingDir = async () => {
    const dir = await window.api.openDirectory()
    if (!dir || musicWorkingDirs.includes(dir)) return
    const updated = [...musicWorkingDirs, dir]
    setMusicWorkingDirs(updated)
    if (!activeMusicWorkingDir) setActiveMusicWorkingDir(dir)
  }

  const handleRemoveConfirmed = () => {
    if (!selected) return
    const updated = musicWorkingDirs.filter((d) => d !== selected)
    setMusicWorkingDirs(updated)
    if (activeMusicWorkingDir === selected) setActiveMusicWorkingDir(updated[0] ?? null)
    setSelected(null)
    setConfirmOpen(false)
  }

  return (
    <Box>
      {/* Library path */}
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>
        Music Library
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, mt: 0.5 }}>
        Master source directory containing your audio files (.mp3, .ogg, .mus).
      </Typography>
      <Box sx={{ mb: 3 }}>
        <PathInput
          value={musicLibraryPath ?? ''}
          onChange={(v) => setMusicLibraryPath(v || null)}
          placeholder="e.g. D:\music-library"
          onBrowse={async () => {
            const d = await window.api.openDirectory()
            if (d) setMusicLibraryPath(d)
          }}
        />
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* ffmpeg path */}
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>
        ffmpeg Path
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, mt: 0.5 }}>
        Path to the ffmpeg binary. Leave blank to use system ffmpeg (must be on PATH). Required for
        converting .wav and .ogg files during pack deploy.
      </Typography>
      <Box sx={{ mb: 3 }}>
        <PathInput
          value={ffmpegPath ?? ''}
          onChange={(v) => setFfmpegPath(v || null)}
          placeholder="e.g. C:\tools\ffmpeg.exe  (blank = system ffmpeg)"
          onBrowse={async () => {
            const f = await window.api.openFile([{ name: 'Executable', extensions: ['exe', '*'] }])
            if (f) setFfmpegPath(f)
          }}
        />
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* Encode settings */}
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>
        .mus Encode Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, mt: 0.5 }}>
        Used when converting .wav/.ogg files during pack deploy. Defaults match original DA client
        files (22050 Hz, 64 kbps).
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Sample Rate</InputLabel>
          <Select
            value={musEncodeSampleRate}
            label="Sample Rate"
            onChange={(e) => setMusEncodeSampleRate(Number(e.target.value))}
          >
            <MenuItem value={22050}>22050 Hz (DA original)</MenuItem>
            <MenuItem value={44100}>44100 Hz (Hybrasyl)</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Bitrate</InputLabel>
          <Select
            value={musEncodeKbps}
            label="Bitrate"
            onChange={(e) => setMusEncodeKbps(Number(e.target.value))}
          >
            <MenuItem value={64}>64 kbps (DA original)</MenuItem>
            <MenuItem value={128}>128 kbps</MenuItem>
            <MenuItem value={192}>192 kbps</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* Working directories */}
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>
        Working Directories
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, mt: 0.5 }}>
        Output directories where packs are deployed as numbered <code>.mus</code> files.
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddWorkingDir}>
          Add Directory
        </Button>
        <Tooltip title="Remove selected directory">
          <span>
            <Button
              variant="contained"
              color="error"
              startIcon={<DeleteIcon />}
              disabled={!selected}
              onClick={() => setConfirmOpen(true)}
            >
              Remove
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Set selected directory as active">
          <span>
            <Button
              variant="contained"
              color="success"
              disabled={!selected || selected === activeMusicWorkingDir}
              onClick={() => selected && setActiveMusicWorkingDir(selected)}
            >
              Set Active
            </Button>
          </span>
        </Tooltip>
      </Box>

      <List sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 0 }}>
        {musicWorkingDirs.length === 0 && (
          <ListItem>
            <ListItemText
              primary={
                <Typography variant="body2" color="text.secondary">
                  No working directories added yet.
                </Typography>
              }
            />
          </ListItem>
        )}
        {musicWorkingDirs.map((dir) => (
          <ListItemButton key={dir} onClick={() => setSelected(dir)} selected={selected === dir}>
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
              <ListItemText
                primary={dir}
                primaryTypographyProps={{
                  variant: 'body2',
                  color: 'text.button',
                  sx: { wordBreak: 'break-all' }
                }}
              />
              {dir === activeMusicWorkingDir && (
                <Chip
                  label="Active"
                  size="small"
                  color="primary"
                  icon={<CheckCircleIcon />}
                  sx={{ flexShrink: 0 }}
                />
              )}
            </Box>
          </ListItemButton>
        ))}
      </List>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Remove Working Directory</DialogTitle>
        <DialogContent>
          <Typography>
            Remove <strong>{selected}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            The directory and its files are not deleted — only removed from Taliesin.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleRemoveConfirmed} color="error">
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// ── Tab: Asset Packs ─────────────────────────────────────────────────────────

function AssetPacksTab() {
  const [packDir, setPackDir] = useRecoilState(packDirState)

  return (
    <Box>
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>
        Asset Pack Working Directory
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, mt: 0.5 }}>
        Directory where .datf asset pack projects are stored. Each pack is a JSON project file with
        associated PNG assets.
      </Typography>
      <Box sx={{ mb: 2 }}>
        <PathInput
          value={packDir ?? ''}
          onChange={(v) => setPackDir(v || null)}
          placeholder="e.g. D:\asset-packs"
          onBrowse={async () => {
            const d = await window.api.openDirectory()
            if (d) setPackDir(d)
          }}
        />
      </Box>
      {!packDir && (
        <Alert severity="info" sx={{ mt: 1 }}>
          Set a working directory to enable the Asset Pack Manager.
        </Alert>
      )}
    </Box>
  )
}

// ── Settings Page ────────────────────────────────────────────────────────────

const TAB_LABELS = ['General', 'Libraries', 'Map Directories', 'Music', 'Asset Packs']

const SettingsPage: React.FC = () => {
  const [tab, setTab] = useState(0)

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 3, pt: 2 }}>
        <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold' }}>
          Settings
        </Typography>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          {TAB_LABELS.map((label) => (
            <Tab key={label} label={label} />
          ))}
        </Tabs>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 3, maxWidth: 680 }}>
        {tab === 0 && <GeneralTab />}
        {tab === 1 && <LibrariesTab />}
        {tab === 2 && <MapDirectoriesTab />}
        {tab === 3 && <MusicTab />}
        {tab === 4 && <AssetPacksTab />}
      </Box>
    </Box>
  )
}

export default SettingsPage
