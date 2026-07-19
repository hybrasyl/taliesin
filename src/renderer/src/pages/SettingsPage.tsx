import React, { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Paper,
  Stack,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
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
  Link
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import HelpIcon from '@mui/icons-material/Help'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RefreshIcon from '@mui/icons-material/Refresh'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import LaunchIcon from '@mui/icons-material/Launch'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined'
import { useSettingsStore, type MapDirectory } from '../store/settingsStore'
import { useUiStore } from '../store/uiStore'
import ThemePicker from '../components/ThemePicker'
import AboutDialog from '../components/AboutDialog'

// Settings sections are Paper cards laid out in a responsive grid (mirrors the
// creidhne/oghma pattern). Full-height flex column so cards sharing a grid row
// match height.
const cardSx = { p: 3, display: 'flex', flexDirection: 'column', height: '100%' }
const cardHeadingSx = { color: 'text.button', fontWeight: 'bold' }
const cardDescSx = { color: 'text.secondary', mb: 2 }

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
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary'
          }}
        >
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

// ── Card: Appearance ─────────────────────────────────────────────────────────

function AppearanceCard() {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  return (
    <Paper sx={cardSx}>
      <Typography variant="h6" gutterBottom sx={cardHeadingSx}>
        Appearance
      </Typography>
      <Typography variant="body2" sx={cardDescSx}>
        Pick a theme. The four stylized themes get gamified window chrome; Mundanes and Dubhaimid
        are flat/corporate.
      </Typography>
      <ThemePicker value={theme} onChange={setTheme} />
    </Paper>
  )
}

// ── Card: Dark Ages Client ───────────────────────────────────────────────────

function DAClientCard() {
  const clientPath = useSettingsStore((s) => s.clientPath)
  const setClientPath = useSettingsStore((s) => s.setClientPath)
  return (
    <Paper sx={cardSx}>
      <Typography variant="h6" gutterBottom sx={cardHeadingSx}>
        Dark Ages Client
      </Typography>
      <Typography variant="body2" sx={cardDescSx}>
        Path to your Dark Ages install directory. Used to open .dat archives and load tile assets.
      </Typography>
      <PathInput
        value={clientPath ?? ''}
        onChange={(v) => setClientPath(v || null)}
        placeholder="e.g. C:\Program Files (x86)\Dark Ages"
        onBrowse={async () => {
          const d = await window.api.openDirectory()
          if (d) setClientPath(d)
        }}
      />
    </Paper>
  )
}

// ── Card: Installed Asset Packs (Brigid) ─────────────────────────────────────

function BrigidAssetsCard() {
  const brigidAssetsPath = useSettingsStore((s) => s.brigidAssetsPath)
  const setBrigidAssetsPath = useSettingsStore((s) => s.setBrigidAssetsPath)
  // On the hybrasyl theme the default (primary) link color reads poorly against
  // the paper; info is legible. Other themes keep the default.
  const theme = useSettingsStore((s) => s.theme)
  return (
    <Paper sx={cardSx}>
      <Typography variant="h6" gutterBottom sx={cardHeadingSx}>
        Installed Asset Packs
      </Typography>
      <Typography variant="body2" sx={cardDescSx}>
        Folder Brigid loads .datf packs from. Taliesin scans it to preview installed{' '}
        <em>static tiles</em> and <em>world map</em> overrides in the map editors.
      </Typography>
      <PathInput
        value={brigidAssetsPath ?? ''}
        onChange={(v) => setBrigidAssetsPath(v || null)}
        placeholder="e.g. %LOCALAPPDATA%\erisco\Brigid\assets"
        onBrowse={async () => {
          const d = await window.api.openDirectory()
          if (d) setBrigidAssetsPath(d)
        }}
      />
      <Link
        component="button"
        type="button"
        variant="body2"
        sx={{
          mt: 1,
          display: 'inline-block',
          alignSelf: 'flex-start',
          ...(theme === 'hybrasyl' && { color: 'info.main' })
        }}
        onClick={async () => {
          const suggested = await window.api.packSuggestedBrigidAssetsPath()
          if (suggested) setBrigidAssetsPath(suggested)
        }}
      >
        Use default location
      </Link>
    </Paper>
  )
}

// ── Card: Companion App ──────────────────────────────────────────────────────

function CompanionCard() {
  const companionPath = useSettingsStore((s) => s.companionPath)
  const setCompanionPath = useSettingsStore((s) => s.setCompanionPath)
  return (
    <Paper sx={cardSx}>
      <Typography variant="h6" gutterBottom sx={cardHeadingSx}>
        Companion App
      </Typography>
      <Typography variant="body2" sx={cardDescSx}>
        Path to the Creidhne executable. Enables the "Launch Creidhne" button on the Dashboard.
      </Typography>
      <PathInput
        value={companionPath ?? ''}
        onChange={(v) => setCompanionPath(v || null)}
        placeholder="e.g. D:\tools\Creidhne.exe"
        onBrowse={async () => {
          const f = await window.api.openFile([{ name: 'Executable', extensions: ['exe'] }])
          if (f) setCompanionPath(f)
        }}
      />
      {companionPath && (
        <Button
          variant="outlined"
          size="small"
          startIcon={<LaunchIcon />}
          onClick={() => window.api.launchCompanion(companionPath)}
          sx={{ mt: 2, alignSelf: 'flex-start' }}
        >
          Test Launch
        </Button>
      )}
    </Paper>
  )
}

