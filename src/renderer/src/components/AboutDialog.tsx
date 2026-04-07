import React, { useEffect, useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Link,
  Box,
  Divider
} from '@mui/material'

interface Props {
  open: boolean
  onClose: () => void
}

const AboutDialog: React.FC<Props> = ({ open, onClose }) => {
  const [version, setVersion] = useState('')

  useEffect(() => {
    if (open) {
      window.api.getAppVersion().then(setVersion)
    }
  }, [open])

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase' }}>
        About Taliesin
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Version {version}
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <Link href="https://www.hybrasyl.com" target="_blank" rel="noopener noreferrer" variant="body2">
            hybrasyl.com
          </Link>
          <Link href="https://github.com/hybrasyl" target="_blank" rel="noopener noreferrer" variant="body2">
            GitHub
          </Link>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: '0.8rem', lineHeight: 1.7 }}>
          <Typography variant="body2" sx={{ fontFamily: 'inherit', fontWeight: 'bold', letterSpacing: 1 }}>
            NEW FROM ERISCO™
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: 'inherit', fontWeight: 'bold', fontSize: '1.1rem', mt: 1 }}>
            TALIESIN
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: 'inherit', fontStyle: 'italic', mb: 1 }}>
            MAPS, IN COLLABORATION WITH SANITY
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: 'inherit', mb: 2 }}>
            A BESPOKE, NEXT-GENERATION DARK AGES ASSET MANAGEMENT SOLUTION
          </Typography>

          {([
            ['FEATURES', ['Renders tiles', 'Reads archives', 'Was not supposed to work this well']],
            ['DELIVERABLES', [
              'Canvas-based map rendering at enterprise scale',
              'Cross-functional warp alignment',
              'Intent-driven NPC placement',
              'Vertical integration of "just open the .dat"',
            ]],
            ['INCLUDES', [
              'Direct contradiction of the 640x480 mindset',
              'Elimination of "we cannot read that format"',
              'Resolution of "the map is just a number"',
            ]],
            ['SIDE EFFECTS', [
              'Increased awareness of tile bleed',
              'Spontaneous archive browsing',
              'Uncontrollable urge to place reactors',
            ]],
          ] as [string, string[]][]).map(([heading, items]) => (
            <Box key={heading} sx={{ mb: 1.5 }}>
              <Typography variant="body2" sx={{ fontFamily: 'inherit', fontWeight: 'bold' }}>
                {heading}:
              </Typography>
              {items.map((item) => (
                <Typography key={item} variant="body2" sx={{ fontFamily: 'inherit', pl: 1 }}>
                  - {item}
                </Typography>
              ))}
            </Box>
          ))}

          <Box sx={{ mt: 2, borderTop: '1px solid', borderColor: 'divider', pt: 1.5 }}>
            <Typography variant="body2" sx={{ fontFamily: 'inherit', fontWeight: 'bold' }}>
              WARNING:
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'inherit' }}>
              Do not compare to the original map editor.
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'inherit' }}>
              This is how we got here.
            </Typography>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained" size="small">Close</Button>
      </DialogActions>
    </Dialog>
  )
}

export default AboutDialog
