import React from 'react'
import { AppBar, Box, Divider } from '@mui/material'
import TitleBar from './TitleBar'
import NavToolbar from './NavToolbar'

interface MainLayoutProps {
  children: React.ReactNode
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppBar
        position="static"
        sx={{
          WebkitAppRegion: 'drag',
          userSelect: 'none'
        }}
      >
        <TitleBar />
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.15)' }} />
        <NavToolbar />
      </AppBar>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {children}
      </Box>
    </Box>
  )
}

export default MainLayout
