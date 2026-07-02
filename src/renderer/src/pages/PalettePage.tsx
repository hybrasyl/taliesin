import React, { useCallback, useState } from 'react'
import { Box, Tabs, Tab } from '@mui/material'
import { useRecoilState, useSetRecoilState } from 'recoil'
import { packDirState, currentPageState } from '../recoil/atoms'
import PaletteManagerView from '../components/palette/PaletteManagerView'
import ColorizeView from '../components/palette/ColorizeView'
import BatchView from '../components/palette/BatchView'
import { useTransientStatus } from '../hooks/useTransientStatus'
import { StatusMessage } from '../components/shared/StatusMessage'
import { EmptyStateSettings } from '../components/shared/EmptyStateSettings'
import { WorkingDirToolbar } from '../components/shared/WorkingDirToolbar'

const PalettePage: React.FC = () => {
  const [packDir, setPackDir] = useRecoilState(packDirState)
  const setCurrentPage = useSetRecoilState(currentPageState)
  const [tab, setTab] = useState<'palettes' | 'colorize' | 'batch'>('palettes')
  const [statusMessage, showStatus] = useTransientStatus()

  const handleSetDir = useCallback(async () => {
    const dir = await window.api.openDirectory()
    if (dir) setPackDir(dir)
  }, [setPackDir])

  if (!packDir) {
    return (
      <EmptyStateSettings
        title="Palettes & Duotone"
        description="Palettes are stored inside the asset-pack working directory. Set one in Settings to continue."
        onOpenSettings={() => setCurrentPage('settings')}
      />
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WorkingDirToolbar dir={packDir} onChangeDir={handleSetDir}>
        <StatusMessage message={statusMessage} />
      </WorkingDirToolbar>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ borderBottom: '1px solid', borderColor: 'divider', px: 2 }}
      >
        <Tab value="palettes" label="Palettes" />
        <Tab value="colorize" label="Colorize" />
        <Tab value="batch" label="Batch" />
      </Tabs>

      <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <Box sx={{ display: tab === 'palettes' ? 'block' : 'none', height: '100%' }}>
          <PaletteManagerView packDir={packDir} onStatus={showStatus} />
        </Box>
        <Box sx={{ display: tab === 'colorize' ? 'block' : 'none', height: '100%' }}>
          <ColorizeView packDir={packDir} active={tab === 'colorize'} onStatus={showStatus} />
        </Box>
        <Box sx={{ display: tab === 'batch' ? 'block' : 'none', height: '100%' }}>
          <BatchView packDir={packDir} active={tab === 'batch'} onStatus={showStatus} />
        </Box>
      </Box>
    </Box>
  )
}

export default PalettePage
