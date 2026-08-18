import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Autocomplete,
  Box,
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import GridOnIcon from '@mui/icons-material/GridOn'
import ZoomInIcon from '@mui/icons-material/ZoomIn'
import ZoomOutIcon from '@mui/icons-material/ZoomOut'
import TilePositionFields from './TilePositionFields'
import MapRenderCanvas from '../mapeditor/MapRenderCanvas'
import type { MapMarker } from '../mapeditor/MapRenderCanvas'
import { useSettingsStore, useMapFilesDirectory } from '../../store/settingsStore'
import { useWorldIndex } from '../../hooks/useWorldIndex'
import type { MapWarp } from '../../data/mapData'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface WarpDialogProps {
  open: boolean
  tileX: number
  tileY: number
  initial: MapWarp | null
  mapNames: string[]
  worldMapNames: string[]
  onConfirm: (warp: MapWarp) => void
  onCancel: () => void
  /**
   * When set, hides the Warp Type selector and fixes the target type.
   * Use 'map' for world map point editing (always a map destination).
   */
  lockType?: 'map' | 'worldmap'
  /**
   * Sets the initial target type when initial is null and lockType is not set.
   * Useful for pre-selecting 'worldmap' when placing a world-exit warp.
   */
  defaultType?: 'map' | 'worldmap'
  /**
   * When provided, adds a "Display Name" field above the type selector.
   * Used for world map point labels.
   */
  pointDisplayName?: string
  onPointDisplayNameChange?: (name: string) => void
  /**
   * When provided, the warp's own position becomes editable (HTOO-412 for a
   * world map point, HTOO-441 for a map warp). `tileX`/`tileY` carry it; this
   * is the way back.
   *
   * Distinct from Arrival X/Y, which is where the player lands on the
   * destination map. `positionNoun` says which is which, because the two were
   * easy to confuse when only one pair was on screen.
   */
  onPositionChange?: (x: number, y: number) => void
  /** Upper bounds for the position fields, inclusive. */
  maxX?: number
  maxY?: number
  /** What the position addresses: 'Tile' on a map, 'Field' on a world map. */
  positionNoun?: string
  /**
   * Whether this dialog edits an existing warp. Not the same as `initial` being
   * set: a duplicate arrives with every field filled in and is still a
   * placement (HTOO-443). Defaults to `initial !== null`.
   */
  isEdit?: boolean
}

// ── Zoom helpers ──────────────────────────────────────────────────────────────

const MINI_ZOOM_LEVELS = [0.08, 0.12, 0.18, 0.25, 0.35, 0.5, 0.7, 1.0, 1.4]

