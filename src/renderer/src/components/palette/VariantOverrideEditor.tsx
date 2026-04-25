import React from 'react'
import {
  Box,
  Button,
  IconButton,
  Stack,
  TextField,
  Typography,
  Slider,
  Tooltip
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import { VariantDef } from '../../utils/paletteTypes'
import { DEFAULT_VARIANTS } from '../../utils/variants'

interface Props {
  variants: VariantDef[] | undefined
  onChange: (next: VariantDef[] | undefined) => void
}

function blankVariant(index: number): VariantDef {
  return {
    id: `variant_${index + 1}`,
    label: `Variant ${index + 1}`,
    darkFactor: 0.3,
    lightFactor: 0.3,
    midpointLow: 0.25,
    midpointHigh: 0.75
  }
}

const VariantOverrideEditor: React.FC<Props> = ({ variants, onChange }) => {
  const customizing = variants !== undefined

  const startCustomizing = () => onChange(DEFAULT_VARIANTS.map((v) => ({ ...v })))
  const resetToDefaults = () => onChange(undefined)
  const addVariant = () => onChange([...(variants ?? []), blankVariant(variants?.length ?? 0)])
  const removeAt = (i: number) => {
    const next = (variants ?? []).slice()
    next.splice(i, 1)
    onChange(next)
  }
  const updateAt = (i: number, patch: Partial<VariantDef>) => {
    const next = (variants ?? []).slice()
    next[i] = { ...next[i], ...patch }
    onChange(next)
  }
  const setMidpoints = (i: number, value: number | number[]) => {
    if (!Array.isArray(value)) return
    const [lo, hi] = value
    updateAt(i, { midpointLow: Math.min(lo, hi - 0.05), midpointHigh: Math.max(hi, lo + 0.05) })
  }

  return (
    <Box sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
          Variants
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          {customizing
            ? `${variants!.length} custom variant${variants!.length === 1 ? '' : 's'} for this palette`
            : `Using ${DEFAULT_VARIANTS.length} default variants`}
        </Typography>
        {customizing ? (
          <Button
            size="small"
            variant="outlined"
            startIcon={<RestartAltIcon />}
            onClick={resetToDefaults}
          >
            Reset to Defaults
          </Button>
        ) : (
          <Button size="small" variant="outlined" onClick={startCustomizing}>
            Customize
          </Button>
        )}
      </Stack>

      {customizing && (
        <>
          {variants!.map((v, i) => (
            <Box
              key={i}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                py: 1,
                borderBottom: '1px solid',
                borderColor: 'divider'
              }}
            >
              <TextField
                label="ID"
                size="small"
                value={v.id}
                onChange={(e) =>
                  updateAt(i, { id: e.target.value.toLowerCase().replace(/\s+/g, '_') })
                }
                sx={{ width: 120 }}
              />
              <TextField
                label="Label"
                size="small"
                value={v.label}
                onChange={(e) => updateAt(i, { label: e.target.value })}
                sx={{ width: 140 }}
              />
              <Box sx={{ flex: 1, display: 'flex', gap: 2, minWidth: 360 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Dark: {v.darkFactor.toFixed(2)}
                  </Typography>
                  <Slider
                    size="small"
                    min={0}
                    max={1}
                    step={0.05}
                    value={v.darkFactor}
                    onChange={(_, val) => updateAt(i, { darkFactor: val as number })}
                  />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Light: {v.lightFactor.toFixed(2)}
                  </Typography>
                  <Slider
                    size="small"
                    min={0}
                    max={1}
                    step={0.05}
                    value={v.lightFactor}
                    onChange={(_, val) => updateAt(i, { lightFactor: val as number })}
                  />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Mids: {v.midpointLow.toFixed(2)}–{v.midpointHigh.toFixed(2)}
                  </Typography>
                  <Slider
                    size="small"
                    min={0}
                    max={1}
                    step={0.05}
                    value={[v.midpointLow, v.midpointHigh]}
                    onChange={(_, val) => setMidpoints(i, val)}
                    disableSwap
                  />
                </Box>
              </Box>
              <Tooltip title="Delete variant">
                <IconButton size="small" onClick={() => removeAt(i)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          ))}
          <Box sx={{ pt: 1 }}>
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addVariant}>
              Add Variant
            </Button>
          </Box>
        </>
      )}
    </Box>
  )
}

export default VariantOverrideEditor
