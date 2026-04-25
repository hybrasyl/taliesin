import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  Typography,
  Select,
  MenuItem,
  IconButton,
  Tooltip,
  FormControl,
  InputLabel,
  type SelectChangeEvent
} from '@mui/material'
import MovieIcon from '@mui/icons-material/Movie'
import { useRecoilValue } from 'recoil'
import { ffmpegPathState } from '../../recoil/atoms'
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import StopIcon from '@mui/icons-material/Stop'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import {
  Palette,
  TilesetView,
  HeaFile,
  FntFile,
  ColorTable,
  renderTile,
  renderDarknessOverlay,
  type DataArchive,
  type DataArchiveEntry
} from '@eriscorp/dalib-ts'
import { toImageData } from '@eriscorp/dalib-ts/helpers/imageData'
import {
  renderEntry,
  renderPaletteGrid,
  classifyEntry,
  loadPaletteByName,
  getPaletteNames,
  formatBytes,
  decodePcx,
  parseBikHeader,
  type RenderedEntry
} from '../../utils/archiveRenderer'

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  entry: DataArchiveEntry
  archive: DataArchive
}

// ── Sprite preview ───────────────────────────────────────────────────────────

const SpritePreview: React.FC<{
  entry: DataArchiveEntry
  archive: DataArchive
}> = ({ entry, archive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [paletteNames, setPaletteNames] = useState<string[]>([])
  const [selectedPalette, setSelectedPalette] = useState<string>('')
  const [rendered, setRendered] = useState<RenderedEntry | null>(null)
  const [frameIndex, setFrameIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load palette names on archive change
  useEffect(() => {
    const names = getPaletteNames(archive)
    setPaletteNames(names)
    if (names.length > 0 && !selectedPalette) setSelectedPalette(names[0])
  }, [archive])

  // Render entry when it changes or palette changes
  useEffect(() => {
    setFrameIndex(0)
    setPlaying(false)
    setError(null)

    let palette: Palette | null = null
    if (selectedPalette) {
      palette = loadPaletteByName(archive, selectedPalette)
    }

    try {
      const result = renderEntry(entry, palette)
      setRendered(result)
      if (!result) setError('No palette selected or incompatible format.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Render failed')
      setRendered(null)
    }
  }, [entry, archive, selectedPalette])

  // Draw current frame to canvas
  useEffect(() => {
    if (!rendered || rendered.frames.length === 0 || !canvasRef.current) return
    const frame = rendered.frames[Math.min(frameIndex, rendered.frames.length - 1)]
    if (!frame) return
    const canvas = canvasRef.current
    canvas.width = frame.width
    canvas.height = frame.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.putImageData(toImageData(frame), 0, 0)
  }, [rendered, frameIndex])

  // Animation timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!playing || !rendered || rendered.frames.length <= 1) return

    const interval = rendered.frameIntervalMs ?? 100
    timerRef.current = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % rendered.frames.length)
    }, interval)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [playing, rendered])

  const handlePaletteChange = useCallback((e: SelectChangeEvent) => {
    setSelectedPalette(e.target.value)
  }, [])

  const totalFrames = rendered?.frames.length ?? 0
  const currentFrame = rendered?.frames[Math.min(frameIndex, totalFrames - 1)]
  const needsPalette = ['.epf', '.mpf', '.hpf'].includes(
    entry.entryName.toLowerCase().slice(entry.entryName.lastIndexOf('.'))
  )

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%' }}>
      {/* Palette picker */}
      {needsPalette && paletteNames.length > 0 && (
        <FormControl size="small" fullWidth>
          <InputLabel>Palette</InputLabel>
          <Select value={selectedPalette} label="Palette" onChange={handlePaletteChange}>
            {paletteNames.map((name) => (
              <MenuItem key={name} value={name}>
                {name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {error && (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      )}

      {/* Canvas */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'auto',
          bgcolor: 'background.default',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          minHeight: 100
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            imageRendering: 'pixelated',
            maxWidth: '100%',
            maxHeight: '100%'
          }}
        />
      </Box>

      {/* Frame info */}
      {currentFrame && (
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
          {currentFrame.width} × {currentFrame.height} px
          {rendered?.blendingType != null && ` · blend: ${rendered.blendingType}`}
          {rendered?.animation &&
            ` · walk: ${rendered.animation.walkFrameCount} · atk: ${rendered.animation.attackFrameCount}`}
        </Typography>
      )}

      {/* Frame navigation */}
      {totalFrames > 1 && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
          <Tooltip title="Previous frame">
            <IconButton
              size="small"
              disabled={frameIndex === 0 && !playing}
              onClick={() => {
                setPlaying(false)
                setFrameIndex((prev) => Math.max(0, prev - 1))
              }}
            >
              <NavigateBeforeIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Typography variant="caption" sx={{ minWidth: 80, textAlign: 'center' }}>
            Frame {frameIndex + 1} / {totalFrames}
          </Typography>

          <Tooltip title="Next frame">
            <IconButton
              size="small"
              disabled={frameIndex >= totalFrames - 1 && !playing}
              onClick={() => {
                setPlaying(false)
                setFrameIndex((prev) => Math.min(totalFrames - 1, prev + 1))
              }}
            >
              <NavigateNextIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title={playing ? 'Pause' : 'Play animation'}>
            <IconButton size="small" onClick={() => setPlaying((prev) => !prev)}>
              {playing ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  )
}

// ── Palette preview ──────────────────────────────────────────────────────────

const PalettePreview: React.FC<{ entry: DataArchiveEntry; archive: DataArchive }> = ({
  entry,
  archive
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    try {
      const buf = archive.getEntryBuffer(entry)
      const palette = Palette.fromBuffer(buf)
      const grid = renderPaletteGrid(palette, 14)
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = grid.width
      canvas.height = grid.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      // Checkerboard background for transparency
      for (let y = 0; y < grid.height; y += 14) {
        for (let x = 0; x < grid.width; x += 14) {
          ctx.fillStyle = (x / 14 + y / 14) % 2 ? '#2a2a2a' : '#3a3a3a'
          ctx.fillRect(x, y, 14, 14)
        }
      }
      ctx.putImageData(toImageData(grid), 0, 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to render palette')
    }
  }, [entry, archive])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      {error ? (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      ) : (
        <canvas
          ref={canvasRef}
          style={{ imageRendering: 'pixelated', border: '1px solid', borderRadius: 4 }}
        />
      )}
      <Typography variant="caption" color="text.secondary">
        256 colors (16×16)
      </Typography>
    </Box>
  )
}

// ── Text preview ─────────────────────────────────────────────────────────────

const TextPreview: React.FC<{ entry: DataArchiveEntry; archive: DataArchive }> = ({
  entry,
  archive
}) => {
  const { text, colorTable } = useMemo(() => {
    const buf = archive.getEntryBuffer(entry)
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buf)
    // Try parsing .tbl files as a ColorTable (dye table). If it has entries,
    // render the swatches above the raw text. Most .tbl files are not dye
    // tables and will return zero entries — those just show plain text.
    let colorTable: ColorTable | null = null
    if (entry.entryName.toLowerCase().endsWith('.tbl')) {
      try {
        const parsed = ColorTable.fromBuffer(buf)
        if (parsed.entries.length > 0) colorTable = parsed
      } catch {
        /* not a color table */
      }
    }
    return { text, colorTable }
  }, [entry, archive])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%' }}>
      {colorTable && <ColorTableSwatches table={colorTable} />}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 1,
          bgcolor: 'background.default',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          fontFamily: 'monospace',
          fontSize: '0.78rem',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all'
        }}
      >
        {text}
      </Box>
    </Box>
  )
}

