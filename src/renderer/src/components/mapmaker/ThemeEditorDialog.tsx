import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Box, Typography, TextField, LinearProgress, Chip, Tooltip,
  Select, MenuItem, InputLabel, FormControl, IconButton,
} from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { useRecoilValue } from 'recoil'
import { mapDirectoriesState, clientPathState } from '../../recoil/atoms'
import {
  loadMapAssets, getGroundBitmap, getStcBitmap,
  GROUND_TILE_WIDTH, GROUND_TILE_HEIGHT,
  type MapAssets,
} from '../../utils/mapRenderer'
import type { TileTheme, TileFrequencyResult } from '../../utils/tileThemeTypes'

// ── Types ────────────────────────────────────────────────────────────────────

type BgRole = 'primaryGround' | 'secondaryGround' | 'accentGround' | 'pathTile'
type FgRole = 'wallTile' | 'wallTileRight' | 'decorationTile' | 'edgeTile'
type Role = BgRole | FgRole

const BG_ROLES: { key: BgRole; label: string }[] = [
  { key: 'primaryGround', label: 'Primary Ground' },
  { key: 'secondaryGround', label: 'Secondary Ground' },
  { key: 'accentGround', label: 'Accent Ground' },
  { key: 'pathTile', label: 'Path / Corridor' },
]

const FG_ROLES: { key: FgRole; label: string }[] = [
  { key: 'wallTile', label: 'Wall (Left FG)' },
  { key: 'wallTileRight', label: 'Wall (Right FG)' },
  { key: 'decorationTile', label: 'Decoration' },
  { key: 'edgeTile', label: 'Edge / Border' },
]

interface Props {
  open: boolean
  onClose: () => void
  onSave: (theme: TileTheme) => void
  editTheme?: TileTheme | null
}

// ── Tile Thumbnail Component ─────────────────────────────────────────────────

