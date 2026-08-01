import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  type SelectChangeEvent
} from '@mui/material'
import {
  LftFile,
  lftGlyphKeys,
  measureLftText,
  renderLftText,
  type DataArchive,
  type DataArchiveEntry
} from '@eriscorp/dalib-ts'
import { toImageData } from '@eriscorp/dalib-ts/helpers/imageData'
import { LftFontProvider } from './lftFontContext'
import LftGlyphGrid, { GLYPHS_PER_PAGE } from './LftGlyphGrid'
import LftGlyphInspector from './LftGlyphInspector'

/**
 * Browser for `.lft` bitmap fonts — the format the 7.41 client actually renders
 * text with. `da.lft` and `lod.lft` live in `national.dat`.
 *
 * Read-only: no confirmed LFT writer exists in the client, so Taliesin browses
 * the format and does not author it.
 */

const ZOOM_LEVELS = [2, 3, 4, 6]
const SAMPLE_ZOOM = 3
const DEFAULT_SAMPLE = 'Hybrasyl 0123'

/** Accept a key as decimal (`65`) or hex (`0x41`, `41h`, `$41`). */
function parseKeyInput(raw: string): number | null {
  const text = raw.trim().toLowerCase()
  if (!text) return null
  let value: number
  if (text.startsWith('0x') || text.startsWith('$')) {
    value = parseInt(text.replace(/^0x|^\$/, ''), 16)
  } else if (text.endsWith('h')) {
    value = parseInt(text.slice(0, -1), 16)
  } else {
    value = parseInt(text, 10)
  }
  if (isNaN(value) || value < 0 || value > 0xfffe) return null
  return value
}

const SampleText: React.FC<{ font: LftFile }> = ({ font }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [sample, setSample] = useState(DEFAULT_SAMPLE)

  const metrics = useMemo(() => {
    try {
      return measureLftText(font, lftGlyphKeys(sample))
    } catch {
      return null
    }
  }, [font, sample])

  const frame = useMemo(() => {
    if (!sample) return null
    try {
      return renderLftText(font, sample, { r: 255, g: 255, b: 255, a: 255 })
    } catch {
      return null
    }
  }, [font, sample])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !frame || frame.width === 0 || frame.height === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, frame.width, frame.height)
    ctx.putImageData(toImageData(frame), 0, 0)
  }, [frame])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flexShrink: 0 }}>
      <TextField
        size="small"
        label="Sample text"
        value={sample}
        onChange={(e) => setSample(e.target.value)}
        slotProps={{ htmlInput: { maxLength: 120 } }}
      />
      <Box
        sx={{
          p: 1,
          minHeight: 40,
          display: 'flex',
          alignItems: 'center',
          bgcolor: 'background.default',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          overflow: 'auto'
        }}
      >
        {frame && frame.width > 0 && frame.height > 0 ? (
          <canvas
            ref={canvasRef}
            width={frame.width}
            height={frame.height}
            style={{
              width: frame.width * SAMPLE_ZOOM,
              height: frame.height * SAMPLE_ZOOM,
              imageRendering: 'pixelated'
            }}
          />
        ) : (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Nothing to render.
          </Typography>
        )}
      </Box>
      {metrics && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          advance {metrics.advanceWidth} px · ink {metrics.ink.left},{metrics.ink.top} →{' '}
          {metrics.ink.right},{metrics.ink.bottom}
        </Typography>
      )}
    </Box>
  )
}

const LftPreview: React.FC<{ entry: DataArchiveEntry; archive: DataArchive }> = ({
  entry,
  archive
}) => {
  const [zoom, setZoom] = useState(4)
  const [page, setPage] = useState(0)
  const [selectedKey, setSelectedKey] = useState<number | null>(null)
  const [jump, setJump] = useState('')
  const [jumpError, setJumpError] = useState<string | null>(null)

  const parsed = useMemo(() => {
    try {
      const font = LftFile.fromBuffer(archive.getEntryBuffer(entry))
      // Most of the 65,535 records draw nothing. The populated list is what is
      // worth browsing, and computing it once keeps the grid off the key space.
      const populatedKeys: number[] = []
      for (let key = 0; key < font.glyphs.length; key++) {
        if ((font.glyphs[key]?.bitmapOffset ?? 0) !== 0) populatedKeys.push(key)
      }
      return { font, populatedKeys, error: null as string | null }
    } catch (err) {
      return {
        font: null,
        populatedKeys: [],
        error: err instanceof Error ? err.message : 'Could not read this font.'
      }
    }
  }, [entry, archive])

  // A different entry is a different font; start it from the top.
  useEffect(() => {
    setPage(0)
    setSelectedKey(null)
    setJump('')
    setJumpError(null)
  }, [entry])

  if (!parsed.font) {
    return (
      <Typography variant="caption" sx={{ color: 'error.main' }}>
        {parsed.error}
      </Typography>
    )
  }

  const { font, populatedKeys } = parsed

  const handleJump = (): void => {
    const key = parseKeyInput(jump)
    if (key === null) {
      setJumpError('Enter a key as 0x41 or 65.')
      return
    }
    const index = populatedKeys.indexOf(key)
    if (index === -1) {
      setJumpError('No glyph with a bitmap at that key.')
      return
    }
    setJumpError(null)
    setPage(Math.floor(index / GLYPHS_PER_PAGE))
    setSelectedKey(key)
  }

  return (
    <LftFontProvider value={{ font, populatedKeys }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minHeight: 0 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>
          Nominal cell {font.nominalWidth} × {font.nominalHeight} px · {populatedKeys.length} of{' '}
          {font.glyphs.length} records have a bitmap · keys are raw byte values, not Unicode
        </Typography>

        <SampleText font={font} />

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexShrink: 0 }}>
          <FormControl size="small" sx={{ minWidth: 96 }}>
            <InputLabel id="lft-zoom-label">Zoom</InputLabel>
            <Select
              labelId="lft-zoom-label"
              label="Zoom"
              value={zoom}
              onChange={(e: SelectChangeEvent<number>) => setZoom(Number(e.target.value))}
            >
              {ZOOM_LEVELS.map((level) => (
                <MenuItem key={level} value={level}>
                  {level}×
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="Jump to key"
            value={jump}
            error={jumpError !== null}
            helperText={jumpError ?? ' '}
            onChange={(e) => {
              setJump(e.target.value)
              setJumpError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleJump()
            }}
            onBlur={() => jump && handleJump()}
            sx={{ maxWidth: 160 }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}>
            <LftGlyphGrid
              page={page}
              zoom={zoom}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              onPageChange={setPage}
            />
          </Box>
          {selectedKey !== null && (
            <Box sx={{ flexShrink: 0, overflow: 'auto' }}>
              <LftGlyphInspector glyphKey={selectedKey} />
            </Box>
          )}
        </Box>
      </Box>
    </LftFontProvider>
  )
}

export default LftPreview