const ColorTableSwatches: React.FC<{ table: ColorTable }> = ({ table }) => {
  return (
    <Box
      sx={{
        flexShrink: 0,
        p: 1,
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        maxHeight: '40%',
        overflow: 'auto'
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        ColorTable · {table.entries.length} {table.entries.length === 1 ? 'entry' : 'entries'}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        {table.entries.map((entry, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              variant="caption"
              sx={{ fontFamily: 'monospace', minWidth: 32, color: 'text.secondary' }}
            >
              #{entry.colorIndex}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.25 }}>
              {entry.colors.map((c, j) => (
                <Box
                  key={j}
                  sx={{
                    width: 16,
                    height: 16,
                    bgcolor: `rgb(${c.r}, ${c.g}, ${c.b})`,
                    border: '1px solid',
                    borderColor: 'divider'
                  }}
                />
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

// ── Audio preview ────────────────────────────────────────────────────────────

const AudioPreview: React.FC<{ entry: DataArchiveEntry; archive: DataArchive }> = ({
  entry,
  archive
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobUrlRef = useRef<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [])

  // Reset on entry change
  useEffect(() => {
    audioRef.current?.pause()
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    blobUrlRef.current = null
    setPlaying(false)
    setError(null)
  }, [entry])

  const handleToggle = useCallback(async () => {
    if (playing) {
      audioRef.current?.pause()
      setPlaying(false)
      return
    }

    setError(null)
    try {
      const buf = archive.getEntryBuffer(entry)
      const extension = entry.entryName.toLowerCase().slice(entry.entryName.lastIndexOf('.'))
      const mime =
        extension === '.wav' ? 'audio/wav' : extension === '.ogg' ? 'audio/ogg' : 'audio/mpeg'
      const blob = new Blob([new Uint8Array(buf)], { type: mime })
      const url = URL.createObjectURL(blob)

      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = url

      if (!audioRef.current) audioRef.current = new Audio()
      audioRef.current.src = url
      audioRef.current.onended = () => setPlaying(false)
      audioRef.current.onerror = () => {
        setPlaying(false)
        setError('Playback failed')
      }
      await audioRef.current.play()
      setPlaying(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to play audio')
    }
  }, [entry, archive, playing])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, pt: 4 }}>
      <Typography variant="body2" color="text.secondary">
        {entry.entryName}
      </Typography>
      <IconButton
        size="large"
        onClick={handleToggle}
        sx={{
          border: '2px solid',
          borderColor: 'divider',
          p: 3,
          color: playing ? 'secondary.light' : 'text.primary'
        }}
      >
        {playing ? <StopIcon sx={{ fontSize: 48 }} /> : <PlayArrowIcon sx={{ fontSize: 48 }} />}
      </IconButton>
      <Typography variant="caption" color="text.secondary">
        {playing ? 'Playing…' : 'Click to play'}
      </Typography>
      {error && (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      )}
    </Box>
  )
}

// ── Tileset preview (DA .bmp = headerless palettized tile blocks) ────────────

const TILES_PER_PAGE = 256
const TILE_PIXEL_WIDTH = 56
const TILE_PIXEL_HEIGHT = 27

const TilesetPreview: React.FC<{ entry: DataArchiveEntry; archive: DataArchive }> = ({
  entry,
  archive
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [paletteNames, setPaletteNames] = useState<string[]>([])
  const [selectedPalette, setSelectedPalette] = useState<string>('')
  const [page, setPage] = useState(0)
  const [tileCount, setTileCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const names = getPaletteNames(archive)
    setPaletteNames(names)
    if (names.length > 0) setSelectedPalette((prev) => prev || names[0])
    setPage(0)
  }, [archive])

  useEffect(() => {
    setError(null)
    if (!selectedPalette) return
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const palette = loadPaletteByName(archive, selectedPalette)
      if (!palette) {
        setError('Palette not found')
        return
      }
      const view = TilesetView.fromEntry(entry)
      setTileCount(view.count)
      const startTile = page * TILES_PER_PAGE
      const endTile = Math.min(view.count, startTile + TILES_PER_PAGE)
      const cols = 16
      const rows = Math.ceil((endTile - startTile) / cols)
      canvas.width = cols * TILE_PIXEL_WIDTH
      canvas.height = rows * TILE_PIXEL_HEIGHT
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (let i = startTile; i < endTile; i++) {
        const tile = view.get(i)
        const frame = renderTile(tile, palette)
        const col = (i - startTile) % cols
        const row = Math.floor((i - startTile) / cols)
        ctx.putImageData(toImageData(frame), col * TILE_PIXEL_WIDTH, row * TILE_PIXEL_HEIGHT)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to render tileset')
    }
  }, [entry, archive, selectedPalette, page])

  const totalPages = Math.max(1, Math.ceil(tileCount / TILES_PER_PAGE))

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%' }}>
      {paletteNames.length > 0 && (
        <FormControl size="small" fullWidth>
          <InputLabel>Palette</InputLabel>
          <Select
            value={selectedPalette}
            label="Palette"
            onChange={(e: SelectChangeEvent) => setSelectedPalette(e.target.value)}
          >
            {paletteNames.map((name) => (
              <MenuItem key={name} value={name}>
                {name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {error && (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      )}

      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          bgcolor: 'background.default',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          p: 1
        }}
      >
        <canvas ref={canvasRef} style={{ imageRendering: 'pixelated', display: 'block' }} />
      </Box>

      {tileCount > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
          <Tooltip title="Previous page">
            <IconButton
              size="small"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <NavigateBeforeIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Typography variant="caption" sx={{ minWidth: 160, textAlign: 'center' }}>
            Tiles {page * TILES_PER_PAGE + 1}–{Math.min(tileCount, (page + 1) * TILES_PER_PAGE)} of{' '}
            {tileCount}
          </Typography>
          <Tooltip title="Next page">
            <IconButton
              size="small"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              <NavigateNextIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  )
}

// ── PCX preview (custom 8bpp paletted decoder) ───────────────────────────────

const PcxPreview: React.FC<{ entry: DataArchiveEntry; archive: DataArchive }> = ({
  entry,
  archive
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [info, setInfo] = useState<{ w: number; h: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    setInfo(null)
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const buf = archive.getEntryBuffer(entry)
      const decoded = decodePcx(buf)
      if (!decoded) {
        setError('Unsupported PCX variant (only 8bpp paletted is supported)')
        return
      }
      canvas.width = decoded.width
      canvas.height = decoded.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const imgData = ctx.createImageData(decoded.width, decoded.height)
      imgData.data.set(decoded.rgba)
      ctx.putImageData(imgData, 0, 0)
      setInfo({ w: decoded.width, h: decoded.height })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to decode PCX')
    }
  }, [entry, archive])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%' }}>
      {error && (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      )}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ imageRendering: 'pixelated', maxWidth: '100%', maxHeight: '100%' }}
        />
      </Box>
      {info && (
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
          {info.w} × {info.h} px · 8bpp
        </Typography>
      )}
    </Box>
  )
}

// ── Darkness overlay preview (.hea) ──────────────────────────────────────────

const DarknessPreview: React.FC<{ entry: DataArchiveEntry; archive: DataArchive }> = ({
  entry,
  archive
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [info, setInfo] = useState<{ w: number; h: number; layers: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    setInfo(null)
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const buf = archive.getEntryBuffer(entry)
      const hea = HeaFile.fromBuffer(buf)
      const frame = renderDarknessOverlay(hea, 220)
      canvas.width = frame.width
      canvas.height = frame.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      // Light grid background to make transparent (lit) pixels visible.
      ctx.fillStyle = '#3a3a3a'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.putImageData(toImageData(frame), 0, 0)
      setInfo({ w: frame.width, h: frame.height, layers: hea.layerCount })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to decode HEA')
    }
    void archive
    void entry
  }, [entry, archive])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%' }}>
      {error && (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      )}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          p: 1
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ imageRendering: 'pixelated', maxWidth: '100%', maxHeight: '100%' }}
        />
      </Box>
      {info && (
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
          {info.w} × {info.h} px · {info.layers} layer{info.layers === 1 ? '' : 's'} · darker = less
          light
        </Typography>
      )}
    </Box>
  )
}

// ── Font preview (.fnt: 8×12 English or 16×12 Korean glyph cells) ────────────

const FONT_SIZES = [
  { label: 'English (8 × 12)', w: 8, h: 12 },
  { label: 'Korean (16 × 12)', w: 16, h: 12 }
]

const FontPreview: React.FC<{ entry: DataArchiveEntry; archive: DataArchive }> = ({
  entry,
  archive
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [sizeIdx, setSizeIdx] = useState(0)
  const [info, setInfo] = useState<{ glyphs: number; w: number; h: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    setInfo(null)
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const { w: gw, h: gh } = FONT_SIZES[sizeIdx]
      const buf = archive.getEntryBuffer(entry)
      const fnt = FntFile.fromBuffer(buf, gw, gh)
      const cols = 16
      const rows = Math.ceil(fnt.glyphCount / cols)
      canvas.width = cols * gw
      canvas.height = rows * gh
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = img.data
      for (let g = 0; g < fnt.glyphCount; g++) {
        const col = g % cols,
          row = Math.floor(g / cols)
        const glyph = fnt.getGlyphData(g)
        for (let y = 0; y < gh; y++) {
          for (let x = 0; x < gw; x++) {
            const byteIdx = y * fnt.bytesPerRow + (x >> 3)
            // MSB-first: bit 7 is the leftmost pixel of each byte. (dalib-ts
            // docs say LSB-first, but visual output confirms otherwise.)
            const bit = (glyph[byteIdx] >> (7 - (x & 7))) & 1
            if (!bit) continue
            const px = (row * gh + y) * canvas.width + (col * gw + x)
            const off = px * 4
            data[off] = 255
            data[off + 1] = 255
            data[off + 2] = 255
            data[off + 3] = 255
          }
        }
      }
      ctx.putImageData(img, 0, 0)
      setInfo({ glyphs: fnt.glyphCount, w: gw, h: gh })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to decode FNT')
    }
  }, [entry, archive, sizeIdx])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%' }}>
      <FormControl size="small" fullWidth>
        <InputLabel>Glyph size</InputLabel>
        <Select
          value={String(sizeIdx)}
          label="Glyph size"
          onChange={(e: SelectChangeEvent) => setSizeIdx(parseInt(e.target.value, 10))}
        >
          {FONT_SIZES.map((s, i) => (
            <MenuItem key={i} value={String(i)}>
              {s.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {error && (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      )}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          p: 1
        }}
      >
        <canvas ref={canvasRef} style={{ imageRendering: 'pixelated' }} />
      </Box>
      {info && (
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
          {info.glyphs} glyphs · {info.w} × {info.h} px each
        </Typography>
      )}
    </Box>
  )
}

// ── JPF preview (4-byte "JPF\0" prefix + standard JPEG) ──────────────────────

const JpfPreview: React.FC<{ entry: DataArchiveEntry; archive: DataArchive }> = ({
  entry,
  archive
}) => {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    let url: string | null = null
    try {
      const buf = archive.getEntryBuffer(entry)
      if (
        buf.length < 6 ||
        buf[0] !== 0x4a ||
        buf[1] !== 0x50 ||
        buf[2] !== 0x46 ||
        buf[3] !== 0x00
      ) {
        setError('Missing JPF\\0 prefix')
        setSrc(null)
        return
      }
      // Skip the 4-byte prefix; the rest is a valid JPEG/JFIF stream.
      const jpeg = buf.subarray(4)
      const blob = new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' })
      url = URL.createObjectURL(blob)
      setSrc(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to decode JPF')
    }
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [entry, archive])

  if (error)
    return (
      <Typography variant="caption" color="error">
        {error}
      </Typography>
    )
  if (!src) return null

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'auto',
        bgcolor: 'background.default',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 1
      }}
    >
      <img src={src} style={{ maxWidth: '100%', maxHeight: '100%' }} />
    </Box>
  )
}

// ── BIK preview (header metadata + on-demand ffmpeg conversion) ──────────────

const BikPreview: React.FC<{ entry: DataArchiveEntry; archive: DataArchive }> = ({
  entry,
  archive
}) => {
  const ffmpegPath = useRecoilValue(ffmpegPathState)
  const videoRef = useRef<HTMLVideoElement>(null)
  const blobUrlRef = useRef<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'converting' | 'ready' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const info = useMemo(() => {
    try {
      return parseBikHeader(archive.getEntryBuffer(entry))
    } catch {
      return null
    }
  }, [entry, archive])

  // Reset playback when the selected entry changes.
  useEffect(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    setStatus('idle')
    setErrorMsg(null)
  }, [entry])

  // Revoke the blob URL on unmount.
  useEffect(
    () => () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    },
    []
  )

  const handleConvert = useCallback(async () => {
    setStatus('converting')
    setErrorMsg(null)
    try {
      const userData = await window.api.getUserDataPath()
      const sep = userData.includes('\\') ? '\\' : '/'
      const cacheDir = `${userData}${sep}bik-cache`
      const bytes = entry.toUint8Array()
      const mp4Path = await window.api.bikConvert(bytes, ffmpegPath, cacheDir)
      const mp4Buf = await window.api.readFile(mp4Path)
      const blob = new Blob([new Uint8Array(mp4Buf)], { type: 'video/mp4' })
      const url = URL.createObjectURL(blob)
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = url
      if (videoRef.current) {
        videoRef.current.src = url
        videoRef.current.play().catch(() => undefined)
      }
      setStatus('ready')
    } catch (e) {
      setStatus('error')
      setErrorMsg(e instanceof Error ? e.message : 'Conversion failed')
    }
  }, [entry, ffmpegPath])

  if (!info) {
    return (
      <Typography variant="caption" color="error">
        Not a recognizable BIK file.
      </Typography>
    )
  }

  const durationSec = info.fps > 0 ? info.frameCount / info.fps : 0
  const minutes = Math.floor(durationSec / 60)
  const seconds = Math.floor(durationSec - minutes * 60)
  const rows: [string, string][] = [
    ['Format', `Bink Video (BIK${info.version})`],
    ['Resolution', `${info.width} × ${info.height}`],
    ['Frames', String(info.frameCount)],
    ['Frame rate', `${info.fps.toFixed(2)} fps`],
    ['Duration', `${minutes}:${String(seconds).padStart(2, '0')}`],
    ['Audio tracks', String(info.audioTrackCount)]
  ]

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%' }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          columnGap: 2,
          rowGap: 0.5,
          fontFamily: 'monospace',
          fontSize: '0.85rem'
        }}
      >
        {rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <Typography variant="caption" color="text.secondary">
              {k}
            </Typography>
            <Typography variant="caption">{v}</Typography>
          </React.Fragment>
        ))}
      </Box>

      {status === 'idle' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5 }}>
          <Button size="small" variant="outlined" startIcon={<MovieIcon />} onClick={handleConvert}>
            Convert &amp; Play
          </Button>
          <Typography variant="caption" color="text.secondary">
            Browsers can't play Bink directly. The first play converts to MP4 via ffmpeg and caches
            the result.
          </Typography>
        </Box>
      )}

      {status === 'converting' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={16} />
          <Typography variant="caption" color="text.secondary">
            Converting via ffmpeg…
          </Typography>
        </Box>
      )}

      {status === 'error' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="caption" color="error">
            {errorMsg}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Check that ffmpeg is installed and the path is set in Settings.
          </Typography>
          <Button size="small" variant="outlined" onClick={handleConvert}>
            Retry
          </Button>
        </Box>
      )}

      <Box
        sx={{
          flex: 1,
          display: status === 'ready' ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
          bgcolor: 'background.default',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1
        }}
      >
        <video ref={videoRef} controls style={{ maxWidth: '100%', maxHeight: '100%' }} />
      </Box>
    </Box>
  )
}