// ── Card: About ──────────────────────────────────────────────────────────────

function AboutCard({ onOpen }: { onOpen: () => void }) {
  const [version, setVersion] = useState('')
  const setReportIssueOpen = useUiStore((s) => s.setReportIssueOpen)
  // On the hybrasyl theme the default (primary) link color reads poorly against
  // the paper; info is legible. Matches the Installed Asset Packs link.
  const theme = useSettingsStore((s) => s.theme)
  const linkColorSx = theme === 'hybrasyl' ? { color: 'info.main' } : {}

  useEffect(() => {
    void window.api.getAppVersion().then(setVersion)
  }, [])

  return (
    <Paper sx={cardSx}>
      <Typography variant="h6" gutterBottom sx={cardHeadingSx}>
        About
      </Typography>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2 }}>
        <Box
          component="img"
          src="./taliesin.png"
          alt=""
          aria-hidden
          sx={{ height: 48, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.55))' }}
        />
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            Taliesin
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Version {version || '…'} — a Dark Ages asset viewer and .datf authoring tool, companion
            to Creidhne.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
            <Link
              href="https://www.hybrasyl.com"
              target="_blank"
              rel="noopener noreferrer"
              variant="body2"
              sx={linkColorSx}
            >
              hybrasyl.com
            </Link>
            <Link
              href="https://github.com/hybrasyl"
              target="_blank"
              rel="noopener noreferrer"
              variant="body2"
              sx={linkColorSx}
            >
              GitHub
            </Link>
          </Box>
        </Box>
      </Stack>
      <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1.5 }}>
        <Button variant="outlined" startIcon={<InfoOutlinedIcon />} onClick={onOpen}>
          About Taliesin…
        </Button>
        <Button
          variant="outlined"
          startIcon={<BugReportOutlinedIcon />}
          onClick={() => setReportIssueOpen(true)}
        >
          Report an issue…
        </Button>
        <Button
          variant="text"
          startIcon={<FolderOpenIcon />}
          onClick={() => window.api.revealSettings()}
        >
          Reveal settings folder
        </Button>
        <Button
          variant="text"
          startIcon={<FolderOpenIcon />}
          onClick={() => window.api.revealLogs()}
        >
          Reveal logs folder
        </Button>
      </Stack>
    </Paper>
  )
}

// ── Card: Libraries ──────────────────────────────────────────────────────────

function LibrariesCard() {
  const libraries = useSettingsStore((s) => s.libraries)
  const setLibraries = useSettingsStore((s) => s.setLibraries)
  const activeLibrary = useSettingsStore((s) => s.activeLibrary)
  const setActiveLibrary = useSettingsStore((s) => s.setActiveLibrary)
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
    <Paper sx={cardSx}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={cardHeadingSx}>
          Hybrasyl World Libraries
        </Typography>
        <Tooltip
          title="Add the world/xml directory of your Hybrasyl repo (e.g. C:\hybrasyl\world\xml). Each library shares a rebuildable index cache with Creidhne, stored on this machine outside the world folder."
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
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary'
                  }}
                >
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
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
              mt: 1
            }}
          >
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
    </Paper>
  )
}

// ── Card: Map Directories ────────────────────────────────────────────────────

function MapDirectoriesCard() {
  const mapDirectories = useSettingsStore((s) => s.mapDirectories)
  const setMapDirectories = useSettingsStore((s) => s.setMapDirectories)
  const activeMapDirectory = useSettingsStore((s) => s.activeMapDirectory)
  const setActiveMapDirectory = useSettingsStore((s) => s.setActiveMapDirectory)
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
    <Paper sx={cardSx}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={cardHeadingSx}>
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
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary'
                  }}
                >
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
                slotProps={{
                  primary: { variant: 'body2', color: 'text.button', sx: { fontWeight: 500 } },
                  secondary: { variant: 'caption', sx: { wordBreak: 'break-all' } }
                }}
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
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                display: 'block',
                mt: 0.5
              }}
            >
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
    </Paper>
  )
}

// ── Card: Music Library ──────────────────────────────────────────────────────

function MusicLibraryCard() {
  const musicLibraryPath = useSettingsStore((s) => s.musicLibraryPath)
  const setMusicLibraryPath = useSettingsStore((s) => s.setMusicLibraryPath)
  return (
    <Paper sx={cardSx}>
      <Typography variant="h6" gutterBottom sx={cardHeadingSx}>
        Music Library
      </Typography>
      <Typography variant="body2" sx={cardDescSx}>
        Master source directory containing your audio files (.mp3, .ogg, .mus).
      </Typography>
      <PathInput
        value={musicLibraryPath ?? ''}
        onChange={(v) => setMusicLibraryPath(v || null)}
        placeholder="e.g. D:\music-library"
        onBrowse={async () => {
          const d = await window.api.openDirectory()
          if (d) setMusicLibraryPath(d)
        }}
      />
    </Paper>
  )
}

