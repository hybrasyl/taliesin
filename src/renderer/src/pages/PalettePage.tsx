import React, { useCallback, useState } from 'react'
import { Box, Typography, Button, IconButton, Tooltip, Tabs, Tab } from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import SettingsIcon from '@mui/icons-material/Settings'
import { useRecoilState, useSetRecoilState } from 'recoil'
import { packDirState, currentPageState } from '../recoil/atoms'
import PaletteManagerView from '../components/palette/PaletteManagerView'
import ColorizeView from '../components/palette/ColorizeView'

const PalettePage: React.FC = () => {
  const [packDir, setPackDir] = useRecoilState(packDirState)
  const setCurrentPage = useSetRecoilState(currentPageState)
  const [tab, setTab] = useState<'palettes' | 'colorize'>('palettes')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const showStatus = useCallback((msg: string) => {
    setStatusMessage(msg)
    setTimeout(() => setStatusMessage(null), 2500)
  }, [])

  const handleSetDir = useCallback(async () => {
    const dir = await window.api.openDirectory()
    if (dir) setPackDir(dir)
  }, [setPackDir])

  if (!packDir) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h5" gutterBottom sx={{ color: 'text.button', fontWeight: 'bold' }}>
          Palettes & Duotone
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Palettes are stored inside the asset-pack working directory. Set one in Settings to
          continue.
        </Typography>
        <Button
          variant="outlined"
          startIcon={<SettingsIcon />}
          onClick={() => setCurrentPage('settings')}
        >
          Open Settings
        </Button>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{
          px: 2,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          borderBottom: '1px solid',
          borderColor: 'divider'
        }}
      >
        <Tooltip title="Change working directory">
          <IconButton size="small" onClick={handleSetDir}>
            <FolderOpenIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1 }}>
          {packDir}
        </Typography>
        {statusMessage && (
          <Typography variant="caption" sx={{ color: 'success.light', fontWeight: 'bold' }}>
            {statusMessage}
          </Typography>
        )}
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ borderBottom: '1px solid', borderColor: 'divider', px: 2 }}
      >
        <Tab value="palettes" label="Palettes" />
        <Tab value="colorize" label="Colorize" />
      </Tabs>

      <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <Box sx={{ display: tab === 'palettes' ? 'block' : 'none', height: '100%' }}>
          <PaletteManagerView packDir={packDir} onStatus={showStatus} />
        </Box>
        <Box sx={{ display: tab === 'colorize' ? 'block' : 'none', height: '100%' }}>
          <ColorizeView packDir={packDir} active={tab === 'colorize'} onStatus={showStatus} />
        </Box>
      </Box>
    </Box>
  )
}

export default PalettePage
