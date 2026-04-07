import React, { useState } from 'react'
import {
  Box, Typography, Select, MenuItem, FormControl, InputLabel,
  Button, Divider, Tooltip, IconButton, List, ListItem,
  ListItemIcon, ListItemText, Radio
} from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import DeleteIcon from '@mui/icons-material/Delete'
import { useRecoilState } from 'recoil'
import {
  themeState, clientPathState, librariesState, activeLibraryState,
  mapDirectoriesState, ThemeName
} from '../recoil/atoms'
import AboutDialog from '../components/AboutDialog'

const THEMES: { value: ThemeName; label: string }[] = [
  { value: 'hybrasyl', label: 'Hybrasyl' },
  { value: 'chadul',   label: 'Chadul'   },
  { value: 'danaan',   label: 'Danaan'   },
  { value: 'grinneal', label: 'Grinneal' }
]

const SettingsPage: React.FC = () => {
  const [theme, setTheme] = useRecoilState(themeState)
  const [clientPath, setClientPath] = useRecoilState(clientPathState)
  const [libraries, setLibraries] = useRecoilState(librariesState)
  const [activeLibrary, setActiveLibrary] = useRecoilState(activeLibraryState)
  const [mapDirectories, setMapDirectories] = useRecoilState(mapDirectoriesState)
  const [aboutOpen, setAboutOpen] = useState(false)

  const handleBrowseClient = async () => {
    const dir = await window.api.openDirectory()
    if (dir) setClientPath(dir)
  }

  const handleAddLibrary = async () => {
    const dir = await window.api.openDirectory()
    if (!dir || libraries.includes(dir)) return
    const updated = [...libraries, dir]
    setLibraries(updated)
    if (!activeLibrary) setActiveLibrary(dir)
  }

  const handleRemoveLibrary = (path: string) => {
    const updated = libraries.filter((l) => l !== path)
    setLibraries(updated)
    if (activeLibrary === path) setActiveLibrary(updated[0] ?? null)
  }

  const handleAddMapDir = async () => {
    const dir = await window.api.openDirectory()
    if (!dir || mapDirectories.includes(dir)) return
    setMapDirectories([...mapDirectories, dir])
  }

  const handleRemoveMapDir = (path: string) => {
    setMapDirectories(mapDirectories.filter((d) => d !== path))
  }

  return (
    <Box sx={{ p: 3, maxWidth: 640 }}>
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
      <Typography variant="h6" gutterBottom>Dark Ages Client</Typography>
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

      {/* Hybrasyl libraries */}
      <Typography variant="h6" gutterBottom>Hybrasyl Libraries</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Hybrasyl world library roots. The active library (radio) is used by the map and world map editors.
        XML is read from <code>&lt;library&gt;/world/xml/maps</code> and <code>/worldmaps</code>.
      </Typography>

      {libraries.length > 0 && (
        <List dense disablePadding sx={{ mb: 1 }}>
          {libraries.map((lib) => (
            <ListItem
              key={lib}
              disableGutters
              secondaryAction={
                <Tooltip title="Remove">
                  <IconButton size="small" edge="end" onClick={() => handleRemoveLibrary(lib)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              }
              sx={{ pr: 5 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <Radio
                  checked={activeLibrary === lib}
                  onChange={() => setActiveLibrary(lib)}
                  size="small"
                  sx={{ p: 0.5 }}
                />
              </ListItemIcon>
              <ListItemText
                primary={lib}
                primaryTypographyProps={{ variant: 'body2', noWrap: true, title: lib }}
              />
            </ListItem>
          ))}
        </List>
      )}

      <Button
        size="small"
        startIcon={<FolderOpenIcon fontSize="small" />}
        onClick={handleAddLibrary}
        sx={{ mb: 4 }}
      >
        Add Library
      </Button>

      <Divider sx={{ mb: 3 }} />

      {/* Map directories */}
      <Typography variant="h6" gutterBottom>Map Directories</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Directories containing binary .map files. The Map Catalog scans all of these.
      </Typography>

      {mapDirectories.length > 0 && (
        <List dense disablePadding sx={{ mb: 1 }}>
          {mapDirectories.map((dir) => (
            <ListItem
              key={dir}
              disableGutters
              secondaryAction={
                <Tooltip title="Remove">
                  <IconButton size="small" edge="end" onClick={() => handleRemoveMapDir(dir)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              }
              sx={{ pr: 5 }}
            >
              <ListItemText
                primary={dir}
                primaryTypographyProps={{ variant: 'body2', noWrap: true, title: dir }}
              />
            </ListItem>
          ))}
        </List>
      )}

      <Button
        size="small"
        startIcon={<FolderOpenIcon fontSize="small" />}
        onClick={handleAddMapDir}
        sx={{ mb: 4 }}
      >
        Add Directory
      </Button>

      <Divider sx={{ mb: 3 }} />

      <Button variant="outlined" size="small" onClick={() => setAboutOpen(true)}>
        About Taliesin
      </Button>

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </Box>
  )
}

export default SettingsPage
