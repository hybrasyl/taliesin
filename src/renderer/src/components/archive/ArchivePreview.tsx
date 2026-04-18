import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import {
  Box, Typography, Select, MenuItem, IconButton, Tooltip,
  FormControl, InputLabel, type SelectChangeEvent,
} from '@mui/material'
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import StopIcon from '@mui/icons-material/Stop'
import { Palette, type DataArchive, type DataArchiveEntry } from '@eriscorp/dalib-ts'
import { toImageData } from '@eriscorp/dalib-ts/helpers/imageData'
import {
  renderEntry, renderPaletteGrid, classifyEntry,
  loadPaletteByName, getPaletteNames, formatBytes,
  type RenderedEntry, type PreviewType,
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
      const result = renderEntry(entry, archive, palette)
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
      setFrameIndex(prev => (prev + 1) % rendered.frames.length)
    }, interval)

    return () => { if (timerRef.current) clearInterval(timerRef.current) }
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
            {paletteNames.map(name => (
              <MenuItem key={name} value={name}>{name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {error && (
        <Typography variant="caption" color="error">{error}</Typography>
      )}

      {/* Canvas */}
      <Box sx={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'auto',
        bgcolor: 'background.default',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        minHeight: 100,
      }}>
        <canvas
          ref={canvasRef}
          style={{
            imageRendering: 'pixelated',
            maxWidth: '100%',
            maxHeight: '100%',
          }}
        />
      </Box>

      {/* Frame info */}
      {currentFrame && (
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
          {currentFrame.width} × {currentFrame.height} px
          {rendered?.blendingType != null && ` · blend: ${rendered.blendingType}`}
          {rendered?.animation && ` · walk: ${rendered.animation.walkFrameCount} · atk: ${rendered.animation.attackFrameCount}`}
        </Typography>
      )}

      {/* Frame navigation */}
      {totalFrames > 1 && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
          <Tooltip title="Previous frame">
            <IconButton
              size="small"
              disabled={frameIndex === 0 && !playing}
              onClick={() => { setPlaying(false); setFrameIndex(prev => Math.max(0, prev - 1)) }}
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
              onClick={() => { setPlaying(false); setFrameIndex(prev => Math.min(totalFrames - 1, prev + 1)) }}
            >
              <NavigateNextIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title={playing ? 'Pause' : 'Play animation'}>
            <IconButton size="small" onClick={() => setPlaying(prev => !prev)}>
              {playing ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  )
}

// ── Palette preview ──────────────────────────────────────────────────────────

const PalettePreview: React.FC<{ entry: DataArchiveEntry; archive: DataArchive }> = ({ entry, archive }) => {
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
          ctx.fillStyle = ((x / 14 + y / 14) % 2) ? '#2a2a2a' : '#3a3a3a'
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
        <Typography variant="caption" color="error">{error}</Typography>
      ) : (
        <canvas
          ref={canvasRef}
          style={{ imageRendering: 'pixelated', border: '1px solid', borderRadius: 4 }}
        />
      )}
      <Typography variant="caption" color="text.secondary">256 colors (16×16)</Typography>
    </Box>
  )
}

// ── Text preview ─────────────────────────────────────────────────────────────

const TextPreview: React.FC<{ entry: DataArchiveEntry; archive: DataArchive }> = ({ entry, archive }) => {
  const text = useMemo(() => {
    const buf = archive.getEntryBuffer(entry)
    return new TextDecoder('utf-8', { fatal: false }).decode(buf)
  }, [entry, archive])

  return (
    <Box sx={{
      flex: 1, overflow: 'auto', p: 1,
      bgcolor: 'background.default',
      border: '1px solid', borderColor: 'divider', borderRadius: 1,
      fontFamily: 'monospace', fontSize: '0.78rem', whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
    }}>
      {text}
    </Box>
  )
}

// ── Audio preview ────────────────────────────────────────────────────────────

