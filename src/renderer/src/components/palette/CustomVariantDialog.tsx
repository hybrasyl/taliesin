import React, { useEffect, useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Box, Typography, Slider, Checkbox, FormControlLabel, Stack,
} from '@mui/material'
import { DuotoneParams, PaletteEntry } from '../../utils/paletteTypes'
import { PixelBuffer } from '../../utils/duotone'
import DuotonePreview from './DuotonePreview'

interface Props {
  open: boolean
  initial: DuotoneParams | null
  source: PixelBuffer | null
  entry: PaletteEntry
  frame?: PixelBuffer | null
  onClose: () => void
  onApply: (params: DuotoneParams) => void
}

const DEFAULT: DuotoneParams = {
  darkFactor: 0.3,
  lightFactor: 0.3,
  midpointLow: 0.25,
  midpointHigh: 0.75,
}

const CustomVariantDialog: React.FC<Props> = ({ open, initial, source, entry, frame, onClose, onApply }) => {
  const [params, setParams] = useState<DuotoneParams>(initial ?? DEFAULT)

  useEffect(() => {
    if (open) setParams(initial ?? DEFAULT)
  }, [open, initial])

  const update = (patch: Partial<DuotoneParams>) => setParams(prev => ({ ...prev, ...patch }))

  const handleMidpoints = (_: Event, value: number | number[]) => {
    if (!Array.isArray(value)) return
    const [lo, hi] = value
    update({ midpointLow: Math.min(lo, hi - 0.05), midpointHigh: Math.max(hi, lo + 0.05) })
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Custom Variant — {entry.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <DuotonePreview source={source} entry={entry} params={params} frame={frame} size={160} />
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary">Dark factor: {params.darkFactor.toFixed(2)}</Typography>
            <Slider size="small" min={0} max={1} step={0.01} value={params.darkFactor}
              onChange={(_, v) => update({ darkFactor: v as number })} />
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Light factor: {params.lightFactor.toFixed(2)}</Typography>
            <Slider size="small" min={0} max={1} step={0.01} value={params.lightFactor}
              onChange={(_, v) => update({ lightFactor: v as number })} />
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Midpoints: {params.midpointLow.toFixed(2)} – {params.midpointHigh.toFixed(2)}
            </Typography>
            <Slider size="small" min={0} max={1} step={0.01}
              value={[params.midpointLow, params.midpointHigh]}
              onChange={handleMidpoints}
              disableSwap
            />
          </Box>

          <Stack direction="row" spacing={2}>
            <FormControlLabel
              control={
                <Checkbox size="small" checked={!!params.clampBlack}
                  onChange={e => update({ clampBlack: e.target.checked || undefined })} />
              }
              label={<Typography variant="caption">Clamp pure black</Typography>}
            />
            <FormControlLabel
              control={
                <Checkbox size="small" checked={!!params.clampWhite}
                  onChange={e => update({ clampWhite: e.target.checked || undefined })} />
              }
              label={<Typography variant="caption">Clamp pure white</Typography>}
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => { onApply(params); onClose() }}>Apply</Button>
      </DialogActions>
    </Dialog>
  )
}

export default CustomVariantDialog