function bestMiniZoomIdx(mapW: number, mapH: number): number {
  const isoW = (mapW + mapH) * 28
  const isoH = (mapW + mapH) * 14 + 480
  const target = Math.min(740 / isoW, 400 / isoH, 1.4)
  return MINI_ZOOM_LEVELS.reduce(
    (best, lvl, i) =>
      Math.abs(lvl - target) < Math.abs(MINI_ZOOM_LEVELS[best]! - target) ? i : best,
    0
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WarpDialog({
  open,
  tileX,
  tileY,
  initial,
  mapNames,
  worldMapNames,
  onConfirm,
  onCancel,
  lockType,
  defaultType,
  pointDisplayName,
  onPointDisplayNameChange,
  onPositionChange,
  maxX = 639,
  maxY = 479,
  positionNoun = 'Field',
  isEdit
}: WarpDialogProps) {
  const clientPath = useSettingsStore((s) => s.clientPath)
  const mapDirectory = useMapFilesDirectory()
  const { index } = useWorldIndex()
  // Memoised because the `?? []` fallback is a fresh array on every render,
  // which would re-run the effect below on every render while no index is loaded.
  const mapDetails = useMemo(() => index?.mapDetails ?? [], [index])

  const effectiveDefault = lockType ?? initial?.targetType ?? defaultType ?? 'map'

  const [targetType, setTargetType] = useState<'map' | 'worldmap'>(effectiveDefault)
  const [mapTargetName, setMapTargetName] = useState(initial?.mapTargetName ?? '')
  const [mapTargetX, setMapTargetX] = useState(String(initial?.mapTargetX ?? 0))
  const [mapTargetY, setMapTargetY] = useState(String(initial?.mapTargetY ?? 0))
  const [worldMapTarget, setWorldMapTarget] = useState(initial?.worldMapTarget ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [showRestrict, setShowRestrict] = useState(false)
  const [levelReq, setLevelReq] = useState(String(initial?.restrictions?.level ?? ''))
  const [abilityReq, setAbilityReq] = useState(String(initial?.restrictions?.ability ?? ''))
  const [abReq, setAbReq] = useState(String(initial?.restrictions?.ab ?? ''))

  const [miniZoomIdx, setMiniZoomIdx] = useState(3)
  const [miniGrid, setMiniGrid] = useState(false)
  const [miniPassability, setMiniPassability] = useState(false)

  useEffect(() => {
    if (!open) return
    setTargetType(lockType ?? initial?.targetType ?? defaultType ?? 'map')
    setMapTargetName(initial?.mapTargetName ?? '')
    setMapTargetX(String(initial?.mapTargetX ?? 0))
    setMapTargetY(String(initial?.mapTargetY ?? 0))
    setWorldMapTarget(initial?.worldMapTarget ?? '')
    setDescription(initial?.description ?? '')
    setLevelReq(String(initial?.restrictions?.level ?? ''))
    setAbilityReq(String(initial?.restrictions?.ability ?? ''))
    setAbReq(String(initial?.restrictions?.ab ?? ''))
    setShowRestrict(!!initial?.restrictions)
    setMiniGrid(false)
    setMiniPassability(false)
    const initName = initial?.mapTargetName?.trim().toLowerCase()
    const initDest = initName
      ? mapDetails.find((m) => m.name.toLowerCase() === initName)
      : undefined
    setMiniZoomIdx(initDest ? bestMiniZoomIdx(initDest.x, initDest.y) : 3)
  }, [open, initial]) // eslint-disable-line react-hooks/exhaustive-deps

  const prevDestNameRef = useRef('')
  useEffect(() => {
    const name = mapTargetName.trim().toLowerCase()
    if (name && name !== prevDestNameRef.current) {
      prevDestNameRef.current = name
      const dest = mapDetails.find((m) => m.name.toLowerCase() === name)
      if (dest) setMiniZoomIdx(bestMiniZoomIdx(dest.x, dest.y))
    }
  }, [mapTargetName, mapDetails])

  const destDetail =
    targetType === 'map' && mapTargetName.trim()
      ? mapDetails.find((m) => m.name.toLowerCase() === mapTargetName.trim().toLowerCase())
      : undefined

  const miniZoom = MINI_ZOOM_LEVELS[miniZoomIdx] ?? 0.25
  const arrivalMarker: MapMarker[] = destDetail
    ? [
        {
          kind: 'warp',
          index: 0,
          x: parseInt(mapTargetX, 10) || 0,
          y: parseInt(mapTargetY, 10) || 0
        }
      ]
    : []

  const buildRestrictions = (): MapWarp['restrictions'] | undefined => {
    if (!showRestrict) return undefined
    const r: MapWarp['restrictions'] = {}
    if (levelReq) r.level = parseInt(levelReq, 10)
    if (abilityReq) r.ability = parseInt(abilityReq, 10)
    if (abReq) r.ab = parseInt(abReq, 10)
    return Object.keys(r).length ? r : undefined
  }

  const handleConfirm = () => {
    const warp: MapWarp = {
      x: tileX,
      y: tileY,
      targetType,
      description: description.trim() || undefined,
      restrictions: buildRestrictions()
    }
    if (targetType === 'map') {
      warp.mapTargetName = mapTargetName.trim()
      warp.mapTargetX = parseInt(mapTargetX, 10) || 0
      warp.mapTargetY = parseInt(mapTargetY, 10) || 0
    } else {
      warp.worldMapTarget = worldMapTarget.trim()
    }
    onConfirm(warp)
  }

  /**
   * The destination map, big.
   *
   * Hoisted out of the form column so the two can sit side by side: picking a
   * warp target means aiming at a tile, and the preview is the one part of this
   * dialog that benefits from space (HTOO-340). It fills the free width and
   * height of the right-hand column, while the fields keep a readable fixed
   * width — so growing the window grows the map rather than the whitespace.
   */
  const destinationPreview =
    targetType === 'map' && destDetail ? (
      <Box
        sx={{
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 1,
            py: 0.5,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'action.hover'
          }}
        >
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              flex: 1
            }}
          >
            Click map to set arrival tile
          </Typography>
          <Tooltip title="Zoom out">
            <span>
              <IconButton
                size="small"
                onClick={() => setMiniZoomIdx((i) => Math.max(0, i - 1))}
                disabled={miniZoomIdx === 0}
              >
                <ZoomOutIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Typography variant="caption" sx={{ minWidth: 36, textAlign: 'center' }}>
            {Math.round(miniZoom * 100)}%
          </Typography>
          <Tooltip title="Zoom in">
            <span>
              <IconButton
                size="small"
                onClick={() => setMiniZoomIdx((i) => Math.min(MINI_ZOOM_LEVELS.length - 1, i + 1))}
                disabled={miniZoomIdx === MINI_ZOOM_LEVELS.length - 1}
              >
                <ZoomInIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Tooltip title={miniGrid ? 'Hide grid' : 'Show grid'}>
            <IconButton
              size="small"
              onClick={() => setMiniGrid((v) => !v)}
              color={miniGrid ? 'info' : 'default'}
            >
              <GridOnIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title={miniPassability ? 'Hide passability' : 'Show passability'}>
            <IconButton
              size="small"
              onClick={() => setMiniPassability((v) => !v)}
              color={miniPassability ? 'warning' : 'default'}
            >
              <DirectionsWalkIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Tooltip title="Clear arrival point">
            <IconButton
              size="small"
              onClick={() => {
                setMapTargetX('0')
                setMapTargetY('0')
              }}
            >
              <DeleteIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Box>
        <MapRenderCanvas
          mapId={destDetail.id}
          mapWidth={destDetail.x}
          mapHeight={destDetail.y}
          mapDirectory={mapDirectory}
          clientPath={clientPath}
          zoom={miniZoom}
          markers={arrivalMarker}
          showGrid={miniGrid}
          showPassability={miniPassability}
          placeMode
          onTileClick={(tx, ty) => {
            setMapTargetX(String(tx))
            setMapTargetY(String(ty))
          }}
          sx={{ flex: 1, minHeight: 0, bgcolor: 'background.default' }}
        />
      </Box>
    ) : null

  const canConfirm = targetType === 'map' ? !!mapTargetName.trim() : !!worldMapTarget.trim()
  const isWorldMapPoint = !!lockType

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      // Wide and tall only when there is a map to aim at. A world-map exit has
      // no preview, and an xl dialog around four fields is just a large empty
      // box. `90vh` rather than `fullScreen`: this stays a sub-task, so Cancel
      // reads as dismissal rather than as navigation.
      maxWidth={destinationPreview ? 'xl' : 'md'}
      fullWidth
      slotProps={
        destinationPreview ? { paper: { sx: { height: '90vh', maxHeight: '90vh' } } } : undefined
      }
    >
      <DialogTitle>
        {(isEdit ?? initial !== null)
          ? isWorldMapPoint
            ? 'Edit Point'
            : 'Edit Warp'
          : isWorldMapPoint
            ? 'Place Point'
            : 'Place Warp'}
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            ml: 1
          }}
        >
          ({tileX}, {tileY})
        </Typography>
      </DialogTitle>
      {/* The content region is what scrolls, never the paper — on a short
          window the actions below must stay above the fold. */}
      <DialogContent sx={{ display: 'flex', gap: 2, overflow: 'hidden' }}>
        <Box
          sx={{
            pt: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            // A fixed, readable column beside the map; the whole dialog when
            // there is no map. Its own scrollbar, so a long form cannot push
            // the preview out of view.
            width: destinationPreview ? 380 : '100%',
            flexShrink: 0,
            overflowY: 'auto'
          }}
        >
          {/* Optional display name (world map points) */}
          {onPointDisplayNameChange !== undefined && (
            <TextField
              label="Display Name"
              size="small"
              fullWidth
              autoFocus
              value={pointDisplayName ?? ''}
              onChange={(e) => onPointDisplayNameChange(e.target.value)}
              helperText="Label shown on the world map"
              slotProps={{ htmlInput: { spellCheck: false } }}
            />
          )}

          {/* The warp's own position (HTOO-412, HTOO-441) */}
          {onPositionChange !== undefined && (
            <TilePositionFields
              x={tileX}
              y={tileY}
              maxX={maxX}
              maxY={maxY}
              onChange={onPositionChange}
              noun={positionNoun}
            />
          )}

          {/* Warp type — hidden when lockType is set */}
          {!lockType && (
            <FormControl size="small" fullWidth>
              <InputLabel>Warp Type</InputLabel>
              <Select
                label="Warp Type"
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as 'map' | 'worldmap')}
              >
                <MenuItem value="map">Map Warp</MenuItem>
                <MenuItem value="worldmap">World Map Exit</MenuItem>
              </Select>
            </FormControl>
          )}

          {targetType === 'map' ? (
            <>
              <Autocomplete
                options={mapNames}
                freeSolo
                value={mapTargetName}
                onInputChange={(_, v) => setMapTargetName(v)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Destination Map"
                    size="small"
                    required
                    helperText={
                      destDetail
                        ? `${destDetail.x}×${destDetail.y} tiles — click the map below to set arrival`
                        : 'Map the player arrives on'
                    }
                  />
                )}
              />

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                <TextField
                  label="Arrival X"
                  size="small"
                  type="number"
                  value={mapTargetX}
                  onChange={(e) => setMapTargetX(e.target.value)}
                  helperText="Tile on destination"
                />
                <TextField
                  label="Arrival Y"
                  size="small"
                  type="number"
                  value={mapTargetY}
                  onChange={(e) => setMapTargetY(e.target.value)}
                  helperText="Tile on destination"
                />
              </Box>
            </>
          ) : (
            <FormControl size="small" fullWidth>
              <InputLabel>World Map</InputLabel>
              <Select
                label="World Map"
                value={worldMapTarget}
                onChange={(e) => setWorldMapTarget(e.target.value)}
              >
                {worldMapNames.length === 0 && (
                  <MenuItem value="" disabled>
                    No world maps in index
                  </MenuItem>
                )}
                {worldMapNames.map((n) => (
                  <MenuItem key={n} value={n}>
                    {n}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* Description + restrictions — hidden for world map points */}
          {!isWorldMapPoint && (
            <>
              <TextField
                label="Description"
                size="small"
                fullWidth
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                helperText="Optional tooltip shown on the warp tile"
              />

              <Box>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                  onClick={() => setShowRestrict((v) => !v)}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.secondary',
                      flex: 1
                    }}
                  >
                    Entry Restrictions (optional)
                  </Typography>
                  {showRestrict ? (
                    <ExpandLessIcon fontSize="small" />
                  ) : (
                    <ExpandMoreIcon fontSize="small" />
                  )}
                </Box>
                <Collapse in={showRestrict}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, mt: 1 }}>
                    <TextField
                      label="Min Level"
                      size="small"
                      type="number"
                      value={levelReq}
                      onChange={(e) => setLevelReq(e.target.value)}
                    />
                    <TextField
                      label="Min Ability"
                      size="small"
                      type="number"
                      value={abilityReq}
                      onChange={(e) => setAbilityReq(e.target.value)}
                    />
                    <TextField
                      label="Min Ab"
                      size="small"
                      type="number"
                      value={abReq}
                      onChange={(e) => setAbReq(e.target.value)}
                    />
                  </Box>
                </Collapse>
              </Box>
            </>
          )}
        </Box>

        {destinationPreview && (
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', pt: 1 }}>
            {destinationPreview}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" onClick={handleConfirm} disabled={!canConfirm}>
          {(isEdit ?? initial !== null) ? 'Save' : 'Place'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
