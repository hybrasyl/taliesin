import React from 'react'
import { Box, TextField } from '@mui/material'

/**
 * The position of a placed thing, as two fields the author can type into.
 *
 * Every placement dialog used to show its coordinates as a caption in the title
 * and nothing more (HTOO-441). The value came from the click that opened the
 * dialog, and there was no way back: to move a node one tile the author deleted
 * it and placed it again, and lost every field already typed.
 *
 * The dialog does not own the value. The page holds it in its dialog state, and
 * writes the record only when the author confirms — so a cancelled edit leaves
 * the node where it was. `WorldMapEditorPanel` established that shape for world
 * map points (HTOO-412); this is the same shape for every kind.
 *
 * `noun` names what the coordinates address, because the two live side by side
 * in the warp dialog and are easy to confuse: a warp has a position on THIS map
 * and an arrival position on the destination map.
 */

export interface TilePositionFieldsProps {
  x: number
  y: number
  /** Inclusive upper bounds. */
  maxX: number
  maxY: number
  onChange: (x: number, y: number) => void
  /** What the pair addresses: 'Tile' on a map, 'Field' on a world map. */
  noun?: string
}

/** Keep a typed coordinate inside the field. */
export function clampCoord(raw: string, max: number): number | null {
  const n = parseInt(raw, 10)
  if (isNaN(n)) return null
  return Math.min(max, Math.max(0, n))
}

export default function TilePositionFields({
  x,
  y,
  maxX,
  maxY,
  onChange,
  noun = 'Tile'
}: TilePositionFieldsProps): React.ReactElement {
  return (
    <Box sx={{ display: 'flex', gap: 2 }}>
      <TextField
        label={`${noun} X`}
        size="small"
        fullWidth
        value={x}
        onChange={(e) => {
          const v = clampCoord(e.target.value, maxX)
          if (v !== null) onChange(v, y)
        }}
        helperText={`Where it sits, 0–${maxX}`}
        slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]*' } }}
      />
      <TextField
        label={`${noun} Y`}
        size="small"
        fullWidth
        value={y}
        onChange={(e) => {
          const v = clampCoord(e.target.value, maxY)
          if (v !== null) onChange(x, v)
        }}
        helperText={`Where it sits, 0–${maxY}`}
        slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]*' } }}
      />
    </Box>
  )
}
