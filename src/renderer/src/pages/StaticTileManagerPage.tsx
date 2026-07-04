import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Typography,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  TextField,
  MenuItem,
  Chip,
  Divider,
  Stack,
  Alert,
  IconButton,
  Tooltip
} from '@mui/material'
import ImageIcon from '@mui/icons-material/Image'
import SaveIcon from '@mui/icons-material/Save'
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import RefreshIcon from '@mui/icons-material/Refresh'
import { useSettingsStore } from '../store/settingsStore'
import { useUiStore } from '../store/uiStore'
import { useTransientStatus } from '../hooks/useTransientStatus'
import { StatusMessage } from '../components/shared/StatusMessage'
import { EmptyStateSettings } from '../components/shared/EmptyStateSettings'
import { WorkingDirToolbar } from '../components/shared/WorkingDirToolbar'
import { loadPixelBufferFromPath, pixelBufferToPngBytes } from '../utils/imageLoader'
import { PixelBuffer } from '../utils/duotone'
import {
  convertOrthoTile,
  resampleTile,
  TileLayer,
  TileScale,
  CornerMode
} from '../utils/tileConvert'
import { detectOrientation, Orientation } from '../utils/orientationDetect'
import { sliceGrid } from '../utils/gridSlice'
import {
  nextWallId,
  wallWalkability,
  isMintableWallId,
  WALL_ID_MINT_MIN,
  WALL_ID_MINT_MAX,
  Walkability
} from '../utils/wallIdAllocator'
import { legacyWallHeight } from '../utils/wallHeight'
import {
  loadMapAssets,
  drawDiamond,
  GROUND_TILE_WIDTH,
  GROUND_TILE_HEIGHT
} from '../utils/mapRenderer'
import type { MapAssets } from '../utils/mapRenderer'
import { staticTilesKind } from '../packKinds/staticTiles'
import { nextSlotId } from '../packKinds/helpers'
import type { PackProject, PackAsset } from '../packKinds/types'

interface PackSummary {
  filename: string
  pack_id: string
  pack_version: string
  content_type: string
}

type OrientationChoice = 'auto' | Orientation
type WallMode = 'mint' | 'replace'
type PassabilityPref = 'any' | 'blocking' | 'passable'

const PREVIEW_SCALE = 5

/** Paint a PixelBuffer into a canvas at an integer display scale, crisp. */
function paintBuffer(
  canvas: HTMLCanvasElement | null,
  buf: PixelBuffer | null,
  displayScale: number,
  overlayDiamond: boolean
): void {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = buf?.width ?? 1
  const h = buf?.height ?? 1
  canvas.width = Math.max(1, w * displayScale)
  canvas.height = Math.max(1, h * displayScale)
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!buf) return
  const tmp = document.createElement('canvas')
  tmp.width = w
  tmp.height = h
  const tctx = tmp.getContext('2d')
  if (!tctx) return
  const img = tctx.createImageData(w, h)
  img.data.set(buf.data)
  tctx.putImageData(img, 0, 0)
  ctx.drawImage(tmp, 0, 0, w, h, 0, 0, canvas.width, canvas.height)
  if (overlayDiamond) {
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.75)'
    ctx.lineWidth = 1
    drawDiamond(
      ctx,
      (GROUND_TILE_WIDTH / 2) * displayScale,
      (GROUND_TILE_HEIGHT / 2) * displayScale,
      displayScale
    )
    ctx.stroke()
  }
}

const WALKABILITY_COLOR: Record<Walkability, 'success' | 'error' | 'default'> = {
  passable: 'success',
  blocking: 'error',
  unknown: 'default'
}

