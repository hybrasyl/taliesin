import React, { useEffect, useRef, useState } from 'react'
import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  type SelectChangeEvent,
  Skeleton,
  Tooltip,
  Typography
} from '@mui/material'
import BrokenImageIcon from '@mui/icons-material/BrokenImage'
import { FIELD_NAMES, FIELD_WIDTH, FIELD_HEIGHT, renderField } from '../../utils/worldMapRenderer'

// ── Thumbnail canvas ──────────────────────────────────────────────────────────

interface ThumbnailProps {
  fieldName: string
  clientPath: string | null
  width: number
  height: number
}

function FieldThumbnail({ fieldName, clientPath, width, height }: ThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')

  useEffect(() => {
    if (!clientPath || !fieldName) {
      setStatus('error')
      return
    }
    setStatus('loading')
    let cancelled = false

    renderField(fieldName, clientPath)
      .then((bitmap) => {
        if (cancelled) return
        if (!canvasRef.current) {
          setStatus('error')
          return
        }
        const ctx = canvasRef.current.getContext('2d')
        if (!ctx) {
          setStatus('error')
          return
        }
        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(bitmap, 0, 0, FIELD_WIDTH, FIELD_HEIGHT, 0, 0, width, height)
        setStatus('ok')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [fieldName, clientPath, width, height])

  if (!clientPath) return null

  return (
    <Box
      sx={{
        width,
        height,
        flexShrink: 0,
        position: 'relative',
        borderRadius: 0.5,
        overflow: 'hidden',
        border: 1,
        borderColor: 'divider'
      }}
    >
      {status === 'loading' && (
        <Skeleton variant="rectangular" width={width} height={height} animation="wave" />
      )}
      {status === 'error' && (
        <Box
          sx={{
            width,
            height,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'action.hover'
          }}
        >
          <BrokenImageIcon fontSize="small" color="disabled" />
        </Box>
      )}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ display: status === 'ok' ? 'block' : 'none' }}
      />
    </Box>
  )
}

// ── Select component ──────────────────────────────────────────────────────────

interface Props {
  value: string
  onChange: (value: string) => void
  clientPath: string | null
  disabled?: boolean
}

const THUMB_W = 96
const THUMB_H = 72

export default function ClientMapSelect({ value, onChange, clientPath, disabled }: Props) {
  const handleChange = (e: SelectChangeEvent) => onChange(e.target.value)

  const noClientPath = !clientPath

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
      <FormControl size="small" sx={{ minWidth: 160 }} disabled={disabled}>
        <InputLabel>Client Map</InputLabel>
        <Select value={value} label="Client Map" onChange={handleChange}>
          {FIELD_NAMES.map((name) => (
            <MenuItem key={name} value={name}>
              <Typography variant="body2" fontFamily="monospace">
                {name}
              </Typography>
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {value && (
        <Tooltip
          title={noClientPath ? 'Set a client path in Settings to preview field images' : ''}
          disableHoverListener={!noClientPath}
        >
          <span>
            <FieldThumbnail
              fieldName={value}
              clientPath={clientPath}
              width={THUMB_W}
              height={THUMB_H}
            />
          </span>
        </Tooltip>
      )}
    </Box>
  )
}
