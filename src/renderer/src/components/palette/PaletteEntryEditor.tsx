import React from 'react'
import { Box, TextField, Typography, Slider, Stack, Checkbox } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { PaletteEntry } from '../../utils/paletteTypes'
import { PixelBuffer, parseHex } from '../../utils/duotone'
import DuotonePreview from './DuotonePreview'
import ColorSwatchPicker from './ColorSwatchPicker'

interface Props {
  entry: PaletteEntry
  preview: PixelBuffer | null
  onChange: (next: PaletteEntry) => void
  onDelete: () => void
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/

function normalizeHex(v: string): string {
  if (!v) return v
  const s = v.startsWith('#') ? v : `#${v}`
  return s.toUpperCase()
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0').toUpperCase()
  return `#${c(r)}${c(g)}${c(b)}`
}

function darkerShadowHex(shadowHex: string, darkFactor: number): string {
  if (!HEX_RE.test(shadowHex)) return '#000000'
  const { r, g, b } = parseHex(shadowHex)
  return rgbToHex(r * (1 - darkFactor), g * (1 - darkFactor), b * (1 - darkFactor))
}

function lighterHighlightHex(highlightHex: string, lightFactor: number): string {
  if (!HEX_RE.test(highlightHex)) return '#FFFFFF'
  const { r, g, b } = parseHex(highlightHex)
  return rgbToHex(
    r + (255 - r) * lightFactor,
    g + (255 - g) * lightFactor,
    b + (255 - b) * lightFactor,
  )
}

const PaletteEntryEditor: React.FC<Props> = ({ entry, preview, onChange, onDelete }) => {
  const darkFactor = entry.defaultDarkFactor ?? 0.3
  const lightFactor = entry.defaultLightFactor ?? 0.3

  const update = (patch: Partial<PaletteEntry>) => onChange({ ...entry, ...patch })

  const handleHex = (field: 'shadowColor' | 'highlightColor') => (value: string) => {
    const norm = normalizeHex(value)
    if (HEX_RE.test(norm)) update({ [field]: norm })
    else update({ [field]: value })
  }

  const hexValid = (hex: string) => HEX_RE.test(hex)

  const handleSwap = () => update({
    shadowColor: entry.highlightColor,
    highlightColor: entry.shadowColor,
  })

  const darkerShadow = darkerShadowHex(entry.shadowColor, darkFactor)
  const lighterHighlight = lighterHighlightHex(entry.highlightColor, lightFactor)
  const clampBlack = entry.defaultClampBlack ?? false
  const clampWhite = entry.defaultClampWhite ?? false

  return (
    <Box sx={{
      display: 'flex',
      gap: 2,
      alignItems: 'center',
      p: 1.5,
      borderBottom: '1px solid',
      borderColor: 'divider',
    }}>
      <DuotonePreview
        source={preview}
        entry={entry}
        params={{
          darkFactor,
          lightFactor,
          midpointLow: 0.25,
          midpointHigh: 0.75,
          clampBlack,
          clampWhite,
        }}
        size={72}
      />

      <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1}>
          <TextField
            label="ID"
            size="small"
            value={entry.id}
            onChange={e => update({ id: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
            sx={{ width: 120 }}
          />
          <TextField
            label="Name"
            size="small"
            value={entry.name}
            onChange={e => update({ name: e.target.value })}
            sx={{ flex: 1 }}
          />
          <TextField
            label="Category"
            size="small"
            value={entry.category ?? ''}
            onChange={e => update({ category: e.target.value || undefined })}
            sx={{ width: 140 }}
          />
        </Stack>

        <Stack direction="row" spacing={2} alignItems="center">
          <Stack direction="row" spacing={0.5} alignItems="center">
            <ColorSwatchPicker
              value={entry.shadowColor}
              fallback="#000000"
              onChange={v => update({ shadowColor: v })}
            />
            <TextField
              label="Shadow"
              size="small"
              value={entry.shadowColor}
              onChange={e => handleHex('shadowColor')(e.target.value)}
              error={!hexValid(entry.shadowColor)}
              sx={{ width: 110 }}
            />
          </Stack>

          <Tooltip title="Swap shadow and highlight">
            <IconButton size="small" onClick={handleSwap}><SwapHorizIcon fontSize="small" /></IconButton>
          </Tooltip>

          <Stack direction="row" spacing={0.5} alignItems="center">
            <ColorSwatchPicker
              value={entry.highlightColor}
              fallback="#FFFFFF"
              onChange={v => update({ highlightColor: v })}
            />
            <TextField
              label="Highlight"
              size="small"
              value={entry.highlightColor}
              onChange={e => handleHex('highlightColor')(e.target.value)}
              error={!hexValid(entry.highlightColor)}
              sx={{ width: 110 }}
            />
          </Stack>

          <Box sx={{ flex: 1, display: 'flex', gap: 2, minWidth: 260 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1 }}>
              <Tooltip title={`Darker shadow: ${darkerShadow}`}>
                <Box sx={{ width: 18, height: 18, borderRadius: 0.5, bgcolor: darkerShadow, border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
              </Tooltip>
              {clampBlack && (
                <Tooltip title="Pure black at luminance 0">
                  <Box sx={{ width: 18, height: 18, borderRadius: 0.5, bgcolor: '#000000', border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
                </Tooltip>
              )}
              <Tooltip title="Clamp pure black at luminance 0">
                <Checkbox
                  size="small"
                  checked={clampBlack}
                  onChange={e => update({ defaultClampBlack: e.target.checked || undefined })}
                  sx={{ p: 0.25 }}
                />
              </Tooltip>
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" color="text.secondary">Dark factor: {darkFactor.toFixed(2)}</Typography>
                <Slider
                  size="small"
                  min={0}
                  max={1}
                  step={0.05}
                  value={darkFactor}
                  onChange={(_, v) => update({ defaultDarkFactor: v as number })}
                />
              </Box>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1 }}>
              <Tooltip title={`Lighter highlight: ${lighterHighlight}`}>
                <Box sx={{ width: 18, height: 18, borderRadius: 0.5, bgcolor: lighterHighlight, border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
              </Tooltip>
              {clampWhite && (
                <Tooltip title="Pure white at luminance 1">
                  <Box sx={{ width: 18, height: 18, borderRadius: 0.5, bgcolor: '#FFFFFF', border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
                </Tooltip>
              )}
              <Tooltip title="Clamp pure white at luminance 1">
                <Checkbox
                  size="small"
                  checked={clampWhite}
                  onChange={e => update({ defaultClampWhite: e.target.checked || undefined })}
                  sx={{ p: 0.25 }}
                />
              </Tooltip>
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" color="text.secondary">Light factor: {lightFactor.toFixed(2)}</Typography>
                <Slider
                  size="small"
                  min={0}
                  max={1}
                  step={0.05}
                  value={lightFactor}
                  onChange={(_, v) => update({ defaultLightFactor: v as number })}
                />
              </Box>
            </Stack>
          </Box>
        </Stack>
      </Stack>

      <Tooltip title="Delete entry">
        <IconButton size="small" onClick={onDelete}><DeleteIcon fontSize="small" /></IconButton>
      </Tooltip>
    </Box>
  )
}

export default PaletteEntryEditor
