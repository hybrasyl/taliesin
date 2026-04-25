import React, { useState, useCallback, useMemo } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Slider,
  IconButton,
  Tooltip,
  Divider
} from '@mui/material'
import CasinoIcon from '@mui/icons-material/Casino'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import { MapFile } from '@eriscorp/dalib-ts'
import { generateTerrain, TERRAIN_DEFAULTS, type TerrainParams } from '../../utils/mapGenerator'
import type { TileAtlas } from '../../utils/tileThemeTypes'
import atlasData from '../../data/tileAtlas.json'

const atlas = atlasData as unknown as TileAtlas

// ── Helpers ─────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  onGenerate: (mapFile: MapFile) => void
}

function familyLabel(f: { id: string; tiles: number[]; totalFrequency: number }): string {
  const min = Math.min(...f.tiles)
  const max = Math.max(...f.tiles)
  return `${f.id} (${f.tiles.length} tiles, ${min}–${max})`
}

function wallFamilyLabel(f: {
  id: string
  pairs: [number, number][]
  totalFrequency: number
}): string {
  return `${f.id} (${f.pairs.length} pairs)`
}

// ── Component ────────────────────────────────────────────────────────────────

const GenerateMapDialog: React.FC<Props> = ({ open, onClose, onGenerate }) => {
  const [width, setWidth] = useState(64)
  const [height, setHeight] = useState(64)
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31))

  // Noise params
  const [terrainScale, setTerrainScale] = useState(TERRAIN_DEFAULTS.scale)
  const [terrainOctaves, setTerrainOctaves] = useState(TERRAIN_DEFAULTS.octaves)
  const [terrainPersistence, setTerrainPersistence] = useState(TERRAIN_DEFAULTS.persistence)
  const [terrainSecondaryThreshold, setTerrainSecondaryThreshold] = useState(
    TERRAIN_DEFAULTS.secondaryThreshold
  )
  const [terrainWallDensity, setTerrainWallDensity] = useState(TERRAIN_DEFAULTS.wallDensity)
  const [terrainWallThreshold, setTerrainWallThreshold] = useState(TERRAIN_DEFAULTS.wallThreshold)

  // Family selection
  const [primaryFamilyIdx, setPrimaryFamilyIdx] = useState(0)
  const [secondaryFamilyIdx, setSecondaryFamilyIdx] = useState(1)
  const [wallFamilyIdx, setWallFamilyIdx] = useState(-1)

  const topBgFamilies = useMemo(() => atlas.bgFamilies.slice(0, 30), [])
  const topWallFamilies = useMemo(() => atlas.wallFamilies.slice(0, 30), [])

  const randomizeSeed = useCallback(() => {
    setSeed(Math.floor(Math.random() * 2 ** 31))
  }, [])

  const handleGenerate = useCallback(() => {
    const params: TerrainParams = {
      width,
      height,
      seed,
      scale: terrainScale,
      octaves: terrainOctaves,
      persistence: terrainPersistence,
      lacunarity: TERRAIN_DEFAULTS.lacunarity,
      primaryFamilyIdx,
      secondaryFamilyIdx,
      secondaryThreshold: terrainSecondaryThreshold,
      wallFamilyIdx,
      wallDensity: terrainWallDensity,
      wallThreshold: terrainWallThreshold
    }
    const mapFile = generateTerrain(params, atlas)
    onGenerate(mapFile)
    onClose()
  }, [
    width,
    height,
    seed,
    terrainScale,
    terrainOctaves,
    terrainPersistence,
    terrainSecondaryThreshold,
    terrainWallDensity,
    terrainWallThreshold,
    primaryFamilyIdx,
    secondaryFamilyIdx,
    wallFamilyIdx,
    onGenerate,
    onClose
  ])

  const clampDim = (v: string): number => {
    const n = parseInt(v, 10)
    if (isNaN(n)) return 1
    return Math.max(1, Math.min(512, n))
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AutoAwesomeIcon /> Generate Terrain
      </DialogTitle>
      <DialogContent dividers>
        {/* ── Dimensions + Seed ──────────────────────────────────────── */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
          <TextField
            label="Width"
            type="number"
            size="small"
            value={width}
            onChange={(e) => setWidth(clampDim(e.target.value))}
            inputProps={{ min: 1, max: 512 }}
            sx={{ width: 100 }}
          />
          <TextField
            label="Height"
            type="number"
            size="small"
            value={height}
            onChange={(e) => setHeight(clampDim(e.target.value))}
            inputProps={{ min: 1, max: 512 }}
            sx={{ width: 100 }}
          />
          <TextField
            label="Seed"
            type="number"
            size="small"
            value={seed}
            onChange={(e) => setSeed(parseInt(e.target.value, 10) || 0)}
            sx={{ width: 150 }}
          />
          <Tooltip title="Randomize seed">
            <IconButton size="small" onClick={randomizeSeed}>
              <CasinoIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* ── Tile Families ──────────────────────────────────────────── */}
        <Typography variant="subtitle2" gutterBottom>
          Tile Families
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 260 }}>
            <InputLabel>Primary Ground</InputLabel>
            <Select
              label="Primary Ground"
              value={primaryFamilyIdx}
              onChange={(e) => setPrimaryFamilyIdx(Number(e.target.value))}
            >
              {topBgFamilies.map((f, i) => (
                <MenuItem key={f.id} value={i}>
                  {familyLabel(f)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 260 }}>
            <InputLabel>Secondary Ground</InputLabel>
            <Select
              label="Secondary Ground"
              value={secondaryFamilyIdx}
              onChange={(e) => setSecondaryFamilyIdx(Number(e.target.value))}
            >
              {topBgFamilies.map((f, i) => (
                <MenuItem key={f.id} value={i}>
                  {familyLabel(f)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 260 }}>
            <InputLabel>Wall Style (optional)</InputLabel>
            <Select
              label="Wall Style (optional)"
              value={wallFamilyIdx}
              onChange={(e) => setWallFamilyIdx(Number(e.target.value))}
            >
              <MenuItem value={-1}>
                <em>None</em>
              </MenuItem>
              {topWallFamilies.map((f, i) => (
                <MenuItem key={f.id} value={i}>
                  {wallFamilyLabel(f)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* ── Noise Parameters ───────────────────────────────────────── */}
        <Typography variant="subtitle2" gutterBottom>
          Noise Parameters
        </Typography>

        <Typography variant="caption" color="text.secondary">
          Scale (feature size) — {terrainScale.toFixed(3)}
        </Typography>
        <Slider
          value={terrainScale}
          min={0.01}
          max={0.2}
          step={0.005}
          onChange={(_, v) => setTerrainScale(v as number)}
          size="small"
          sx={{ mb: 1 }}
        />

        <Typography variant="caption" color="text.secondary">
          Octaves (detail) — {terrainOctaves}
        </Typography>
        <Slider
          value={terrainOctaves}
          min={1}
          max={6}
          step={1}
          onChange={(_, v) => setTerrainOctaves(v as number)}
          size="small"
          sx={{ mb: 1 }}
        />

        <Typography variant="caption" color="text.secondary">
          Persistence — {terrainPersistence.toFixed(2)}
        </Typography>
        <Slider
          value={terrainPersistence}
          min={0.1}
          max={0.9}
          step={0.05}
          onChange={(_, v) => setTerrainPersistence(v as number)}
          size="small"
          sx={{ mb: 1 }}
        />

        <Typography variant="caption" color="text.secondary">
          Secondary threshold — {terrainSecondaryThreshold.toFixed(2)}
        </Typography>
        <Slider
          value={terrainSecondaryThreshold}
          min={0.1}
          max={0.9}
          step={0.05}
          onChange={(_, v) => setTerrainSecondaryThreshold(v as number)}
          size="small"
          sx={{ mb: 1 }}
        />

        {wallFamilyIdx >= 0 && (
          <>
            <Typography variant="caption" color="text.secondary">
              Wall density — {(terrainWallDensity * 100).toFixed(0)}%
            </Typography>
            <Slider
              value={terrainWallDensity}
              min={0}
              max={0.3}
              step={0.01}
              onChange={(_, v) => setTerrainWallDensity(v as number)}
              size="small"
              sx={{ mb: 1 }}
            />

            <Typography variant="caption" color="text.secondary">
              Wall threshold — {terrainWallThreshold.toFixed(2)}
            </Typography>
            <Slider
              value={terrainWallThreshold}
              min={0.3}
              max={0.95}
              step={0.05}
              onChange={(_, v) => setTerrainWallThreshold(v as number)}
              size="small"
            />
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleGenerate} startIcon={<AutoAwesomeIcon />}>
          Generate
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default GenerateMapDialog