// ── Hex preview ──────────────────────────────────────────────────────────────

const HexPreview: React.FC<{ entry: DataArchiveEntry; archive: DataArchive }> = ({
  entry,
  archive
}) => {
  const hex = useMemo(() => {
    const buf = archive.getEntryBuffer(entry)
    const slice = buf.subarray(0, Math.min(512, buf.length))
    const lines: string[] = []
    for (let i = 0; i < slice.length; i += 16) {
      const addr = i.toString(16).padStart(8, '0')
      const hexPart: string[] = []
      let ascii = ''
      for (let j = 0; j < 16; j++) {
        if (i + j < slice.length) {
          hexPart.push(slice[i + j].toString(16).padStart(2, '0'))
          const ch = slice[i + j]
          ascii += ch >= 0x20 && ch <= 0x7e ? String.fromCharCode(ch) : '.'
        } else {
          hexPart.push('  ')
          ascii += ' '
        }
      }
      lines.push(
        `${addr}  ${hexPart.slice(0, 8).join(' ')}  ${hexPart.slice(8).join(' ')}  |${ascii}|`
      )
    }
    if (buf.length > 512) lines.push(`\n... ${buf.length - 512} more bytes`)
    return lines.join('\n')
  }, [entry, archive])

  return (
    <Box
      sx={{
        flex: 1,
        overflow: 'auto',
        p: 1,
        bgcolor: 'background.default',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        fontFamily: 'monospace',
        fontSize: '0.72rem',
        whiteSpace: 'pre',
        lineHeight: 1.6
      }}
    >
      {hex}
    </Box>
  )
}

