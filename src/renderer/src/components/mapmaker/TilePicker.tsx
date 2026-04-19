import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { Box, Typography, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  loadMapAssets, getGroundBitmap, getStcBitmap,
  GROUND_TILE_WIDTH, GROUND_TILE_HEIGHT,
  type MapAssets,
} from '../../utils/mapRenderer'

// ── Types ────────────────────────────────────────────────────────────────────

export type TileLayer = 'background' | 'leftForeground' | 'rightForeground'

interface Props {
  clientPath: string | null
  activeLayer: TileLayer
  selectedTileId: number
  selectedTileIds: number[]
  onSelectTile: (tileId: number) => void
  onSelectTiles: (ids: number[]) => void
  onLayerChange: (layer: TileLayer) => void
}

const COLS = 3
const CELL_PAD = 3
/** Fixed thumbnail size for foreground tiles (actual tile is drawn scaled to fit). */
const FG_THUMB_W = 28
const FG_THUMB_H = 48
const ROW_HEIGHT_BG = 62
const ROW_HEIGHT_FG = 72

// ── Component ────────────────────────────────────────────────────────────────

const TilePicker: React.FC<Props> = ({ clientPath, activeLayer, selectedTileId, selectedTileIds, onSelectTile, onSelectTiles, onLayerChange }) => {
  const [assets, setAssets] = useState<MapAssets | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const lastClickedRef = useRef<number | null>(null)
  const [bgBitmaps, setBgBitmaps] = useState<Map<number, ImageBitmap>>(new Map())
  const [fgEntryIds, setFgEntryIds] = useState<number[]>([])
  const [fgBitmaps, setFgBitmaps] = useState<Map<number, ImageBitmap>>(new Map())
  const parentRef = useRef<HTMLDivElement>(null)

  // Load assets
  useEffect(() => {
    if (!clientPath) return
    setLoading(true)
    loadMapAssets(clientPath)
      .then(a => {
        setAssets(a)
        // Collect foreground tile IDs from ia.dat
        const ids: number[] = []
        for (const entry of a.iaArchive.entries) {
          const m = entry.entryName.match(/^stc(\d+)\.hpf$/i)
          if (m) {
            const id = parseInt(m[1], 10)
            ids.push(id)
          }
        }
        ids.sort((a, b) => a - b)
        setFgEntryIds(ids)
      })
      .finally(() => setLoading(false))
  }, [clientPath])

  // Pre-render background tile bitmaps
  useEffect(() => {
    if (!assets || activeLayer !== 'background') return
    let cancelled = false
    const loadBitmaps = async () => {
      const map = new Map<number, ImageBitmap>()
      for (let i = 0; i <= assets.groundTileCount; i++) {
        if (cancelled) return
        const bm = await getGroundBitmap(i, assets)
        if (bm) map.set(i, bm)
      }
      if (!cancelled) setBgBitmaps(map)
    }
    loadBitmaps()
    return () => { cancelled = true }
  }, [assets, activeLayer])

  // Lazy-load foreground bitmaps as needed
  const loadFgBitmap = useCallback(async (tileId: number) => {
    if (!assets || fgBitmaps.has(tileId)) return
    const bm = await getStcBitmap(tileId, assets)
    if (bm) setFgBitmaps(prev => new Map(prev).set(tileId, bm))
  }, [assets, fgBitmaps])

  const isBg = activeLayer === 'background'
  const isFg = activeLayer === 'foreground' || activeLayer === 'leftForeground' || activeLayer === 'rightForeground'

  // Filter tile IDs
  const tileIds = useMemo(() => {
    const ids = isBg
      ? Array.from({ length: (assets?.groundTileCount ?? 0) + 1 }, (_, i) => i)
      : fgEntryIds
    if (!filter.trim()) return ids
    const q = filter.trim()
    return ids.filter(id => String(id).includes(q))
  }, [isBg, assets, fgEntryIds, filter])

  const rowCount = Math.ceil(tileIds.length / COLS)
  const rowH = isBg ? ROW_HEIGHT_BG : ROW_HEIGHT_FG

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowH,
    overscan: 8,
  })

  // Scroll to selected tile when it changes (e.g. eyedropper sample)
  useEffect(() => {
    if (selectedTileId <= 0) return
    const idx = tileIds.indexOf(selectedTileId)
    if (idx < 0) return
    const row = Math.floor(idx / COLS)
    virtualizer.scrollToIndex(row, { align: 'center' })
  }, [selectedTileId, tileIds, virtualizer])

  // Multi-select click handler
  const handleTileClick = useCallback((tileId: number, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      // Toggle individual tile
      const next = selectedTileIds.includes(tileId)
        ? selectedTileIds.filter(id => id !== tileId)
        : [...selectedTileIds, tileId]
      onSelectTiles(next.length > 0 ? next : [tileId])
      lastClickedRef.current = tileId
    } else if (e.shiftKey && lastClickedRef.current !== null) {
      // Range select
      const lastIdx = tileIds.indexOf(lastClickedRef.current)
      const curIdx = tileIds.indexOf(tileId)
      if (lastIdx >= 0 && curIdx >= 0) {
        const start = Math.min(lastIdx, curIdx)
        const end = Math.max(lastIdx, curIdx)
        const range = tileIds.slice(start, end + 1)
        // Merge with existing selection
        const merged = new Set([...selectedTileIds, ...range])
        onSelectTiles([...merged])
      }
    } else {
      // Normal click — single select
      onSelectTile(tileId)
      lastClickedRef.current = tileId
    }
  }, [tileIds, selectedTileIds, onSelectTile, onSelectTiles])

  if (!clientPath) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="caption" color="text.disabled">Set a client path in Settings to browse tiles.</Typography>
      </Box>
    )
  }

  if (loading) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="caption" color="text.secondary">Loading tile assets...</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Layer selector */}
      <Box sx={{ px: 1, pt: 1 }}>
        <ToggleButtonGroup
          value={activeLayer}
          exclusive
          onChange={(_, v) => v && onLayerChange(v)}
          size="small"
          fullWidth
          sx={{
            '& .MuiToggleButton-root': { color: 'text.primary' },
            '& .MuiToggleButton-root.Mui-selected': { color: 'info.light', bgcolor: 'action.selected' },
          }}
        >
          <ToggleButton value="background" sx={{ fontSize: '0.7rem', py: 0.25 }}>BG</ToggleButton>
          <ToggleButton value="leftForeground" sx={{ fontSize: '0.7rem', py: 0.25 }}>L-FG</ToggleButton>
          <ToggleButton value="rightForeground" sx={{ fontSize: '0.7rem', py: 0.25 }}>R-FG</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Filter */}
      <Box sx={{ px: 1, py: 0.5 }}>
        <TextField
          size="small"
          placeholder="Filter by ID..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          fullWidth
        />
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
        {tileIds.length} tiles
      </Typography>

      {/* Tile grid */}
      <Box ref={parentRef} sx={{ flex: 1, overflow: 'auto', px: 0.5 }}>
        <Box sx={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map(vr => {
            const startIdx = vr.index * COLS
            return (
              <Box
                key={vr.index}
                sx={{
                  position: 'absolute',
                  top: vr.start,
                  height: vr.size,
                  width: '100%',
                  display: 'flex',
                  gap: `${CELL_PAD}px`,
                }}
              >
                {Array.from({ length: COLS }, (_, col) => {
                  const idx = startIdx + col
                  if (idx >= tileIds.length) return <Box key={col} sx={{ flex: 1 }} />
                  const tileId = tileIds[idx]
                  const isSelected = selectedTileIds.includes(tileId)
                  return (
                    <TileCell
                      key={tileId}
                      tileId={tileId}
                      isSelected={isSelected}
                      bitmap={isBg ? bgBitmaps.get(tileId) : fgBitmaps.get(tileId)}
                      rowH={rowH}
                      onClick={(e) => handleTileClick(tileId, e)}
                      onVisible={isBg ? undefined : () => loadFgBitmap(tileId)}
                    />
                  )
                })}
              </Box>
            )
          })}
        </Box>
      </Box>
    </Box>
  )
}

