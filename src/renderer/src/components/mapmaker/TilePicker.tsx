import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { Box, Typography, ToggleButton, ToggleButtonGroup } from '@mui/material'
import { FilterField } from '../shared/FilterField'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  loadMapAssets,
  getGroundBitmap,
  getStcBitmap,
  type MapAssets
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

const CELL_PAD = 3
/** Vertical space a cell spends on its id label and padding. */
const LABEL_BLOCK = 22

export const PICKER_ZOOMS = [1, 2, 4] as const
export type PickerZoom = (typeof PICKER_ZOOMS)[number]

/**
 * The native size of a tile, per layer.
 *
 * A ground tile is a 56×27 diamond; a foreground `stc` is 28 wide and any
 * height. The picker used to clamp both into a 28-pixel box, which drew every
 * ground tile at half size (HTOO-334).
 */
const NATIVE = {
  background: { w: 56, h: 27 },
  foreground: { w: 28, h: 48 }
} as const

/**
 * How many columns fit at each zoom.
 *
 * The picker lives in a fixed 280px gutter (`MapMakerPage`), so the count is a
 * table rather than a measurement — the widths are known and the panel does not
 * resize. A ground cell is 56·zoom wide, so three of them stop fitting at 2×
 * and only one fits at 4×; foreground cells are half as wide and keep a column
 * longer. Growing the gutter instead was the other option on the card, and it
 * costs browsing width in the common case to serve the rarest zoom.
 *
 * Change these together with the gutter width, or cells overflow their row.
 */
const COLS_BY_ZOOM: Record<PickerZoom, { background: number; foreground: number }> = {
  1: { background: 3, foreground: 3 },
  2: { background: 2, foreground: 3 },
  4: { background: 1, foreground: 2 }
}

/**
 * The grid geometry at one zoom: how many columns, how big a thumbnail box, and
 * the row height the virtualizer must be told about.
 *
 * All four move together. Changing the column count without the row height
 * produces overlapping or clipped rows rather than a visible error, which is
 * why they are computed in one place instead of read from four constants.
 */
export function pickerGeometry(
  isBackground: boolean,
  zoom: PickerZoom
): { cols: number; thumbW: number; thumbH: number; rowH: number } {
  const native = isBackground ? NATIVE.background : NATIVE.foreground
  const thumbH = native.h * zoom
  return {
    cols: COLS_BY_ZOOM[zoom][isBackground ? 'background' : 'foreground'],
    thumbW: native.w * zoom,
    thumbH,
    rowH: thumbH + LABEL_BLOCK
  }
}

// ── Component ────────────────────────────────────────────────────────────────