// ── Main preview dispatcher ──────────────────────────────────────────────────

// ── Export helpers ────────────────────────────────────────────────────────────

async function extractRaw(entry: DataArchiveEntry) {
  const defaultName = entry.entryName
  const savePath = await window.api.saveFile(
    [{ name: 'All Files', extensions: ['*'] }],
    defaultName
  )
  if (!savePath) return
  const buf = entry.toUint8Array()
  await window.api.writeBytes(savePath, buf)
}

async function exportAsPng(entry: DataArchiveEntry, archive: DataArchive) {
  const palNames = getPaletteNames(archive)
  const palette = palNames.length > 0 ? loadPaletteByName(archive, palNames[0]) : null
  const rendered = renderEntry(entry, palette)
  if (!rendered || rendered.frames.length === 0) return

  if (rendered.frames.length === 1) {
    // Single frame — save directly
    const frame = rendered.frames[0]
    const canvas = document.createElement('canvas')
    canvas.width = frame.width
    canvas.height = frame.height
    const ctx = canvas.getContext('2d')!
    ctx.putImageData(toImageData(frame), 0, 0)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed'))), 'image/png')
    )
    const baseName = entry.entryName.replace(/\.[^.]+$/, '')
    const savePath = await window.api.saveFile(
      [{ name: 'PNG Image', extensions: ['png'] }],
      `${baseName}.png`
    )
    if (!savePath) return
    await window.api.writeBytes(savePath, new Uint8Array(await blob.arrayBuffer()))
  } else {
    // Multi-frame — save to directory
    const dir = await window.api.openDirectory()
    if (!dir) return
    const baseName = entry.entryName.replace(/\.[^.]+$/, '')
    for (let i = 0; i < rendered.frames.length; i++) {
      const frame = rendered.frames[i]
      const canvas = document.createElement('canvas')
      canvas.width = frame.width
      canvas.height = frame.height
      const ctx = canvas.getContext('2d')!
      ctx.putImageData(toImageData(frame), 0, 0)
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed'))), 'image/png')
      )
      const filename = `${baseName}_${String(i + 1).padStart(3, '0')}.png`
      await window.api.writeBytes(`${dir}/${filename}`, new Uint8Array(await blob.arrayBuffer()))
    }
  }
}

