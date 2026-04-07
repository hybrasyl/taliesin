import React from 'react'
import { ThemeProvider, CssBaseline, Box, Typography } from '@mui/material'
import { hybrasylTheme } from './themes'

export default function App(): React.ReactElement {
  return (
    <ThemeProvider theme={hybrasylTheme}>
      <CssBaseline />
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          bgcolor: 'background.default',
          color: 'text.primary'
        }}
      >
        <Typography variant="h4" sx={{ p: 2 }}>
          Taliesin
        </Typography>
      </Box>
    </ThemeProvider>
  )
}
