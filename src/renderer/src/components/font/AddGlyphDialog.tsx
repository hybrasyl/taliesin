import React, { useMemo, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material'
import {
  UNICODE_BLOCKS,
  UnicodeBlock,
  codepointLabel,
  formatCodepoint,
  getBlock
} from '../../utils/unicodeBlocks'

interface Props {
  open: boolean
  startCodepoint: number
  glyphCount: number
  onClose: () => void
  onAppendBlank: () => void
  onPadToCodepoint: (codepoint: number) => void
}

const AddGlyphDialog: React.FC<Props> = ({
  open,
  startCodepoint,
  glyphCount,
  onClose,
  onAppendBlank,
  onPadToCodepoint
}) => {
  const endCodepoint = startCodepoint + glyphCount - 1 // last filled codepoint, or startCodepoint - 1 if empty
  const nextCodepoint = startCodepoint + glyphCount // next slot's codepoint if we just appended

  // Default block: whichever block the next codepoint falls in (or first block).
  const defaultBlock = useMemo<UnicodeBlock>(() => {
    const b = getBlock(nextCodepoint)
    if (b.start >= 0) return b
    return UNICODE_BLOCKS[0]
  }, [nextCodepoint])

  const [blockName, setBlockName] = useState<string>(defaultBlock.name)
  const block = UNICODE_BLOCKS.find((b) => b.name === blockName) ?? defaultBlock

  // Reset selected block when dialog opens with a fresh default.
  React.useEffect(() => {
    if (open) setBlockName(defaultBlock.name)
  }, [open, defaultBlock])

  const handlePick = (cp: number) => {
    onPadToCodepoint(cp)
    onClose()
  }

  const handleAppendBlank = () => {
    onAppendBlank()
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Add glyph</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Quick append a single blank glyph at the next codepoint
              {glyphCount > 0 ? ` (${formatCodepoint(nextCodepoint)})` : ''}.
            </Typography>
            <Button size="small" variant="outlined" onClick={handleAppendBlank}>
              Append blank glyph
            </Button>
          </Box>

          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Or pick a specific codepoint from a Unicode block. Filled slots are
              already in the font; missing slots will be created (padding any
              codepoints in between with blanks).
            </Typography>
            <TextField
              select
              size="small"
              label="Unicode block"
              value={blockName}
              onChange={(e) => setBlockName(e.target.value)}
              sx={{ minWidth: 260, mt: 1 }}
            >
              {UNICODE_BLOCKS.map((b) => (
                <MenuItem key={b.name} value={b.name}>
                  {b.name} ({formatCodepoint(b.start)}–{formatCodepoint(b.end)})
                </MenuItem>
              ))}
            </TextField>
          </Box>

          <BlockGrid
            block={block}
            startCodepoint={startCodepoint}
            endCodepoint={endCodepoint}
            glyphCount={glyphCount}
            onPick={handlePick}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  )
}

interface BlockGridProps {
  block: UnicodeBlock
  startCodepoint: number
  endCodepoint: number
  glyphCount: number
  onPick: (codepoint: number) => void
}

const BlockGrid: React.FC<BlockGridProps> = ({
  block,
  startCodepoint,
  endCodepoint,
  glyphCount,
  onPick
}) => {
  const cells = useMemo(() => {
    const out: { cp: number; filled: boolean; padCost: number }[] = []
    for (let cp = block.start; cp <= block.end; cp++) {
      const filled =
        glyphCount > 0 && cp >= startCodepoint && cp <= endCodepoint
      const padCost = !filled && cp > endCodepoint ? cp - (endCodepoint + 1) : 0
      out.push({ cp, filled, padCost })
    }
    return out
  }, [block, startCodepoint, endCodepoint, glyphCount])

  const filledCount = cells.filter((c) => c.filled).length
  const missingCount = cells.length - filledCount

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
        <Chip size="small" label={`${cells.length} codepoints`} />
        <Chip size="small" color="success" label={`${filledCount} filled`} />
        <Chip size="small" color="warning" label={`${missingCount} missing`} />
      </Stack>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))',
          gap: 0.5,
          maxHeight: 360,
          overflow: 'auto',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          p: 1
        }}
      >
        {cells.map(({ cp, filled, padCost }) => {
          const label = codepointLabel(cp)
          const tooltip = filled
            ? `${formatCodepoint(cp)} — already in font`
            : padCost > 0
              ? `${formatCodepoint(cp)} — adds ${padCost + 1} glyphs (${padCost} blanks + this one)`
              : `${formatCodepoint(cp)} — append at next slot`
          const labelFontSize = label.length > 1 ? 10 : 14
          return (
            <Box
              key={cp}
              title={tooltip}
              onClick={filled ? undefined : () => onPick(cp)}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 56,
                p: 0.5,
                border: '1px solid',
                borderColor: filled ? 'success.main' : 'divider',
                borderStyle: filled ? 'solid' : 'dashed',
                borderRadius: 1,
                bgcolor: filled ? 'action.disabledBackground' : 'background.paper',
                opacity: filled ? 0.6 : 1,
                cursor: filled ? 'default' : 'pointer',
                '&:hover': filled ? undefined : { bgcolor: 'action.hover' }
              }}
            >
              <Typography
                variant="caption"
                sx={{ fontFamily: 'monospace', fontSize: labelFontSize }}
              >
                {label || '·'}
              </Typography>
              <Typography variant="caption" sx={{ fontSize: 9, color: 'text.secondary' }}>
                {formatCodepoint(cp)}
              </Typography>
              {!filled && padCost > 0 && (
                <Typography variant="caption" sx={{ fontSize: 9, color: 'warning.main' }}>
                  +{padCost}
                </Typography>
              )}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

export default AddGlyphDialog