// ── Main preview dispatcher ──────────────────────────────────────────────────

const ArchivePreview: React.FC<Props> = ({ entry, archive }) => {
  const type = classifyEntry(entry)
  const isRenderable =
    type === 'sprite' ||
    type === 'palette' ||
    type === 'tileset' ||
    type === 'pcx' ||
    type === 'darkness' ||
    type === 'font'

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 1.5, gap: 1 }}>
      {/* Entry header + extract buttons */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
            {entry.entryName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatBytes(entry.fileSize)} · {type}
          </Typography>
        </Box>
        <Tooltip title="Extract Raw">
          <IconButton size="small" onClick={() => extractRaw(entry)} sx={{ color: 'text.primary' }}>
            <SaveAltIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {isRenderable && (
          <Tooltip title={`Export as PNG`}>
            <IconButton
              size="small"
              onClick={() => exportAsPng(entry, archive)}
              sx={{ color: 'text.primary' }}
            >
              <ImageIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Format-specific preview */}
      {type === 'sprite' && <SpritePreview entry={entry} archive={archive} />}
      {type === 'palette' && <PalettePreview entry={entry} archive={archive} />}
      {type === 'text' && <TextPreview entry={entry} archive={archive} />}
      {type === 'audio' && <AudioPreview entry={entry} archive={archive} />}
      {type === 'tileset' && <TilesetPreview entry={entry} archive={archive} />}
      {type === 'pcx' && <PcxPreview entry={entry} archive={archive} />}
      {type === 'darkness' && <DarknessPreview entry={entry} archive={archive} />}
      {type === 'font' && <FontPreview entry={entry} archive={archive} />}
      {type === 'bik' && <BikPreview entry={entry} archive={archive} />}
      {type === 'jpf' && <JpfPreview entry={entry} archive={archive} />}
      {type === 'hex' && <HexPreview entry={entry} archive={archive} />}
    </Box>
  )
}

export default ArchivePreview