// ── TileCell ─────────────────────────────────────────────────────────────────

const TileCell: React.FC<{
  tileId: number
  isSelected: boolean
  bitmap: ImageBitmap | undefined
  rowH: number
  onClick: (e: React.MouseEvent) => void
  onVisible?: () => void
}> = ({ tileId, isSelected, bitmap, rowH, onClick, onVisible }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const loadedRef = useRef(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewPos, setPreviewPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  const thumbH = rowH - 22
  const isOversized = bitmap ? bitmap.height > thumbH * 2 : false

  useEffect(() => {
    if (!bitmap && onVisible && !loadedRef.current) {
      loadedRef.current = true
      onVisible()
    }
  }, [bitmap, onVisible])

  // Draw thumbnail (scaled to fit fixed cell)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (!bitmap) {
      // Blank tile — draw placeholder
      canvas.width = FG_THUMB_W
      canvas.height = Math.min(FG_THUMB_H, thumbH)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = 'rgba(255,255,255,0.06)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'
      ctx.lineWidth = 1
      ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1)
      // Small diamond in center
      const cx = canvas.width / 2, cy = canvas.height / 2, r = 4
      ctx.beginPath()
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy)
      ctx.closePath()
      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      ctx.fill()
      return
    }

    // Scale to fit within fixed thumb area
    const scale = Math.min(1, FG_THUMB_W / bitmap.width, thumbH / bitmap.height)
    const dw = Math.round(bitmap.width * scale)
    const dh = Math.round(bitmap.height * scale)
    canvas.width = dw
    canvas.height = dh
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, dw, dh)
    ctx.drawImage(bitmap, 0, 0, dw, dh)
  }, [bitmap, thumbH])

  // Draw full-size preview on hover
  useEffect(() => {
    if (!showPreview || !bitmap || !previewRef.current) return
    const canvas = previewRef.current
    canvas.width = bitmap.width * 2
    canvas.height = bitmap.height * 2
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(bitmap, 0, 0, bitmap.width * 2, bitmap.height * 2)
  }, [showPreview, bitmap])

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    if (!bitmap || !isOversized) return
    setPreviewPos({ x: e.clientX, y: e.clientY })
    setShowPreview(true)
  }, [bitmap, isOversized])

  const handleMouseLeave = useCallback(() => {
    setShowPreview(false)
  }, [])

  return (
    <>
      <Box
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        sx={{
          flex: 1,
          height: rowH,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-end',
          cursor: 'pointer',
          border: isSelected ? '2px solid' : '2px solid transparent',
          borderColor: isSelected ? 'secondary.light' : 'transparent',
          borderRadius: 0.5,
          bgcolor: isSelected ? 'action.selected' : 'transparent',
          '&:hover': { bgcolor: 'action.hover' },
          p: `${CELL_PAD}px`,
          overflow: 'hidden',
        }}
      >
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <canvas ref={canvasRef} style={{ imageRendering: 'pixelated' }} />
        </Box>
        <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', lineHeight: 1.4 }}>
          {tileId}
        </Typography>
      </Box>

      {/* Hover preview for oversized tiles */}
      {showPreview && bitmap && (
        <Box
          sx={{
            position: 'fixed',
            left: previewPos.x + 16,
            top: Math.max(8, previewPos.y - bitmap.height),
            zIndex: 9999,
            pointerEvents: 'none',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            bgcolor: 'background.paper',
            p: 0.5,
            boxShadow: 4,
          }}
        >
          <canvas ref={previewRef} style={{ imageRendering: 'pixelated', display: 'block' }} />
          <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.secondary', display: 'block', textAlign: 'center', mt: 0.25 }}>
            {bitmap.width}×{bitmap.height} — tile {tileId}
          </Typography>
        </Box>
      )}
    </>
  )
}

export default TilePicker
