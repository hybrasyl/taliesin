import React, { useState } from 'react'
import {
  Box, Typography, Select, MenuItem, FormControl, InputLabel,
  Button, Divider, Tooltip, IconButton, List, ListItem, ListItemText,
  Chip, Dialog, DialogTitle, DialogContent, DialogActions, TextField
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import HelpIcon from '@mui/icons-material/Help'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import { useRecoilState } from 'recoil'
import {
  themeState, clientPathState, librariesState, activeLibraryState,
  mapDirectoriesState, activeMapDirectoryState, ThemeName,
  type MapDirectory
} from '../recoil/atoms'
import AboutDialog from '../components/AboutDialog'

const THEMES: { value: ThemeName; label: string }[] = [
  { value: 'hybrasyl', label: 'Hybrasyl' },
  { value: 'chadul',   label: 'Chadul'   },
  { value: 'danaan',   label: 'Danaan'   },
  { value: 'grinneal', label: 'Grinneal' }
]

// ── Manage Libraries ─────────────────────────────────────────────────────────

function ManageLibraries() {
  const [libraries, setLibraries] = useRecoilState(librariesState)
  const [activeLibrary, setActiveLibrary] = useRecoilState(activeLibraryState)
  const [selected, setSelected] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const handleAdd = async () => {
    const dir = await window.api.openDirectory()
    if (!dir || libraries.includes(dir)) return
    const updated = [...libraries, dir]
    setLibraries(updated)
    if (!activeLibrary) setActiveLibrary(dir)
  }

  const handleRemoveConfirmed = () => {
    if (!selected) return
    const updated = libraries.filter((l) => l !== selected)
    setLibraries(updated)
    if (activeLibrary === selected) setActiveLibrary(updated[0] ?? null)
    setSelected(null)
    setConfirmOpen(false)
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ color: 'text.button', fontWeight: 'bold' }}>
          Manage Libraries
        </Typography>
        <Tooltip
          title="Add the world/xml root of your Hybrasyl repo. Maps XML is read from <library>/world/xml/maps, world maps from /worldmaps."
          placement="top"
        >
          <IconButton size="small" sx={{ ml: 1, color: 'text.button' }}>
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

      <List sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 0 }}>
        {libraries.length === 0 && (
          <ListItem>
            <ListItemText
              primary={
                <Typography variant="body2" color="text.secondary">No libraries added yet.</Typography>
              }
            />
          </ListItem>
        )}
        {libraries.map((lib) => (
          <ListItem
            key={lib}
            component="div"
            onClick={() => setSelected(lib)}
            selected={selected === lib}
            sx={{ cursor: 'pointer', '&.Mui-selected': { bgcolor: 'action.selected' } }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
              <Typography variant="body2" sx={{ flex: 1, color: 'text.button', wordBreak: 'break-all' }}>
                {lib}
              </Typography>
              {lib === activeLibrary && (
                <Chip label="Active" size="small" color="primary" icon={<CheckCircleIcon />} />
              )}
            </Box>
          </ListItem>
        ))}
      </List>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Remove Library</DialogTitle>
        <DialogContent>
          <Typography>Remove <strong>{selected}</strong>?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleRemoveConfirmed} color="error">Remove</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// ── Manage Map Directories ────────────────────────────────────────────────────

