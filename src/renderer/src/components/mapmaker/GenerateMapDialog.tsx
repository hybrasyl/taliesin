import React, { useState, useEffect, useCallback } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Box, Typography, TextField, Select, MenuItem, InputLabel,
  FormControl, Slider, IconButton, Tooltip, Divider, Alert,
} from '@mui/material'
import CasinoIcon from '@mui/icons-material/Casino'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import AddIcon from '@mui/icons-material/Add'
import { MapFile } from '@eriscorp/dalib-ts'
import { generateTerrain, generateDungeon } from '../../utils/mapGenerator'
import {
  type TileTheme, type TerrainParams, type DungeonParams,
  TERRAIN_DEFAULTS, DUNGEON_DEFAULTS,
} from '../../utils/tileThemeTypes'
import ThemeEditorDialog from './ThemeEditorDialog'

// ── Types ────────────────────────────────────────────────────────────────────

type Algorithm = 'terrain' | 'dungeon'

interface Props {
  open: boolean
  onClose: () => void
  onGenerate: (mapFile: MapFile) => void
}

// ── Component ────────────────────────────────────────────────────────────────

const GenerateMapDialog: React.FC<Props> = ({ open, onClose, onGenerate }) => {
  // Theme state
  const [themes, setThemes] = useState<{ filename: string; name: string }[]>([])
  const [selectedThemeFile, setSelectedThemeFile] = useState('')
  const [loadedTheme, setLoadedTheme] = useState<TileTheme | null>(null)
  const [themeEditorOpen, setThemeEditorOpen] = useState(false)

  // Common params
  const [width, setWidth] = useState(64)
  const [height, setHeight] = useState(64)
  const [algorithm, setAlgorithm] = useState<Algorithm>('terrain')
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31))

  // Terrain params
  const [terrainScale, setTerrainScale] = useState(TERRAIN_DEFAULTS.scale)
  const [terrainOctaves, setTerrainOctaves] = useState(TERRAIN_DEFAULTS.octaves)
  const [terrainPersistence, setTerrainPersistence] = useState(TERRAIN_DEFAULTS.persistence)
  const [terrainFgDensity, setTerrainFgDensity] = useState(TERRAIN_DEFAULTS.fgDensity)
  const [terrainFgThreshold, setTerrainFgThreshold] = useState(TERRAIN_DEFAULTS.fgThreshold)
  const [terrainSecondaryThreshold, setTerrainSecondaryThreshold] = useState(TERRAIN_DEFAULTS.secondaryThreshold)
  const [terrainAccentThreshold, setTerrainAccentThreshold] = useState(TERRAIN_DEFAULTS.accentThreshold)

  // Dungeon params
  const [dungeonRoomCount, setDungeonRoomCount] = useState(DUNGEON_DEFAULTS.roomCount)
  const [dungeonMinRoom, setDungeonMinRoom] = useState(DUNGEON_DEFAULTS.minRoomSize)
  const [dungeonMaxRoom, setDungeonMaxRoom] = useState(DUNGEON_DEFAULTS.maxRoomSize)
  const [dungeonCorridorWidth, setDungeonCorridorWidth] = useState(DUNGEON_DEFAULTS.corridorWidth)

  // Load theme list
  const refreshThemes = useCallback(async () => {
    const list = await window.api.themeList()
    setThemes(list)
    if (list.length > 0 && !selectedThemeFile) {
      setSelectedThemeFile(list[0].filename)
    }
  }, [selectedThemeFile])

  useEffect(() => {
    if (open) refreshThemes()
  }, [open, refreshThemes])

  // Load selected theme
  useEffect(() => {
    if (!selectedThemeFile) { setLoadedTheme(null); return }
    window.api.themeLoad(selectedThemeFile).then(data => setLoadedTheme(data as TileTheme))
  }, [selectedThemeFile])

  const randomizeSeed = useCallback(() => {
    setSeed(Math.floor(Math.random() * 2 ** 31))
  }, [])

  const handleGenerate = useCallback(() => {
    if (!loadedTheme) return

    let mapFile: MapFile

    if (algorithm === 'terrain') {
      const params: TerrainParams = {
        width, height, seed,
        scale: terrainScale,
        octaves: terrainOctaves,
        persistence: terrainPersistence,
        lacunarity: TERRAIN_DEFAULTS.lacunarity,
        secondaryThreshold: terrainSecondaryThreshold,
        accentThreshold: terrainAccentThreshold,
        fgDensity: terrainFgDensity,
        fgThreshold: terrainFgThreshold,
      }
      mapFile = generateTerrain(params, loadedTheme)
    } else {
      const params: DungeonParams = {
        width, height, seed,
        roomCount: dungeonRoomCount,
        minRoomSize: dungeonMinRoom,
        maxRoomSize: dungeonMaxRoom,
        corridorWidth: dungeonCorridorWidth,
      }
      mapFile = generateDungeon(params, loadedTheme)
    }

    onGenerate(mapFile)
    onClose()
  }, [
    loadedTheme, algorithm, width, height, seed,
    terrainScale, terrainOctaves, terrainPersistence,
    terrainSecondaryThreshold, terrainAccentThreshold,
    terrainFgDensity, terrainFgThreshold,
    dungeonRoomCount, dungeonMinRoom, dungeonMaxRoom, dungeonCorridorWidth,
    onGenerate, onClose,
  ])

  const clampDim = (v: string): number => {
    const n = parseInt(v, 10)
    if (isNaN(n)) return 1
    return Math.max(1, Math.min(512, n))
  }

  return (
    <>
      <Dialog open={open && !themeEditorOpen} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AutoAwesomeIcon /> Generate Map
        </DialogTitle>
        <DialogContent dividers>
          {/* ── Common Parameters ──────────────────────────────────────── */}
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField
              label="Width" type="number" size="small"
              value={width}
              onChange={e => setWidth(clampDim(e.target.value))}
              inputProps={{ min: 1, max: 512 }}
              sx={{ width: 100 }}
            />
            <TextField
              label="Height" type="number" size="small"
              value={height}
              onChange={e => setHeight(clampDim(e.target.value))}
              inputProps={{ min: 1, max: 512 }}
              sx={{ width: 100 }}
            />
          </Box>

          <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'flex-end' }}>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Algorithm</InputLabel>
              <Select
                label="Algorithm"
                value={algorithm}
                onChange={e => setAlgorithm(e.target.value as Algorithm)}
              >
                <MenuItem value="terrain">Terrain (Noise)</MenuItem>
                <MenuItem value="dungeon">Dungeon (Rooms)</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Theme</InputLabel>
              <Select
                label="Theme"
                value={selectedThemeFile}
                onChange={e => setSelectedThemeFile(e.target.value)}
              >
                {themes.map(t => (
                  <MenuItem key={t.filename} value={t.filename}>{t.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <Tooltip title="Create new theme">
              <IconButton size="small" onClick={() => setThemeEditorOpen(true)}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          {themes.length === 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              No themes found. Create a theme first by scanning your map directories for tile data.
              <Button size="small" sx={{ ml: 1 }} onClick={() => setThemeEditorOpen(true)}>
                Create Theme
              </Button>
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
            <TextField
              label="Seed" type="number" size="small"
              value={seed}
              onChange={e => setSeed(parseInt(e.target.value, 10) || 0)}
              sx={{ width: 180 }}
            />
            <Tooltip title="Randomize seed">
              <IconButton size="small" onClick={randomizeSeed}>
                <CasinoIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* ── Algorithm-specific params ──────────────────────────────── */}
          {algorithm === 'terrain' ? (
            <Box>
              <Typography variant="subtitle2" gutterBottom>Terrain Parameters</Typography>

              <Typography variant="caption" color="text.secondary">
                Scale (feature size) — {terrainScale.toFixed(3)}
              </Typography>
              <Slider
                value={terrainScale} min={0.01} max={0.2} step={0.005}
                onChange={(_, v) => setTerrainScale(v as number)}
                size="small" sx={{ mb: 1 }}
              />

              <Typography variant="caption" color="text.secondary">
                Octaves (detail layers) — {terrainOctaves}
              </Typography>
              <Slider
                value={terrainOctaves} min={1} max={6} step={1}
                onChange={(_, v) => setTerrainOctaves(v as number)}
                size="small" sx={{ mb: 1 }}
              />

              <Typography variant="caption" color="text.secondary">
                Persistence (roughness) — {terrainPersistence.toFixed(2)}
              </Typography>
              <Slider
                value={terrainPersistence} min={0.1} max={0.9} step={0.05}
                onChange={(_, v) => setTerrainPersistence(v as number)}
                size="small" sx={{ mb: 1 }}
              />

              <Typography variant="caption" color="text.secondary">
                Secondary threshold — {terrainSecondaryThreshold.toFixed(2)}
              </Typography>
              <Slider
                value={terrainSecondaryThreshold} min={0.05} max={0.8} step={0.05}
                onChange={(_, v) => setTerrainSecondaryThreshold(v as number)}
                size="small" sx={{ mb: 1 }}
              />

              <Typography variant="caption" color="text.secondary">
                Accent threshold — {terrainAccentThreshold.toFixed(2)}
              </Typography>
              <Slider
                value={terrainAccentThreshold} min={0.1} max={0.95} step={0.05}
                onChange={(_, v) => setTerrainAccentThreshold(v as number)}
                size="small" sx={{ mb: 1 }}
              />

              <Typography variant="caption" color="text.secondary">
                Foreground density — {(terrainFgDensity * 100).toFixed(0)}%
              </Typography>
              <Slider
                value={terrainFgDensity} min={0} max={0.15} step={0.01}
                onChange={(_, v) => setTerrainFgDensity(v as number)}
                size="small" sx={{ mb: 1 }}
              />

              <Typography variant="caption" color="text.secondary">
                Foreground threshold — {terrainFgThreshold.toFixed(2)}
              </Typography>
              <Slider
                value={terrainFgThreshold} min={0.3} max={0.95} step={0.05}
                onChange={(_, v) => setTerrainFgThreshold(v as number)}
                size="small"
              />
            </Box>
          ) : (
            <Box>
              <Typography variant="subtitle2" gutterBottom>Dungeon Parameters</Typography>

              <Typography variant="caption" color="text.secondary">
                Room count — {dungeonRoomCount}
              </Typography>
              <Slider
                value={dungeonRoomCount} min={2} max={25} step={1}
                onChange={(_, v) => setDungeonRoomCount(v as number)}
                size="small" sx={{ mb: 1 }}
              />

              <Typography variant="caption" color="text.secondary">
                Min room size — {dungeonMinRoom}
              </Typography>
              <Slider
                value={dungeonMinRoom} min={3} max={20} step={1}
                onChange={(_, v) => setDungeonMinRoom(v as number)}
                size="small" sx={{ mb: 1 }}
              />

              <Typography variant="caption" color="text.secondary">
                Max room size — {dungeonMaxRoom}
              </Typography>
              <Slider
                value={dungeonMaxRoom} min={4} max={30} step={1}
                onChange={(_, v) => setDungeonMaxRoom(v as number)}
                size="small" sx={{ mb: 1 }}
              />

              <Typography variant="caption" color="text.secondary">
                Corridor width — {dungeonCorridorWidth}
              </Typography>
              <Slider
                value={dungeonCorridorWidth} min={1} max={3} step={1}
                onChange={(_, v) => setDungeonCorridorWidth(v as number)}
                size="small"
              />
            </Box>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleGenerate}
            disabled={!loadedTheme}
            startIcon={<AutoAwesomeIcon />}
          >
            Generate
          </Button>
        </DialogActions>
      </Dialog>

      <ThemeEditorDialog
        open={themeEditorOpen}
        onClose={() => setThemeEditorOpen(false)}
        onSave={() => {
          setThemeEditorOpen(false)
          refreshThemes()
        }}
      />
    </>
  )
}

export default GenerateMapDialog
