import React from 'react'
import { Box, Stack, Typography } from '@mui/material'
import TuneIcon from '@mui/icons-material/Tune'
import { PixelBuffer } from '../../utils/duotone'
import { PaletteEntry, DuotoneParams, VariantDef } from '../../utils/paletteTypes'
import { variantToParams } from '../../utils/variants'
import DuotonePreview from './DuotonePreview'

interface Props {
  source: PixelBuffer | null
  entry: PaletteEntry
  variants: VariantDef[]
  selectedId: string | null
  customParams: DuotoneParams | null
  autoBestId: string | null
  tileSize?: number
  onSelectVariant: (id: string) => void
  onOpenCustom: () => void
}

const VariantGrid: React.FC<Props> = ({
  source, entry, variants, selectedId, customParams, autoBestId, tileSize = 64,
  onSelectVariant, onOpenCustom,
}) => {
  const renderTile = (
    key: string,
    label: string,
    params: DuotoneParams | null,
    isCustom: boolean,
    onClick: () => void,
  ) => {
    const selected = selectedId === key
    const isAuto = !isCustom && autoBestId === key
    return (
      <Box
        key={key}
        onClick={onClick}
        sx={{
          p: 0.5,
          borderRadius: 1,
          border: '2px solid',
          borderColor: selected ? 'secondary.light' : 'transparent',
          cursor: 'pointer',
          transition: 'border-color 0.15s, background-color 0.15s',
          '&:hover': { backgroundColor: 'rgba(255,255,255,0.05)' },
        }}
      >
        {isCustom && !params ? (
          <Box sx={{
            width: tileSize, height: tileSize,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px dashed rgba(255,255,255,0.25)', borderRadius: 0.5,
            color: 'text.secondary',
          }}>
            <TuneIcon fontSize="small" />
          </Box>
        ) : (
          <DuotonePreview source={source} entry={entry} params={params!} size={tileSize} />
        )}
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            textAlign: 'center',
            mt: 0.25,
            fontSize: '0.6rem',
            color: selected ? 'secondary.light' : 'text.secondary',
          }}
        >
          {label}
        </Typography>
        {isAuto && (
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              textAlign: 'center',
              fontSize: '0.55rem',
              fontWeight: 'bold',
              letterSpacing: '0.1em',
              color: 'secondary.light',
              lineHeight: 1,
            }}
          >
            AUTO
          </Typography>
        )}
      </Box>
    )
  }

  return (
    <Stack direction="row" spacing={0.5} sx={{ overflowX: 'auto' }}>
      {variants.map(v => renderTile(v.id, v.label, variantToParams(v), false, () => onSelectVariant(v.id)))}
      {renderTile('custom', 'Custom', customParams, true, onOpenCustom)}
    </Stack>
  )
}

export default VariantGrid
