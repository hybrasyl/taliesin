import React, { useEffect, useRef, useState } from 'react'
import { useRecoilValue } from 'recoil'
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
import MapRenderCanvas from '../mapeditor/MapRenderCanvas'
import type { MapMarker } from '../mapeditor/MapRenderCanvas'
import { mapFilesDirectoryState, clientPathState } from '../../recoil/atoms'
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
  onPointDisplayNameChange
}: WarpDialogProps) {
  const clientPath = useRecoilValue(clientPathState)
  const mapDirectory = useRecoilValue(mapFilesDirectoryState)
  const { index } = useWorldIndex()
  const mapDetails = index?.mapDetails ?? []

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

  const canConfirm = targetType === 'map' ? !!mapTargetName.trim() : !!worldMapTarget.trim()
  const isWorldMapPoint = !!lockType

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="md" fullWidth>
      <DialogTitle>
        {initial
          ? isWorldMapPoint
            ? 'Edit Point'
            : 'Edit Warp'
          : isWorldMapPoint
            ? 'Place Point'
            : 'Place Warp'}
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          ({tileX}, {tileY})
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
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
              inputProps={{ spellCheck: false }}
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

              {destDetail && (
                <Box
                  sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}
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
                    <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
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
                          onClick={() =>
                            setMiniZoomIdx((i) => Math.min(MINI_ZOOM_LEVELS.length - 1, i + 1))
                          }
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
                    sx={{ maxHeight: 420, bgcolor: 'background.default' }}
                  />
                </Box>
              )}

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
                  <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
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
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" onClick={handleConfirm} disabled={!canConfirm}>
          {initial ? 'Save' : 'Place'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
