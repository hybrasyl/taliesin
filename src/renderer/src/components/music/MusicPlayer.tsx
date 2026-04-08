import React, { useRef, useEffect, useState } from 'react'
import { Box, Typography, IconButton, Slider, Tooltip } from '@mui/material'

interface Props {
  /** Absolute filesystem path to the audio file, or null if nothing loaded */
  filePath: string | null
  trackName: string
  playing: boolean
  onPlayingChange: (playing: boolean) => void
}

function formatTime(secs: number): string {
  if (!isFinite(secs)) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const MusicPlayer: React.FC<Props> = ({ filePath, trackName, playing, onPlayingChange }) => {
  const audioRef   = useRef<HTMLAudioElement | null>(null)
  const blobUrlRef = useRef<string | null>(null)
  // Keep a ref so async callbacks always see the latest playing intent
  const playingRef = useRef(playing)
  playingRef.current = playing

  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [seeking, setSeeking] = useState(false)

  // Sync play/pause — but only when audio is already loaded (readyState >= 2).
  // If src is still loading, onCanPlay will handle the initial play.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      if (audio.readyState >= 2) {
        audio.play().catch(() => onPlayingChange(false))
      }
      // else: onCanPlay fires when ready and will start playback
    } else {
      audio.pause()
    }
  }, [playing]) // eslint-disable-line react-hooks/exhaustive-deps

  // New file: read via IPC → Blob URL (avoids file:// web security block)
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }

    setCurrentTime(0)
    setDuration(0)

    if (!filePath) {
      audio.src = ''
      onPlayingChange(false)
      return
    }

    window.api.readFile(filePath).then((buffer) => {
      const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
      const mime = ext === '.wav' ? 'audio/wav' : ext === '.ogg' ? 'audio/ogg' : ext === '.flac' ? 'audio/flac' : 'audio/mpeg'
      const blob = new Blob([new Uint8Array(buffer)], { type: mime })
      const url = URL.createObjectURL(blob)
      blobUrlRef.current = url
      audio.src = url
      audio.load()
      // Playback starts from onCanPlay once the browser has buffered enough
    }).catch((err) => {
      console.error('MusicPlayer: failed to read file', filePath, err)
      onPlayingChange(false)
    })

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [filePath]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!filePath) return null

  return (
    <Box sx={{
      px: 2, py: 0.75,
      bgcolor: 'secondary.main',
      display: 'flex', alignItems: 'center', gap: 1.5,
      borderTop: '1px solid', borderColor: 'divider',
    }}>
      {/* Audio element (hidden) */}
      <audio
        ref={audioRef}
        onCanPlay={() => { if (playingRef.current) audioRef.current?.play().catch(() => onPlayingChange(false)) }}
        onTimeUpdate={(e) => { if (!seeking) setCurrentTime((e.target as HTMLAudioElement).currentTime) }}
        onDurationChange={(e) => setDuration((e.target as HTMLAudioElement).duration)}
        onEnded={() => { onPlayingChange(false); setCurrentTime(0) }}
        onError={() => onPlayingChange(false)}
      />

      {/* Play/Pause */}
      <Tooltip title={playing ? 'Pause' : 'Play'}>
        <IconButton
          size="small"
          onClick={() => onPlayingChange(!playing)}
          sx={{ color: 'text.button', flexShrink: 0 }}
        >
          {playing ? '⏸' : '▶'}
        </IconButton>
      </Tooltip>

      {/* Track name */}
      <Typography
        variant="caption"
        noWrap
        sx={{ color: 'text.button', minWidth: 120, maxWidth: 200, flexShrink: 0 }}
      >
        {trackName}
      </Typography>

      {/* Seek bar */}
      <Typography variant="caption" sx={{ color: 'text.button', opacity: 0.7, flexShrink: 0 }}>
        {formatTime(currentTime)}
      </Typography>
      <Slider
        size="small"
        min={0}
        max={duration || 100}
        value={currentTime}
        onMouseDown={() => setSeeking(true)}
        onChange={(_, v) => { setCurrentTime(v as number) }}
        onChangeCommitted={(_, v) => {
          setSeeking(false)
          if (audioRef.current) audioRef.current.currentTime = v as number
        }}
        sx={{ flex: 1, color: 'text.button' }}
      />
      <Typography variant="caption" sx={{ color: 'text.button', opacity: 0.7, flexShrink: 0 }}>
        {formatTime(duration)}
      </Typography>
    </Box>
  )
}

export default MusicPlayer
