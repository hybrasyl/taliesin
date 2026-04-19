import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Box, Typography, IconButton } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { MapFile } from '@eriscorp/dalib-ts'
import { isTilePassable, type MapAssets } from '../../utils/mapRenderer'

interface Props {
  mapFile: MapFile
  assets: MapAssets | null
  onClose: () => void
}

const POPUP_MAX_SIZE = 300
const MIN_PPT = 2

const TabMapPopup: React.FC<Props> = ({ mapFile, assets, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dragging, setDragging] = useState(false)
  const [pos, setPos] = useState({ x: 20, y: 60 })
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  const { width: W, height: H } = mapFile
  const ppt = Math.max(MIN_PPT, Math.min(Math.floor(POPUP_MAX_SIZE / Math.max(W, H)), 8))

  // Render collision wireframe
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = W * ppt
    canvas.height = H * ppt
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const sotp = assets?.sotpTable
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const tile = mapFile.getTile(x, y)
        const hasFg = tile.leftForeground > 0 || tile.rightForeground > 0
        const passable = sotp ? isTilePassable(tile.leftForeground, tile.rightForeground, sotp) : true

        if (hasFg && !passable) {
          ctx.fillStyle = 'rgba(220,50,50,0.8)'
          ctx.fillRect(x * ppt, y * ppt, ppt, ppt)
        } else if (hasFg) {
          ctx.fillStyle = 'rgba(100,150,255,0.3)'
          ctx.fillRect(x * ppt, y * ppt, ppt, ppt)
        } else if (tile.background > 0) {
          ctx.fillStyle = 'rgba(60,60,80,0.5)'
          ctx.fillRect(x * ppt, y * ppt, ppt, ppt)
        }
      }
    }

    // Grid
    if (ppt >= 3) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 0.5
      for (let x = 0; x <= W; x++) { ctx.beginPath(); ctx.moveTo(x * ppt, 0); ctx.lineTo(x * ppt, H * ppt); ctx.stroke() }
      for (let y = 0; y <= H; y++) { ctx.beginPath(); ctx.moveTo(0, y * ppt); ctx.lineTo(W * ppt, y * ppt); ctx.stroke() }
    }
  }, [mapFile, assets, W, H, ppt])

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setDragging(true)
    dragOffsetRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
  }, [pos])

  useEffect(() => {
    if (!dragging) return
    const handleMove = (e: MouseEvent) => {
      setPos({ x: e.clientX - dragOffsetRef.current.x, y: e.clientY - dragOffsetRef.current.y })
    }
    const handleUp = () => setDragging(false)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp) }
  }, [dragging])

  return (
    <Box sx={{
      position: 'fixed',
      left: pos.x,
      top: pos.y,
      zIndex: 1300,
      bgcolor: 'background.paper',
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 1,
      boxShadow: 8,
      overflow: 'hidden',
    }}>
      {/* Title bar */}
      <Box
        onMouseDown={handleMouseDown}
        sx={{
          px: 1, py: 0.25,
          display: 'flex', alignItems: 'center',
          bgcolor: 'secondary.main',
          cursor: 'move',
          userSelect: 'none',
        }}
      >
        <Typography variant="caption" sx={{ flex: 1, fontWeight: 'bold' }}>
          Collision Map
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
          <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>Impassable</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 8, height: 8, bgcolor: 'rgba(100,150,255,0.3)', borderRadius: '2px' }} />
          <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>Objects</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 8, height: 8, bgcolor: 'rgba(60,60,80,0.5)', borderRadius: '2px' }} />
          <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>Ground</Typography>
        </Box>
      </Box>
    </Box>
  )
}

export default TabMapPopup