function ManageMapDirectories() {
  const [mapDirectories, setMapDirectories] = useRecoilState(mapDirectoriesState)
  const [activeMapDirectory, setActiveMapDirectory] = useRecoilState(activeMapDirectoryState)
  const [selected, setSelected] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Add dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [pendingPath, setPendingPath] = useState<string>('')
  const [pendingName, setPendingName] = useState<string>('')

  const handleAdd = async () => {
    const dir = await window.api.openDirectory()
    if (!dir || mapDirectories.some((d) => d.path === dir)) return
    // Pre-fill nickname with the folder name
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
        <Typography variant="h6" sx={{ color: 'text.button', fontWeight: 'bold' }}>
          Map Directories
        </Typography>
        <Tooltip title="Directories containing binary .map files. The active directory is used by the Map Catalog and editors." placement="top">
          <IconButton size="small" sx={{ ml: 1, color: 'text.button' }}>
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
                <Typography variant="body2" color="text.secondary">No directories added yet.</Typography>
              }
            />
          </ListItem>
        )}
        {mapDirectories.map((entry) => (
          <ListItem
            key={entry.path}
            component="div"
            onClick={() => setSelected(entry.path)}
            selected={selected === entry.path}
            sx={{ cursor: 'pointer', '&.Mui-selected': { bgcolor: 'action.selected' } }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
              <ListItemText
                primary={entry.name}
                secondary={entry.path}
                primaryTypographyProps={{ variant: 'body2', color: 'text.button', fontWeight: 500 }}
                secondaryTypographyProps={{ variant: 'caption', sx: { wordBreak: 'break-all' } }}
              />
              {entry.path === activeMapDirectory && (
                <Chip label="Active" size="small" color="primary" icon={<CheckCircleIcon />} sx={{ flexShrink: 0 }} />
              )}
            </Box>
          </ListItem>
        ))}
      </List>

      {/* Add dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Map Directory</DialogTitle>
        <DialogContent sx={{ pt: '16px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Nickname"
            size="small"
            fullWidth
            value={pendingName}
            onChange={(e) => setPendingName(e.target.value)}
            helperText="A short label to identify this map set"
            autoFocus
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
          <Button onClick={handleAddConfirmed} variant="contained">Add</Button>
        </DialogActions>
      </Dialog>

      {/* Remove confirm dialog */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Remove Directory</DialogTitle>
        <DialogContent>
          <Typography>Remove <strong>{selectedEntry?.name ?? selected}</strong>?</Typography>
          {selectedEntry && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
              {selectedEntry.path}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleRemoveConfirmed} color="error">Remove</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// ── Settings Page ─────────────────────────────────────────────────────────────

const SettingsPage: React.FC = () => {
  const [theme, setTheme] = useRecoilState(themeState)
  const [clientPath, setClientPath] = useRecoilState(clientPathState)
  const [aboutOpen, setAboutOpen] = useState(false)

  const handleBrowseClient = async () => {
    const dir = await window.api.openDirectory()
    if (dir) setClientPath(dir)
  }

  return (
    <Box sx={{ p: 3, maxWidth: 680 }}>
      <Typography variant="h4" gutterBottom sx={{ color: 'text.button', fontWeight: 'bold' }}>
        Settings
      </Typography>

      {/* Theme */}
      <FormControl size="small" sx={{ minWidth: 280, mb: 4 }}>
        <InputLabel>Theme</InputLabel>
        <Select value={theme} label="Theme" onChange={(e) => setTheme(e.target.value as ThemeName)}>
          {THEMES.map((t) => (
            <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <Divider sx={{ mb: 3 }} />

      {/* DA client path */}
      <Typography variant="h6" gutterBottom sx={{ color: 'text.button', fontWeight: 'bold' }}>
        Dark Ages Client
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Path to your Dark Ages install directory. Used to open .dat archives.
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 4 }}>
        <Box
          component="input"
          spellCheck={false}
          placeholder="e.g. C:\Program Files (x86)\Dark Ages"
          value={clientPath ?? ''}
          onChange={(e) => setClientPath((e.target as HTMLInputElement).value || null)}
          sx={{
            flex: 1, px: 1.5, py: '6px', fontSize: '0.875rem',
            bgcolor: 'background.paper', color: 'text.primary',
            border: '1px solid', borderColor: 'divider', borderRadius: 1,
            outline: 'none', fontFamily: 'inherit',
            '&:focus': { borderColor: 'primary.main' }
          }}
        />
        <Tooltip title="Browse...">
          <IconButton size="small" onClick={handleBrowseClient}>
            <FolderOpenIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Divider sx={{ mb: 3 }} />

      <ManageLibraries />

      <Divider sx={{ mt: 3, mb: 3 }} />

      <ManageMapDirectories />

      <Divider sx={{ mt: 3, mb: 3 }} />

      <Button variant="outlined" size="small" onClick={() => setAboutOpen(true)}>
        About Taliesin
      </Button>

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </Box>
  )
}

export default SettingsPage