// ── Card: ffmpeg ─────────────────────────────────────────────────────────────

function FfmpegCard() {
  const ffmpegPath = useSettingsStore((s) => s.ffmpegPath)
  const setFfmpegPath = useSettingsStore((s) => s.setFfmpegPath)
  return (
    <Paper sx={cardSx}>
      <Typography variant="h6" gutterBottom sx={cardHeadingSx}>
        ffmpeg Path
      </Typography>
      <Typography variant="body2" sx={cardDescSx}>
        Path to the ffmpeg binary. Leave blank to use system ffmpeg (must be on PATH). Required for
        converting .wav and .ogg files during pack deploy.
      </Typography>
      <PathInput
        value={ffmpegPath ?? ''}
        onChange={(v) => setFfmpegPath(v || null)}
        placeholder="e.g. C:\tools\ffmpeg.exe  (blank = system ffmpeg)"
        onBrowse={async () => {
          const f = await window.api.openFile([{ name: 'Executable', extensions: ['exe', '*'] }])
          if (f) setFfmpegPath(f)
        }}
      />
    </Paper>
  )
}

// ── Card: .mus Encode Settings ───────────────────────────────────────────────

function MusEncodeCard() {
  const musEncodeKbps = useSettingsStore((s) => s.musEncodeKbps)
  const setMusEncodeKbps = useSettingsStore((s) => s.setMusEncodeKbps)
  const musEncodeSampleRate = useSettingsStore((s) => s.musEncodeSampleRate)
  const setMusEncodeSampleRate = useSettingsStore((s) => s.setMusEncodeSampleRate)
  return (
    <Paper sx={cardSx}>
      <Typography variant="h6" gutterBottom sx={cardHeadingSx}>
        .mus Encode Settings
      </Typography>
      <Typography variant="body2" sx={cardDescSx}>
        Used when converting .wav/.ogg files during pack deploy. Defaults match original DA client
        files (22050 Hz, 64 kbps).
      </Typography>
      <Box sx={{ display: 'flex', gap: 2 }}>
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
    </Paper>
  )
}

// ── Card: Music Working Directories ──────────────────────────────────────────

function MusicWorkingDirsCard() {
  const musicWorkingDirs = useSettingsStore((s) => s.musicWorkingDirs)
  const setMusicWorkingDirs = useSettingsStore((s) => s.setMusicWorkingDirs)
  const activeMusicWorkingDir = useSettingsStore((s) => s.activeMusicWorkingDir)
  const setActiveMusicWorkingDir = useSettingsStore((s) => s.setActiveMusicWorkingDir)
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
    <Paper sx={cardSx}>
      <Typography variant="h6" gutterBottom sx={cardHeadingSx}>
        Working Directories
      </Typography>
      <Typography variant="body2" sx={cardDescSx}>
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
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary'
                  }}
                >
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
                slotProps={{
                  primary: {
                    variant: 'body2',
                    color: 'text.button',
                    sx: { wordBreak: 'break-all' }
                  }
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
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
              mt: 1
            }}
          >
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
    </Paper>
  )
}

// ── Card: Asset Packs ────────────────────────────────────────────────────────

function AssetPacksCard() {
  const packDir = useSettingsStore((s) => s.packDir)
  const setPackDir = useSettingsStore((s) => s.setPackDir)

  return (
    <Paper sx={cardSx}>
      <Typography variant="h6" gutterBottom sx={cardHeadingSx}>
        Asset Pack Working Directory
      </Typography>
      <Typography variant="body2" sx={cardDescSx}>
        Directory where .datf asset pack projects are stored. Each pack is a JSON project file with
        associated PNG assets.
      </Typography>
      <PathInput
        value={packDir ?? ''}
        onChange={(v) => setPackDir(v || null)}
        placeholder="e.g. D:\asset-packs"
        onBrowse={async () => {
          const d = await window.api.openDirectory()
          if (d) setPackDir(d)
        }}
      />
      {!packDir && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Set a working directory to enable the Asset Pack Manager.
        </Alert>
      )}
    </Paper>
  )
}

// ── Settings Page ────────────────────────────────────────────────────────────

const SettingsPage: React.FC = () => {
  const [aboutOpen, setAboutOpen] = useState(false)

  return (
    <Box sx={{ height: '100%', overflow: 'auto', p: 3 }}>
      <Typography variant="h5" gutterBottom sx={{ ...cardHeadingSx, mb: 3 }}>
        Settings
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(680px, 1fr))',
          gap: 3,
          alignItems: 'stretch'
        }}
      >
        <AppearanceCard />
        <LibrariesCard />
        <DAClientCard />
        <BrigidAssetsCard />
        <CompanionCard />
        <MapDirectoriesCard />
        <MusicLibraryCard />
        <FfmpegCard />
        <MusEncodeCard />
        <MusicWorkingDirsCard />
        <AssetPacksCard />
        <AboutCard onOpen={() => setAboutOpen(true)} />
      </Box>
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </Box>
  )
}

export default SettingsPage
