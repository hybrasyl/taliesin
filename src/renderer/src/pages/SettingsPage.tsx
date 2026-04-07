import React, { useState } from 'react'
import {
  Box, Typography, Select, MenuItem, FormControl, InputLabel,
  Button, TextField, Divider, Tooltip, IconButton
} from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import { useRecoilState } from 'recoil'
import { themeState, clientPathState, libraryPathState, ThemeName } from '../recoil/atoms'
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
  const [libraryPath, setLibraryPath] = useRecoilState(libraryPathState)
  const [aboutOpen, setAboutOpen] = useState(false)

  const handleBrowseClient = async () => {
    const dir = await window.api.openDirectory()
    if (dir) setClientPath(dir)
  }

  const handleBrowseLibrary = async () => {
    const dir = await window.api.openDirectory()
    if (dir) setLibraryPath(dir)
  }

  return (
    <Box sx={{ p: 3, maxWidth: 600 }}>
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="e.g. C:\Program Files (x86)\Dark Ages"
          value={clientPath ?? ''}
          onChange={(e) => setClientPath(e.target.value || null)}
          inputProps={{ spellCheck: false }}
        />
        <Tooltip title="Browse...">
          <IconButton size="small" onClick={handleBrowseClient}>
            <FolderOpenIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Hybrasyl library path */}
      <Typography variant="h6" gutterBottom>Hybrasyl Library</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Path to your Hybrasyl world/xml directory. Shared with Creidhne.
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 4 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="e.g. C:\hybrasyl\world\xml"
          value={libraryPath ?? ''}
          onChange={(e) => setLibraryPath(e.target.value || null)}
          inputProps={{ spellCheck: false }}
        />
        <Tooltip title="Browse...">
          <IconButton size="small" onClick={handleBrowseLibrary}>
            <FolderOpenIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Divider sx={{ mb: 3 }} />

      <Button variant="outlined" size="small" onClick={() => setAboutOpen(true)}>
        About Taliesin
      </Button>

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </Box>
  )
}

export default SettingsPage