const StaticTileManagerPage: React.FC = () => {
  const packDir = useSettingsStore((s) => s.packDir)
  const setPackDir = useSettingsStore((s) => s.setPackDir)
  const clientPath = useSettingsStore((s) => s.clientPath)
  const setCurrentPage = useUiStore((s) => s.setCurrentPage)
  const [statusMessage, showStatus] = useTransientStatus()

  // ── Source ────────────────────────────────────────────────────────────────
  const [sourceImage, setSourceImage] = useState<PixelBuffer | null>(null)
  const [sourcePath, setSourcePath] = useState<string>('')
  const [inputMode, setInputMode] = useState<'loose' | 'grid'>('loose')
  const [cellW, setCellW] = useState(32)
  const [cellH, setCellH] = useState(32)
  const [marginX, setMarginX] = useState(0)
  const [marginY, setMarginY] = useState(0)
  const [spacingX, setSpacingX] = useState(0)
  const [spacingY, setSpacingY] = useState(0)
  const [cellIndex, setCellIndex] = useState(0)

  // ── Conversion params ───────────────────────────────────────────────────────
  const [layer, setLayer] = useState<TileLayer>('floor')
  const [scale, setScale] = useState<TileScale>(1)
  const [corner, setCorner] = useState<CornerMode>('wrap')
  const [orientationChoice, setOrientationChoice] = useState<OrientationChoice>('auto')

  // ── Target pack ─────────────────────────────────────────────────────────────
  const [packs, setPacks] = useState<PackSummary[]>([])
  const [selectedPack, setSelectedPack] = useState<string>('')
  const [project, setProject] = useState<PackProject | null>(null)

  // ── Legacy assets (sotp + ia.dat) for wall walkability / height ─────────────
  const [assets, setAssets] = useState<MapAssets | null>(null)

  // ── Wall commit controls ────────────────────────────────────────────────────
  const [wallMode, setWallMode] = useState<WallMode>('mint')
  const [passabilityPref, setPassabilityPref] = useState<PassabilityPref>('any')
  const [wallId, setWallId] = useState<number>(WALL_ID_MINT_MIN)
  const [wallHeightField, setWallHeightField] = useState<number>(GROUND_TILE_HEIGHT)
  const [floorId, setFloorId] = useState<number>(1)

  const srcCanvasRef = useRef<HTMLCanvasElement>(null)
  const outCanvasRef = useRef<HTMLCanvasElement>(null)

  // ── Scan static_tiles packs in the working dir ──────────────────────────────
  const refreshPacks = useCallback(async () => {
    if (!packDir) {
      setPacks([])
      return
    }
    const list = (await window.api.packScan(packDir)) as PackSummary[]
    setPacks(
      list
        .filter((p) => p.content_type === 'static_tiles')
        .sort((a, b) => a.pack_id.localeCompare(b.pack_id))
    )
  }, [packDir])

  useEffect(() => {
    refreshPacks()
  }, [refreshPacks])

  // Load the selected pack project
  useEffect(() => {
    if (!packDir || !selectedPack) {
      setProject(null)
      return
    }
    window.api
      .packLoad(`${packDir}/${selectedPack}`)
      .then((data) => setProject(data as PackProject))
      .catch(() => setProject(null))
  }, [packDir, selectedPack])

  // Load legacy assets (for walls) when the client path is known
  useEffect(() => {
    if (!clientPath) {
      setAssets(null)
      return
    }
    let live = true
    loadMapAssets(clientPath)
      .then((a) => {
        if (live) setAssets(a)
      })
      .catch(() => {
        if (live) setAssets(null)
      })
    return () => {
      live = false
    }
  }, [clientPath])

  const handleSetDir = useCallback(async () => {
    const dir = await window.api.openDirectory()
    if (dir) setPackDir(dir)
  }, [setPackDir])

  const handleImport = useCallback(async () => {
    const path = await window.api.openFile([{ name: 'PNG image', extensions: ['png'] }])
    if (!path) return
    try {
      const buf = await loadPixelBufferFromPath(path)
      setSourceImage(buf)
      setSourcePath(path)
      setCellIndex(0)
      showStatus(`Loaded ${buf.width}×${buf.height} source`)
    } catch (e) {
      showStatus(`Load failed: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }, [showStatus])

  // ── Derived: sliced cells + selected preview cell ───────────────────────────
  const cells = useMemo<PixelBuffer[]>(() => {
    if (!sourceImage) return []
    if (inputMode === 'grid') {
      if (cellW <= 0 || cellH <= 0) return []
      try {
        return sliceGrid(sourceImage, { cellW, cellH, marginX, marginY, spacingX, spacingY }).map(
          (c) => c.buffer
        )
      } catch {
        return []
      }
    }
    return [sourceImage]
  }, [sourceImage, inputMode, cellW, cellH, marginX, marginY, spacingX, spacingY])

  const previewCell = cells.length > 0 ? cells[Math.min(cellIndex, cells.length - 1)] : null

  const detected = useMemo(
    () => (previewCell ? detectOrientation(previewCell) : null),
    [previewCell]
  )
  const effectiveOrientation: Orientation =
    orientationChoice === 'auto' ? (detected?.orientation ?? 'orthogonal') : orientationChoice

  // ── Derived: converted output ───────────────────────────────────────────────
  const converted = useMemo<PixelBuffer | null>(() => {
    if (!previewCell) return null
    const opts = {
      layer,
      scale,
      corner,
      wallHeight: layer === 'wall' ? wallHeightField : undefined
    }
    return effectiveOrientation === 'orthogonal'
      ? convertOrthoTile(previewCell, opts)
      : resampleTile(previewCell, opts)
  }, [previewCell, layer, scale, corner, wallHeightField, effectiveOrientation])

  // Paint previews
  useEffect(() => {
    paintBuffer(srcCanvasRef.current, previewCell, PREVIEW_SCALE, false)
  }, [previewCell])
  useEffect(() => {
    paintBuffer(outCanvasRef.current, converted, PREVIEW_SCALE, layer === 'floor')
  }, [converted, layer])

  // ── Used ids for the loaded pack ────────────────────────────────────────────
  const usedIds = useMemo(() => {
    const floor = new Set<number>()
    const wall = new Set<number>()
    for (const a of project?.assets ?? []) {
      const slot = staticTilesKind.parseSlot?.(a.filename)
      if (!slot) continue
      if (slot.namespace === 'floor') floor.add(slot.id)
      else if (slot.namespace === 'wall') wall.add(slot.id)
    }
    return { floor, wall }
  }, [project])

  // Suggest the next floor id when the pack changes
  useEffect(() => {
    if (!project) return
    setFloorId(nextSlotId(project.assets, staticTilesKind.parseSlot!, { namespace: 'floor' }))
  }, [project])

  // Suggest the next wall id when minting (pack / passability / table changes)
  useEffect(() => {
    if (layer !== 'wall' || wallMode !== 'mint') return
    const id = nextWallId({
      used: usedIds.wall,
      sotp: assets?.sotpTable ?? null,
      passability: passabilityPref === 'any' ? undefined : passabilityPref
    })
    if (id !== null) setWallId(id)
  }, [layer, wallMode, usedIds.wall, assets, passabilityPref])

  // Auto-derive height for replacement walls from the decoded HPF
  useEffect(() => {
    if (layer !== 'wall') return
    if (wallMode === 'replace' && assets) {
      const h = legacyWallHeight(assets, wallId)
      if (h !== null) {
        setWallHeightField(h)
        return
      }
    }
    // fall back to the source cell height for mint / no-legacy
    if (previewCell) setWallHeightField(previewCell.height)
  }, [layer, wallMode, wallId, assets, previewCell])

  const wallWalk: Walkability = wallWalkability(assets?.sotpTable ?? null, wallId)

  // ── Commit the previewed tile into the pack ─────────────────────────────────
  const [committing, setCommitting] = useState(false)
  const commit = useCallback(async () => {
    if (!packDir || !project || !selectedPack || !converted) return
    const id = layer === 'wall' ? wallId : floorId
    if (!Number.isInteger(id) || id <= 0) {
      showStatus('Enter a valid tile id')
      return
    }
    if (layer === 'wall' && !isMintableWallId(id)) {
      showStatus(`Wall id must be ${WALL_ID_MINT_MIN}–${WALL_ID_MINT_MAX}`)
      return
    }
    const used = layer === 'wall' ? usedIds.wall : usedIds.floor
    const overwriting = used.has(id)
    if (overwriting && !(layer === 'wall' && wallMode === 'replace')) {
      showStatus(`${layer}${String(id).padStart(5, '0')} already exists in this pack`)
      return
    }
    setCommitting(true)
    try {
      const filename = `${layer}${String(id).padStart(5, '0')}.png`
      const bytes = await pixelBufferToPngBytes(converted)
      const assetsDir = `${packDir}/${project.pack_id}`
      await window.api.ensureDir(assetsDir)
      await window.api.writeBytes(`${assetsDir}/${filename}`, bytes)

      const asset: PackAsset = { filename, sourcePath }
      const nextAssets = project.assets.some((a) => a.filename === filename)
        ? project.assets.map((a) => (a.filename === filename ? asset : a))
        : [...project.assets, asset]
      const updated: PackProject = {
        ...project,
        assets: nextAssets,
        updatedAt: new Date().toISOString()
      }
      await window.api.packSave(`${packDir}/${selectedPack}`, updated)
      setProject(updated)
      showStatus(`Committed ${filename} (${converted.width}×${converted.height})`)
      // advance to the next cell / next id for a smoother batch-by-hand flow
      if (inputMode === 'grid' && cellIndex < cells.length - 1) setCellIndex((i) => i + 1)
    } catch (e) {
      showStatus(`Commit failed: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setCommitting(false)
    }
  }, [
    packDir,
    project,
    selectedPack,
    converted,
    layer,
    wallId,
    floorId,
    usedIds,
    wallMode,
    sourcePath,
    inputMode,
    cellIndex,
    cells.length,
    showStatus
  ])

  if (!packDir) {
    return (
      <EmptyStateSettings
        title="Static Tile Manager"
        description="Set an asset-pack working directory in Settings to import and convert tiles."
        onOpenSettings={() => setCurrentPage('settings')}
      />
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WorkingDirToolbar dir={packDir} onChangeDir={handleSetDir}>
        <StatusMessage message={statusMessage} />
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
          {packs.length} static_tiles pack{packs.length !== 1 ? 's' : ''}
        </Typography>
        <Tooltip title="Rescan packs">
          <IconButton size="small" onClick={refreshPacks}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </WorkingDirToolbar>

      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: source + conversion controls */}
        <Box
          sx={{
            width: 320,
            flexShrink: 0,
            borderRight: '1px solid',
            borderColor: 'divider',
            overflow: 'auto',
            p: 2
          }}
        >
          <Stack spacing={2}>
            <Button variant="contained" startIcon={<ImageIcon />} onClick={handleImport} fullWidth>
              Import image…
            </Button>

            <Box>
              <Typography variant="overline" color="text.secondary">
                Input mode
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                fullWidth
                value={inputMode}
                onChange={(_, v) => v && setInputMode(v)}
              >
                <ToggleButton value="loose">Loose</ToggleButton>
                <ToggleButton value="grid">Grid sheet</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {inputMode === 'grid' && (
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <TextField
                  size="small"
                  label="Cell W"
                  type="number"
                  value={cellW}
                  onChange={(e) => setCellW(Number(e.target.value))}
                />
                <TextField
                  size="small"
                  label="Cell H"
                  type="number"
                  value={cellH}
                  onChange={(e) => setCellH(Number(e.target.value))}
                />
                <TextField
                  size="small"
                  label="Margin X"
                  type="number"
                  value={marginX}
                  onChange={(e) => setMarginX(Number(e.target.value))}
                />
                <TextField
                  size="small"
                  label="Margin Y"
                  type="number"
                  value={marginY}
                  onChange={(e) => setMarginY(Number(e.target.value))}
                />
                <TextField
                  size="small"
                  label="Spacing X"
                  type="number"
                  value={spacingX}
                  onChange={(e) => setSpacingX(Number(e.target.value))}
                />
                <TextField
                  size="small"
                  label="Spacing Y"
                  type="number"
                  value={spacingY}
                  onChange={(e) => setSpacingY(Number(e.target.value))}
                />
              </Box>
            )}

            <Divider />

            <Box>
              <Typography variant="overline" color="text.secondary">
                Layer
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                fullWidth
                value={layer}
                onChange={(_, v) => v && setLayer(v)}
              >
                <ToggleButton value="floor">Floor</ToggleButton>
                <ToggleButton value="wall">Wall</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Box>
              <Typography variant="overline" color="text.secondary">
                Scale
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                fullWidth
                value={scale}
                onChange={(_, v) => v && setScale(v)}
              >
                <ToggleButton value={1}>1×</ToggleButton>
                <ToggleButton value={2}>2×</ToggleButton>
              </ToggleButtonGroup>
              {scale === 2 && (
                <Typography variant="caption" color="warning.main">
                  2× is author-ahead — renders only after the client virtual-resolution rebase.
                </Typography>
              )}
            </Box>

            <Box>
              <Typography variant="overline" color="text.secondary">
                Orientation
              </Typography>
              <TextField
                select
                size="small"
                fullWidth
                value={orientationChoice}
                onChange={(e) => setOrientationChoice(e.target.value as OrientationChoice)}
              >
                <MenuItem value="auto">Auto{detected ? ` — ${detected.orientation}` : ''}</MenuItem>
                <MenuItem value="orthogonal">Orthogonal (project → iso)</MenuItem>
                <MenuItem value="isometric">Isometric (normalize only)</MenuItem>
              </TextField>
              {detected && orientationChoice === 'auto' && (
                <Typography variant="caption" color="text.disabled">
                  detected {detected.orientation} ({Math.round(detected.confidence * 100)}%
                  confidence)
                </Typography>
              )}
            </Box>

            {layer === 'floor' && effectiveOrientation === 'orthogonal' && (
              <Box>
                <Typography variant="overline" color="text.secondary">
                  Corner fill
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  fullWidth
                  value={corner}
                  onChange={(_, v) => v && setCorner(v)}
                >
                  <ToggleButton value="wrap">Wrap (seamless)</ToggleButton>
                  <ToggleButton value="clamp">Clamp (loose)</ToggleButton>
                </ToggleButtonGroup>
              </Box>
            )}
          </Stack>
        </Box>

        {/* Center: previews */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          {!sourceImage ? (
            <Typography sx={{ color: 'text.disabled' }}>
              Import a PNG (loose tile or grid sheet) to begin.
            </Typography>
          ) : (
            <Stack spacing={2}>
              {inputMode === 'grid' && cells.length > 1 && (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <IconButton
                    size="small"
                    disabled={cellIndex <= 0}
                    onClick={() => setCellIndex((i) => Math.max(0, i - 1))}
                  >
                    <NavigateBeforeIcon />
                  </IconButton>
                  <Typography variant="body2">
                    Cell {cellIndex + 1} / {cells.length}
                  </Typography>
                  <IconButton
                    size="small"
                    disabled={cellIndex >= cells.length - 1}
                    onClick={() => setCellIndex((i) => Math.min(cells.length - 1, i + 1))}
                  >
                    <NavigateNextIcon />
                  </IconButton>
                </Stack>
              )}
              <Stack direction="row" spacing={4} sx={{ flexWrap: 'wrap' }}>
                <Box>
                  <Typography variant="subtitle2">
                    Source {previewCell ? `(${previewCell.width}×${previewCell.height})` : ''}
                  </Typography>
                  <Box
                    component="canvas"
                    ref={srcCanvasRef}
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      imageRendering: 'pixelated'
                    }}
                  />
                </Box>
                <Box>
                  <Typography variant="subtitle2">
                    Converted {converted ? `(${converted.width}×${converted.height})` : ''}
                  </Typography>
                  <Box
                    component="canvas"
                    ref={outCanvasRef}
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      imageRendering: 'pixelated',
                      background:
                        'repeating-conic-gradient(#0000 0% 25%, #8884 0% 50%) 50% / 16px 16px'
                    }}
                  />
                </Box>
              </Stack>
            </Stack>
          )}
        </Box>

        {/* Right: commit */}
        <Box
          sx={{
            width: 300,
            flexShrink: 0,
            borderLeft: '1px solid',
            borderColor: 'divider',
            overflow: 'auto',
            p: 2
          }}
        >
          <Stack spacing={2}>
            <Typography variant="overline" color="text.secondary">
              Commit to pack
            </Typography>
            <TextField
              select
              size="small"
              fullWidth
              label="Target static_tiles pack"
              value={selectedPack}
              onChange={(e) => setSelectedPack(e.target.value)}
            >
              {packs.length === 0 && (
                <MenuItem value="" disabled>
                  No static_tiles packs — create one in Asset Pack Manager
                </MenuItem>
              )}
              {packs.map((p) => (
                <MenuItem key={p.filename} value={p.filename}>
                  {p.pack_id} (v{p.pack_version})
                </MenuItem>
              ))}
            </TextField>

            {layer === 'floor' ? (
              <TextField
                size="small"
                fullWidth
                label="Floor tile id"
                type="number"
                value={floorId}
                onChange={(e) => setFloorId(Number(e.target.value))}
                helperText="Floors are unconstrained server-side (1–65535)."
              />
            ) : (
              <>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  fullWidth
                  value={wallMode}
                  onChange={(_, v) => v && setWallMode(v)}
                >
                  <ToggleButton value="mint">Mint new</ToggleButton>
                  <ToggleButton value="replace">Replace legacy</ToggleButton>
                </ToggleButtonGroup>

                {wallMode === 'mint' && (
                  <TextField
                    select
                    size="small"
                    fullWidth
                    label="Walkability preference"
                    value={passabilityPref}
                    onChange={(e) => setPassabilityPref(e.target.value as PassabilityPref)}
                    helperText={
                      assets?.sotpTable
                        ? 'Picks the next free id whose legacy sotp byte matches.'
                        : 'No sotp.dat loaded — range-only allocation.'
                    }
                  >
                    <MenuItem value="any">Any</MenuItem>
                    <MenuItem value="blocking">Blocking</MenuItem>
                    <MenuItem value="passable">Passable</MenuItem>
                  </TextField>
                )}

                <TextField
                  size="small"
                  fullWidth
                  label="Wall tile id"
                  type="number"
                  value={wallId}
                  onChange={(e) => setWallId(Number(e.target.value))}
                  error={!isMintableWallId(wallId)}
                  helperText={`Mintable window ${WALL_ID_MINT_MIN}–${WALL_ID_MINT_MAX}`}
                />

                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Typography variant="body2">Walkability:</Typography>
                  <Chip size="small" label={wallWalk} color={WALKABILITY_COLOR[wallWalk]} />
                </Stack>

                <TextField
                  size="small"
                  fullWidth
                  label="Wall height (1×, px)"
                  type="number"
                  value={wallHeightField}
                  onChange={(e) => setWallHeightField(Number(e.target.value))}
                  helperText={
                    wallMode === 'replace'
                      ? 'Auto-derived from the decoded legacy HPF; match it exactly.'
                      : 'Pack-only ids carry no height constraint.'
                  }
                />
              </>
            )}

            {layer === 'wall' && wallMode === 'replace' && !clientPath && (
              <Alert severity="info" sx={{ py: 0 }}>
                Set a client path in Settings to auto-derive legacy wall heights and walkability.
              </Alert>
            )}

            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              disabled={!converted || !selectedPack || committing}
              onClick={commit}
              fullWidth
            >
              Commit tile
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  )
}

export default StaticTileManagerPage