const TileThumb: React.FC<{
  tileId: number
  layer: 'bg' | 'fg'
  assets: MapAssets | null
  size?: number
  selected?: boolean
  onClick?: () => void
}> = ({ tileId, layer, assets, size = 48, selected, onClick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!assets || !canvasRef.current || tileId <= 0) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const render = async () => {
      const bm = layer === 'bg'
        ? await getGroundBitmap(tileId, assets)
        : await getStcBitmap(tileId, assets)
      if (!bm) {
        ctx.clearRect(0, 0, size, size)
        ctx.fillStyle = '#333'
        ctx.fillRect(0, 0, size, size)
        ctx.fillStyle = '#999'
        ctx.font = '10px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(String(tileId), size / 2, size / 2 + 4)
        return
      }
      ctx.clearRect(0, 0, size, size)
      const scale = Math.min(size / bm.width, size / bm.height)
      const w = bm.width * scale
      const h = bm.height * scale
      ctx.drawImage(bm, (size - w) / 2, (size - h) / 2, w, h)
    }
    render()
  }, [tileId, layer, assets, size])

  if (tileId <= 0) {
    return (
      <Box
        onClick={onClick}
        sx={{
          width: size, height: size, border: '1px dashed',
          borderColor: 'divider', borderRadius: 1, cursor: onClick ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Typography variant="caption" color="text.secondary">None</Typography>
      </Box>
    )
  }

  return (
    <Box
      onClick={onClick}
      sx={{
        position: 'relative', cursor: onClick ? 'pointer' : 'default',
        border: 2, borderColor: selected ? 'primary.main' : 'transparent',
        borderRadius: 1, '&:hover': onClick ? { borderColor: 'primary.light' } : {},
      }}
    >
      <canvas ref={canvasRef} width={size} height={size} style={{ display: 'block' }} />
      <Typography
        variant="caption"
        sx={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          textAlign: 'center', bgcolor: 'rgba(0,0,0,0.6)', color: '#fff',
          fontSize: '9px', lineHeight: 1.4,
        }}
      >
        {tileId}
      </Typography>
    </Box>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

const ThemeEditorDialog: React.FC<Props> = ({ open, onClose, onSave, editTheme }) => {
  const mapDirs = useRecoilValue(mapDirectoriesState)
  const clientPath = useRecoilValue(clientPathState)

  // Scan state
  const [scanDirs, setScanDirs] = useState<string[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<TileFrequencyResult | null>(null)
  const [assets, setAssets] = useState<MapAssets | null>(null)

  // Theme state
  const [name, setName] = useState('')
  const [roles, setRoles] = useState<Record<Role, number>>({
    primaryGround: 0, secondaryGround: 0, accentGround: 0, pathTile: 0,
    wallTile: 0, wallTileRight: 0, decorationTile: 0, edgeTile: 0,
  })

  // Which role is currently being assigned (tile picker is open for it)
  const [pickingRole, setPickingRole] = useState<Role | null>(null)

  // Load assets for tile preview
  useEffect(() => {
    if (!clientPath || !open) return
    loadMapAssets(clientPath).then(setAssets)
  }, [clientPath, open])

  // Populate from editTheme
  useEffect(() => {
    if (!open) return
    if (editTheme) {
      setName(editTheme.name)
      setRoles({
        primaryGround: editTheme.primaryGround,
        secondaryGround: editTheme.secondaryGround,
        accentGround: editTheme.accentGround,
        pathTile: editTheme.pathTile,
        wallTile: editTheme.wallTile,
        wallTileRight: editTheme.wallTileRight,
        decorationTile: editTheme.decorationTile,
        edgeTile: editTheme.edgeTile,
      })
    } else {
      setName('')
      setRoles({
        primaryGround: 0, secondaryGround: 0, accentGround: 0, pathTile: 0,
        wallTile: 0, wallTileRight: 0, decorationTile: 0, edgeTile: 0,
      })
    }
    setScanResult(null)
    setPickingRole(null)
  }, [open, editTheme])

  const handleBrowseDir = useCallback(async () => {
    const dir = await window.api.openDirectory()
    if (dir && !scanDirs.includes(dir)) {
      setScanDirs(prev => [...prev, dir])
    }
  }, [scanDirs])

  const handleScan = useCallback(async () => {
    if (scanDirs.length === 0) return
    setScanning(true)
    try {
      const result = await window.api.tileScanAnalyze(scanDirs)
      setScanResult(result)

      // Auto-assign top tiles to roles if nothing is assigned yet
      const allEmpty = Object.values(roles).every(v => v === 0)
      if (allEmpty) {
        const bg = result.background
        const lfg = result.leftForeground
        const rfg = result.rightForeground
        setRoles({
          primaryGround: bg[0]?.[0] ?? 0,
          secondaryGround: bg[1]?.[0] ?? 0,
          accentGround: bg[2]?.[0] ?? 0,
          pathTile: bg[3]?.[0] ?? bg[0]?.[0] ?? 0,
          wallTile: lfg[0]?.[0] ?? 0,
          wallTileRight: rfg[0]?.[0] ?? 0,
          decorationTile: lfg[1]?.[0] ?? 0,
          edgeTile: lfg[2]?.[0] ?? 0,
        })
      }
    } finally {
      setScanning(false)
    }
  }, [scanDirs, roles])

  const handleSaveTheme = useCallback(() => {
    if (!name.trim()) return
    const now = new Date().toISOString()
    const theme: TileTheme = {
      name: name.trim(),
      createdAt: editTheme?.createdAt ?? now,
      updatedAt: now,
      ...roles,
    }
    const filename = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json'
    window.api.themeSave(filename, theme).then(() => onSave(theme))
  }, [name, roles, editTheme, onSave])

  const isBgRole = (role: Role): boolean =>
    ['primaryGround', 'secondaryGround', 'accentGround', 'pathTile'].includes(role)

  // Get the frequency list for the current picking role
  const getPickerTiles = (): [number, number][] => {
    if (!scanResult || !pickingRole) return []
    if (isBgRole(pickingRole)) return scanResult.background
    if (pickingRole === 'wallTileRight') return scanResult.rightForeground
    return scanResult.leftForeground
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{editTheme ? 'Edit Theme' : 'Create Tile Theme'}</DialogTitle>
      <DialogContent dividers>
        {/* ── Step 1: Directory selection + scan ─────────────────────────── */}
        <Typography variant="subtitle2" gutterBottom>
          1. Scan map directories for tile frequency
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
          {/* Pre-populated from settings */}
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Add from settings</InputLabel>
            <Select
              label="Add from settings"
              value=""
              onChange={(e) => {
                const val = e.target.value as string
                if (val && !scanDirs.includes(val)) setScanDirs(prev => [...prev, val])
              }}
            >
              {mapDirs.map(d => (
                <MenuItem key={d.path} value={d.path}>{d.name || d.path}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Tooltip title="Browse for directory">
            <IconButton size="small" onClick={handleBrowseDir}>
              <FolderOpenIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Button
            variant="contained" size="small"
            onClick={handleScan}
            disabled={scanning || scanDirs.length === 0}
          >
            {scanning ? 'Scanning...' : 'Scan'}
          </Button>
        </Box>

        {/* Selected directories */}
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
          {scanDirs.map(d => (
            <Chip
              key={d}
              label={d.split(/[\\/]/).pop()}
              size="small"
              onDelete={() => setScanDirs(prev => prev.filter(p => p !== d))}
              title={d}
            />
          ))}
        </Box>

        {scanning && <LinearProgress sx={{ mb: 1 }} />}

        {scanResult && (
          <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
            Scanned {scanResult.fileCount.toLocaleString()} files, {scanResult.tileCount.toLocaleString()} tiles —
            {' '}{scanResult.background.length} unique BG, {scanResult.leftForeground.length} unique LFG,
            {' '}{scanResult.rightForeground.length} unique RFG
          </Typography>
        )}

        {/* ── Step 2: Role assignment ───────────────────────────────────── */}
        <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
          2. Assign tiles to roles {!scanResult && '(scan first to see tile previews)'}
        </Typography>

        <TextField
          label="Theme Name"
          value={name}
          onChange={e => setName(e.target.value)}
          size="small"
          fullWidth
          sx={{ mb: 2 }}
        />

        {/* Background roles */}
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          Background Tiles
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          {BG_ROLES.map(({ key, label }) => (
            <Box key={key} sx={{ textAlign: 'center' }}>
              <TileThumb
                tileId={roles[key]}
                layer="bg"
                assets={assets}
                size={56}
                selected={pickingRole === key}
                onClick={() => setPickingRole(pickingRole === key ? null : key)}
              />
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontSize: '10px' }}>
                {label}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Foreground roles */}
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          Foreground Tiles
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          {FG_ROLES.map(({ key, label }) => (
            <Box key={key} sx={{ textAlign: 'center' }}>
              <TileThumb
                tileId={roles[key]}
                layer="fg"
                assets={assets}
                size={56}
                selected={pickingRole === key}
                onClick={() => setPickingRole(pickingRole === key ? null : key)}
              />
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontSize: '10px' }}>
                {label}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* ── Tile picker grid (shown when a role is selected) ──────────── */}
        {pickingRole && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" color="primary" sx={{ mb: 0.5, display: 'block' }}>
              Select tile for: <strong>{
                [...BG_ROLES, ...FG_ROLES].find(r => r.key === pickingRole)?.label
              }</strong>
              {' '}(click a tile below, or type an ID)
            </Typography>

            {/* Manual ID entry */}
            <TextField
              label="Tile ID"
              type="number"
              size="small"
              value={roles[pickingRole] || ''}
              onChange={e => {
                const v = parseInt(e.target.value, 10)
                if (!isNaN(v) && v >= 0) {
                  setRoles(prev => ({ ...prev, [pickingRole]: v }))
                }
              }}
              sx={{ mb: 1, width: 120 }}
            />

            {/* Frequency-sorted tile grid */}
            {scanResult && (
              <Box sx={{
                display: 'flex', flexWrap: 'wrap', gap: 0.5,
                maxHeight: 200, overflowY: 'auto',
                border: 1, borderColor: 'divider', borderRadius: 1, p: 0.5,
              }}>
                {getPickerTiles().slice(0, 60).map(([tileId, count]) => (
                  <Tooltip key={tileId} title={`ID ${tileId} — ${count.toLocaleString()} uses`}>
                    <Box>
                      <TileThumb
                        tileId={tileId}
                        layer={isBgRole(pickingRole) ? 'bg' : 'fg'}
                        assets={assets}
                        size={40}
                        selected={roles[pickingRole] === tileId}
                        onClick={() => {
                          setRoles(prev => ({ ...prev, [pickingRole]: tileId }))
                          setPickingRole(null)
                        }}
                      />
                    </Box>
                  </Tooltip>
                ))}
                {getPickerTiles().length === 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ p: 1 }}>
                    No tiles found. Try scanning more directories.
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSaveTheme}
          disabled={!name.trim() || roles.primaryGround === 0}
          startIcon={<CheckCircleIcon />}
        >
          Save Theme
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default ThemeEditorDialog