const AudioPreview: React.FC<{ entry: DataArchiveEntry; archive: DataArchive }> = ({ entry, archive }) => {
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
      const mime = extension === '.wav' ? 'audio/wav' : extension === '.ogg' ? 'audio/ogg' : 'audio/mpeg'
      const blob = new Blob([buf], { type: mime })
      const url = URL.createObjectURL(blob)

      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = url

      if (!audioRef.current) audioRef.current = new Audio()
      audioRef.current.src = url
      audioRef.current.onended = () => setPlaying(false)
      audioRef.current.onerror = () => { setPlaying(false); setError('Playback failed') }
      await audioRef.current.play()
      setPlaying(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to play audio')
    }
  }, [entry, archive, playing])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, pt: 4 }}>
      <Typography variant="body2" color="text.secondary">{entry.entryName}</Typography>
      <IconButton
        size="large"
        onClick={handleToggle}
        sx={{ border: '2px solid', borderColor: 'divider', p: 3, color: playing ? 'secondary.light' : 'text.primary' }}
      >
        {playing ? <StopIcon sx={{ fontSize: 48 }} /> : <PlayArrowIcon sx={{ fontSize: 48 }} />}
      </IconButton>
      <Typography variant="caption" color="text.secondary">
        {playing ? 'Playing…' : 'Click to play'}
      </Typography>
      {error && <Typography variant="caption" color="error">{error}</Typography>}
    </Box>
  )
}

// ── BMP preview ──────────────────────────────────────────────────────────────

const BmpPreview: React.FC<{ entry: DataArchiveEntry; archive: DataArchive }> = ({ entry, archive }) => {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    try {
      const buf = archive.getEntryBuffer(entry)
      const blob = new Blob([buf], { type: 'image/bmp' })
      const url = URL.createObjectURL(blob)
      setSrc(prev => { if (prev) URL.revokeObjectURL(prev); return url })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load BMP')
    }
    return () => { if (src) URL.revokeObjectURL(src) }
  }, [entry, archive])

  if (error) return <Typography variant="caption" color="error">{error}</Typography>
  if (!src) return null

  return (
    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
      <img src={src} style={{ imageRendering: 'pixelated', maxWidth: '100%', maxHeight: '100%' }} />
    </Box>
  )
}

// ── Hex preview ──────────────────────────────────────────────────────────────

const HexPreview: React.FC<{ entry: DataArchiveEntry; archive: DataArchive }> = ({ entry, archive }) => {
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
          ascii += (ch >= 0x20 && ch <= 0x7e) ? String.fromCharCode(ch) : '.'
        } else {
          hexPart.push('  ')
          ascii += ' '
        }
      }
      lines.push(`${addr}  ${hexPart.slice(0, 8).join(' ')}  ${hexPart.slice(8).join(' ')}  |${ascii}|`)
    }
    if (buf.length > 512) lines.push(`\n... ${buf.length - 512} more bytes`)
    return lines.join('\n')
  }, [entry, archive])

  return (
    <Box sx={{
      flex: 1, overflow: 'auto', p: 1,
      bgcolor: 'background.default',
      border: '1px solid', borderColor: 'divider', borderRadius: 1,
      fontFamily: 'monospace', fontSize: '0.72rem', whiteSpace: 'pre',
      lineHeight: 1.6,
    }}>
      {hex}
    </Box>
  )
}

// ── Main preview dispatcher ──────────────────────────────────────────────────

const ArchivePreview: React.FC<Props> = ({ entry, archive }) => {
  const type = classifyEntry(entry)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 1.5, gap: 1 }}>
      {/* Entry header */}
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{entry.entryName}</Typography>
        <Typography variant="caption" color="text.secondary">
          {formatBytes(entry.fileSize)} · {type}
        </Typography>
      </Box>

      {/* Format-specific preview */}
      {type === 'sprite' && <SpritePreview entry={entry} archive={archive} />}
      {type === 'palette' && <PalettePreview entry={entry} archive={archive} />}
      {type === 'text' && <TextPreview entry={entry} archive={archive} />}
      {type === 'audio' && <AudioPreview entry={entry} archive={archive} />}
      {type === 'image' && <BmpPreview entry={entry} archive={archive} />}
      {type === 'hex' && <HexPreview entry={entry} archive={archive} />}
    </Box>
  )
}

export default ArchivePreview