const TilePicker: React.FC<Props> = ({
  clientPath,
  activeLayer,
  selectedTileId,
  selectedTileIds,
  onSelectTile,
  onSelectTiles,
  onLayerChange
}) => {
  const [assets, setAssets] = useState<MapAssets | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const lastClickedRef = useRef<number | null>(null)
  const [bgBitmaps, setBgBitmaps] = useState<Map<number, ImageBitmap>>(new Map())
  const [fgEntryIds, setFgEntryIds] = useState<number[]>([])
  const [fgBitmaps, setFgBitmaps] = useState<Map<number, ImageBitmap>>(new Map())
  const parentRef = useRef<HTMLDivElement>(null)
  // Component state, like every other zoom in the app (ForgePanel, the map
  // canvas, LftPreview, ArtPickerDialog). Persisting it is five coordinated
  // edits across the settings store and the main-process schema, and the card
  // leaves it undecided — see HTOO-334.
  const [zoom, setZoom] = useState<PickerZoom>(1)

  // Load assets
  useEffect(() => {
    if (!clientPath) return
    setLoading(true)
    loadMapAssets(clientPath)
      .then((a) => {
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
    return () => {
      cancelled = true
    }
  }, [assets, activeLayer])

  // Lazy-load foreground bitmaps as needed
  const loadFgBitmap = useCallback(
    async (tileId: number) => {
      if (!assets || fgBitmaps.has(tileId)) return
      const bm = await getStcBitmap(tileId, assets)
      if (bm) setFgBitmaps((prev) => new Map(prev).set(tileId, bm))
    },
    [assets, fgBitmaps]
  )

  const isBg = activeLayer === 'background'

  // Filter tile IDs
  const tileIds = useMemo(() => {
    const ids = isBg
      ? Array.from({ length: (assets?.groundTileCount ?? 0) + 1 }, (_, i) => i)
      : fgEntryIds
    if (!filter.trim()) return ids
    const q = filter.trim()
    return ids.filter((id) => String(id).includes(q))
  }, [isBg, assets, fgEntryIds, filter])

  // Columns, cell size and the virtualizer's row height all move together with
  // the zoom. Change one alone and rows overlap or clip rather than erroring.
  const { cols, thumbW, thumbH, rowH } = pickerGeometry(isBg, zoom)

  const rowCount = Math.ceil(tileIds.length / cols)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowH,
    overscan: 8
  })

  // `estimateSize` is a closure over `rowH`, so a zoom change needs an explicit
  // re-measure — without it the virtualizer keeps positioning rows at the old
  // height and they overlap.
  useEffect(() => {
    virtualizer.measure()
  }, [rowH, cols, virtualizer])

  // Scroll to selected tile when it changes (e.g. eyedropper sample), and keep
  // it in view across a zoom change — the row it sits in moves.
  useEffect(() => {
    if (selectedTileId <= 0) return
    const idx = tileIds.indexOf(selectedTileId)
    if (idx < 0) return
    const row = Math.floor(idx / cols)
    virtualizer.scrollToIndex(row, { align: 'center' })
  }, [selectedTileId, tileIds, cols, rowH, virtualizer])

  // Multi-select click handler
  const handleTileClick = useCallback(
    (tileId: number, e: React.MouseEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Toggle individual tile
        const next = selectedTileIds.includes(tileId)
          ? selectedTileIds.filter((id) => id !== tileId)
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
    },
    [tileIds, selectedTileIds, onSelectTile, onSelectTiles]
  )

  if (!clientPath) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography
          variant="caption"
          sx={{
            color: 'text.disabled'
          }}
        >
          Set a client path in Settings to browse tiles.
        </Typography>
      </Box>
    )
  }

  if (loading) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary'
          }}
        >
          Loading tile assets...
        </Typography>
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
          // No `Mui-selected` override — see MapMakerPage's toolBtnSx (HTOO-341).
          sx={{
            '& .MuiToggleButton-root': { color: 'text.primary' }
          }}
        >
          <ToggleButton value="background" sx={{ fontSize: '0.7rem', py: 0.25 }}>
            BG
          </ToggleButton>
          <ToggleButton value="leftForeground" sx={{ fontSize: '0.7rem', py: 0.25 }}>
            L-FG
          </ToggleButton>
          <ToggleButton value="rightForeground" sx={{ fontSize: '0.7rem', py: 0.25 }}>
            R-FG
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {/* Filter */}
      <Box sx={{ px: 1, py: 0.5 }}>
        <FilterField placeholder="Filter by ID..." value={filter} onChange={setFilter} fullWidth />
      </Box>
      {/* Count + zoom */}
      <Box sx={{ px: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            flex: 1
          }}
        >
          {tileIds.length} tiles
        </Typography>
        <ToggleButtonGroup
          value={zoom}
          exclusive
          onChange={(_, v: PickerZoom | null) => v && setZoom(v)}
          size="small"
          sx={{ '& .MuiToggleButton-root': { color: 'text.primary', py: 0, px: 0.75 } }}
        >
          {PICKER_ZOOMS.map((z) => (
            <ToggleButton key={z} value={z} sx={{ fontSize: '0.65rem' }}>
              {z}×
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
      {/* Tile grid */}
      <Box ref={parentRef} sx={{ flex: 1, overflow: 'auto', px: 0.5 }}>
        <Box sx={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vr) => {
            const startIdx = vr.index * cols
            return (
              <Box
                key={vr.index}
                sx={{
                  position: 'absolute',
                  top: vr.start,
                  height: vr.size,
                  width: '100%',
                  display: 'flex',
                  gap: `${CELL_PAD}px`
                }}
              >
                {Array.from({ length: cols }, (_, col) => {
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
                      thumbW={thumbW}
                      thumbH={thumbH}
                      zoom={zoom}
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
  thumbW: number
  thumbH: number
  zoom: PickerZoom
  onClick: (e: React.MouseEvent) => void
  onVisible?: () => void
}> = ({ tileId, isSelected, bitmap, rowH, thumbW, thumbH, zoom, onClick, onVisible }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const loadedRef = useRef(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewPos, setPreviewPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  /**
   * How large this tile is actually drawn.
   *
   * Capped at `zoom` rather than fitted to the box, so a small tile is drawn at
   * the zoom asked for instead of being stretched to fill its cell. A tile too
   * tall for the box — a full-height wall — still shrinks, which is what the
   * hover preview below is for.
   */
  const scale = bitmap ? Math.min(zoom, thumbW / bitmap.width, thumbH / bitmap.height) : zoom

  // Offer the popup exactly when the cell could not honour the zoom.
  const isOversized = bitmap ? scale < zoom : false

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
      canvas.width = thumbW
      canvas.height = thumbH
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = 'rgba(255,255,255,0.06)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'
      ctx.lineWidth = 1
      ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1)
      // Small diamond in center
      const cx = canvas.width / 2,
        cy = canvas.height / 2,
        r = 4
      ctx.beginPath()
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r, cy)
      ctx.lineTo(cx, cy + r)
      ctx.lineTo(cx - r, cy)
      ctx.closePath()
      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      ctx.fill()
      return
    }

    const dw = Math.round(bitmap.width * scale)
    const dh = Math.round(bitmap.height * scale)
    canvas.width = dw
    canvas.height = dh
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false // point-filtered: the pixels stay crisp
    ctx.clearRect(0, 0, dw, dh)
    ctx.drawImage(bitmap, 0, 0, dw, dh)
  }, [bitmap, scale, thumbW, thumbH])

  /**
   * How large the hover popup draws a tile the grid had to shrink.
   *
   * At least 2×, so the popup stays useful at 1× where it was already fixed at
   * 2×; at least the grid's own zoom, so it never doubles up into something
   * smaller than the cell beside it. Then clamped to the window, because a
   * full-height wall at 4× is taller than the screen.
   */
  const previewScale = useMemo(() => {
    if (!bitmap) return 2
    const wanted = Math.max(2, zoom)
    const fits = (window.innerHeight - 40) / bitmap.height
    return Math.max(1, Math.min(wanted, fits))
  }, [bitmap, zoom])

  // Draw the enlarged preview on hover
  useEffect(() => {
    if (!showPreview || !bitmap || !previewRef.current) return
    const canvas = previewRef.current
    const dw = Math.round(bitmap.width * previewScale)
    const dh = Math.round(bitmap.height * previewScale)
    canvas.width = dw
    canvas.height = dh
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(bitmap, 0, 0, dw, dh)
  }, [showPreview, bitmap, previewScale])

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent) => {
      if (!bitmap || !isOversized) return
      setPreviewPos({ x: e.clientX, y: e.clientY })
      setShowPreview(true)
    },
    [bitmap, isOversized]
  )

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
          overflow: 'hidden'
        }}
      >
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <canvas ref={canvasRef} style={{ imageRendering: 'pixelated' }} />
        </Box>
        <Typography
          variant="caption"
          sx={{ fontSize: '0.65rem', color: 'text.secondary', lineHeight: 1.4 }}
        >
          {tileId}
        </Typography>
      </Box>

      {/* Hover preview for oversized tiles */}
      {showPreview && bitmap && (
        <Box
          sx={{
            position: 'fixed',
            left: previewPos.x + 16,
            // Centred on the cursor, then pushed inside the window. The popup
            // grows with the zoom, so anchoring it on the tile's native height
            // alone would hang it off the bottom at 4×.
            top: Math.min(
              Math.max(8, previewPos.y - (bitmap.height * previewScale) / 2),
              Math.max(8, window.innerHeight - bitmap.height * previewScale - 32)
            ),
            zIndex: 9999,
            pointerEvents: 'none',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            bgcolor: 'background.paper',
            p: 0.5,
            boxShadow: 4
          }}
        >
          <canvas ref={previewRef} style={{ imageRendering: 'pixelated', display: 'block' }} />
          <Typography
            variant="caption"
            sx={{
              fontSize: '0.6rem',
              color: 'text.secondary',
              display: 'block',
              textAlign: 'center',
              mt: 0.25
            }}
          >
            {bitmap.width}×{bitmap.height} — tile {tileId}
          </Typography>
        </Box>
      )}
    </>
  )
}

export default TilePicker
