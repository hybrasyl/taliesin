import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Box, Typography, IconButton } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { MapFile } from '@eriscorp/dalib-ts'
import {
  loadMapAssets,
  isTilePassable,
  tileToScreen,
  isoCanvasSize,
  ISO_HTILE_W,
  ISO_VTILE_STEP,
  ISO_FOREGROUND_PAD,
  type MapAssets
} from '../../utils/mapRenderer'

interface Props {
  mapFile: MapFile
  clientPath: string | null
  onClose: () => void
}

const TabMapPopup: React.FC<Props> = ({ mapFile, clientPath, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dragging, setDragging] = useState(false)
  const [pos, setPos] = useState({ x: 80, y: 80 })
  const dragStartRef = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  const [assets, setAssets] = useState<MapAssets | null>(null)

  useEffect(() => {
    if (!clientPath) return
    let cancelled = false
    loadMapAssets(clientPath)
      .then((a) => {
        if (!cancelled) setAssets(a)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [clientPath])

  const { width: W, height: H } = mapFile

  // Scale to fit ~400px max dimension
  const previewScale = Math.min(0.5, 400 / ((W + H) * ISO_HTILE_W))
  const originX = H * ISO_HTILE_W
  const originY = ISO_FOREGROUND_PAD

  // Render isometric collision wireframe
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { w: cw, h: ch } = isoCanvasSize(W, H, previewScale)
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, cw, ch)

    const sotp = assets?.sotpTable
    const hw = ISO_HTILE_W * previewScale
    const hv = ISO_VTILE_STEP * previewScale

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const tile = mapFile.getTile(x, y)
        const hasFg = tile.leftForeground > 0 || tile.rightForeground > 0
        const passable = sotp
          ? isTilePassable(tile.leftForeground, tile.rightForeground, sotp)
          : true
        const hasBg = tile.background > 0

        const { x: cx, y: cy } = tileToScreen(x, y, originX, originY, previewScale)

        // Draw diamond
        ctx.beginPath()
        ctx.moveTo(cx, cy - hv)
        ctx.lineTo(cx + hw, cy)
        ctx.lineTo(cx, cy + hv)
        ctx.lineTo(cx - hw, cy)
        ctx.closePath()

        if (hasFg && !passable) {
          ctx.fillStyle = 'rgba(220,50,50,0.8)'
          ctx.fill()
        } else if (hasFg) {
          ctx.fillStyle = 'rgba(100,150,255,0.4)'
          ctx.fill()
        } else if (hasBg) {
          ctx.fillStyle = 'rgba(60,60,80,0.5)'
          ctx.fill()
        }

        ctx.strokeStyle = 'rgba(255,255,255,0.06)'
        ctx.lineWidth = 0.5
        ctx.stroke()
      }
    }
  }, [mapFile, assets, W, H, previewScale, originX, originY])

  // Drag handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setDragging(true)
      dragStartRef.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y }
    },
    [pos]
  )

  useEffect(() => {
    if (!dragging) return
    const handleMove = (e: MouseEvent) => {
      const { mx, my, px, py } = dragStartRef.current
      setPos({ x: px + e.clientX - mx, y: py + e.clientY - my })
    }
    const handleUp = () => setDragging(false)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [dragging])

  return (
    <Box
      sx={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 1300,
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        boxShadow: 8,
        overflow: 'hidden'
      }}
    >
      {/* Title bar */}
      <Box
        onMouseDown={handleMouseDown}
        sx={{
          px: 1,
          py: 0.25,
          display: 'flex',
          alignItems: 'center',
          bgcolor: 'secondary.main',
          cursor: dragging ? 'grabbing' : 'grab',
          userSelect: 'none'
        }}
      >
        <Typography variant="caption" sx={{ flex: 1, fontWeight: 'bold' }}>
          Collision Map ({W}×{H})
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: 'text.primary', p: 0 }}>
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>

      {/* Canvas */}
      <canvas ref={canvasRef} style={{ display: 'block', imageRendering: 'pixelated' }} />

      {/* Legend */}
      <Box sx={{ px: 1, py: 0.25, display: 'flex', gap: 1.5, bgcolor: 'background.default' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 8, height: 8, bgcolor: 'rgba(220,50,50,0.8)', borderRadius: '2px' }} />
          <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>
            Impassable
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box
            sx={{ width: 8, height: 8, bgcolor: 'rgba(100,150,255,0.4)', borderRadius: '2px' }}
          />
          <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>
            Objects
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 8, height: 8, bgcolor: 'rgba(60,60,80,0.5)', borderRadius: '2px' }} />
          <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>
            Ground
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}

export default TabMapPopup
