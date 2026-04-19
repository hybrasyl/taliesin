import React, { useState, useCallback, useRef } from 'react'
import {
  Box, Typography, Button, Divider, ToggleButton, ToggleButtonGroup,
  IconButton, Tooltip, Slider,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import SaveIcon from '@mui/icons-material/Save'
import SaveAsIcon from '@mui/icons-material/SaveAs'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'
import BrushIcon from '@mui/icons-material/Brush'
import DeleteIcon from '@mui/icons-material/Delete'
import ColorizeIcon from '@mui/icons-material/Colorize'
import GridOnIcon from '@mui/icons-material/GridOn'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import BlockIcon from '@mui/icons-material/Block'
import { useRecoilValue } from 'recoil'
import { clientPathState } from '../recoil/atoms'
import { MapFile } from '@eriscorp/dalib-ts'
import TilePicker, { type TileLayer } from '../components/mapmaker/TilePicker'
import MapEditorCanvas, { type EditorTool, type TileChange } from '../components/mapmaker/MapEditorCanvas'
import NewMapDialog from '../components/mapmaker/NewMapDialog'
import DimensionPickerDialog from '../components/catalog/DimensionPickerDialog'

// ── Undo types ───────────────────────────────────────────────────────────────

type UndoGroup = TileChange[]

const MAX_UNDO = 100

// ── Component ────────────────────────────────────────────────────────────────

const MapMakerPage: React.FC = () => {
  const clientPath = useRecoilValue(clientPathState)

  // Map state
  const [mapFile, setMapFile] = useState<MapFile | null>(null)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  // Tool state
  const [tool, setTool] = useState<EditorTool>('draw')
  const [activeLayer, setActiveLayer] = useState<TileLayer>('background')
  const [selectedTileId, setSelectedTileId] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [showGrid, setShowGrid] = useState(true)
  const [showBg, setShowBg] = useState(true)
  const [showLfg, setShowLfg] = useState(true)
  const [showRfg, setShowRfg] = useState(true)
  const [showPassability, setShowPassability] = useState(false)

  // Hover
  const [hoverTile, setHoverTile] = useState<{ tx: number; ty: number } | null>(null)

  // Undo/redo
  const [undoStack, setUndoStack] = useState<UndoGroup[]>([])
  const [redoStack, setRedoStack] = useState<UndoGroup[]>([])

  // Dialogs
  const [newMapOpen, setNewMapOpen] = useState(false)
  const [dimPickerState, setDimPickerState] = useState<{
    open: boolean
    filePath: string
    filename: string
    fileBuffer: Uint8Array
  } | null>(null)

  // Force re-render of canvas after undo/redo
  const [canvasKey, setCanvasKey] = useState(0)

  // ── New map ────────────────────────────────────────────────────────────────

  const handleNewMap = useCallback((width: number, height: number) => {
    setMapFile(new MapFile(width, height))
    setFilePath(null)
    setDirty(false)
    setUndoStack([])
    setRedoStack([])
    setCanvasKey(k => k + 1)
  }, [])

  // ── Open map ───────────────────────────────────────────────────────────────

  const handleOpenMap = useCallback(async () => {
    const path = await window.api.openFile([
      { name: 'DA Map Files', extensions: ['map'] },
    ])
    if (!path) return

    const buf = await window.api.readFile(path)
    const bytes = new Uint8Array(buf)
    const filename = path.replace(/\\/g, '/').split('/').pop() ?? 'map'

    setDimPickerState({ open: true, filePath: path, filename, fileBuffer: bytes })
  }, [])

  const handleDimConfirm = useCallback((width: number, height: number) => {
    if (!dimPickerState) return
    const mf = MapFile.fromBuffer(dimPickerState.fileBuffer, width, height)
    setMapFile(mf)
    setFilePath(dimPickerState.filePath)
    setDirty(false)
    setUndoStack([])
    setRedoStack([])
    setCanvasKey(k => k + 1)
    setDimPickerState(null)
  }, [dimPickerState])

  const handleDimCancel = useCallback(() => {
    setDimPickerState(null)
  }, [])

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!mapFile) return
    let savePath = filePath
    if (!savePath) {
      savePath = await window.api.saveFile(
        [{ name: 'DA Map Files', extensions: ['map'] }],
      )
      if (!savePath) return
    }
    const data = mapFile.toUint8Array()
    await window.api.writeBytes(savePath, data)
    setFilePath(savePath)
    setDirty(false)
  }, [mapFile, filePath])

  const handleSaveAs = useCallback(async () => {
    if (!mapFile) return
    const savePath = await window.api.saveFile(
      [{ name: 'DA Map Files', extensions: ['map'] }],
    )
    if (!savePath) return
    const data = mapFile.toUint8Array()
    await window.api.writeBytes(savePath, data)
    setFilePath(savePath)
    setDirty(false)
  }, [mapFile])

  // ── Tile changes ───────────────────────────────────────────────────────────

  const handleTileChange = useCallback((changes: TileChange[]) => {
    if (changes.length === 0) return
    setUndoStack(prev => {
      const next = [...prev, changes]
      return next.length > MAX_UNDO ? next.slice(-MAX_UNDO) : next
    })
    setRedoStack([])
    setDirty(true)
  }, [])

  const handleSampleTile = useCallback((tileId: number) => {
    setSelectedTileId(tileId)
    setTool('draw')
  }, [])

  // ── Undo/redo ──────────────────────────────────────────────────────────────

  const handleUndo = useCallback(() => {
    if (!mapFile || undoStack.length === 0) return
    const group = undoStack[undoStack.length - 1]
    // Apply in reverse
    for (let i = group.length - 1; i >= 0; i--) {
      const c = group[i]
      const tile = mapFile.getTile(c.x, c.y)
      mapFile.setTile(c.x, c.y, { ...tile, [c.layer]: c.oldValue })
    }
    setUndoStack(prev => prev.slice(0, -1))
    setRedoStack(prev => [...prev, group])
    setCanvasKey(k => k + 1)
    setDirty(true)
  }, [mapFile, undoStack])

  const handleRedo = useCallback(() => {
    if (!mapFile || redoStack.length === 0) return
    const group = redoStack[redoStack.length - 1]
    for (const c of group) {
      const tile = mapFile.getTile(c.x, c.y)
      mapFile.setTile(c.x, c.y, { ...tile, [c.layer]: c.newValue })
    }
    setRedoStack(prev => prev.slice(0, -1))
    setUndoStack(prev => [...prev, group])
    setCanvasKey(k => k + 1)
    setDirty(true)
  }, [mapFile, redoStack])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); handleUndo() }
    if (e.ctrlKey && e.key === 'y') { e.preventDefault(); handleRedo() }
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault()
      if (e.shiftKey) handleSaveAs()
      else handleSave()
    }
    if (e.key === 'd' && !e.ctrlKey) setTool('draw')
    if (e.key === 'e' && !e.ctrlKey) setTool('erase')
    if (e.key === 's' && !e.ctrlKey && !e.metaKey) setTool('sample')
    if (e.key === 'g' && !e.ctrlKey) setShowGrid(g => !g)
    if (e.key === 'f' && !e.ctrlKey) {
      setActiveLayer(prev =>
        prev === 'leftForeground' ? 'rightForeground'
        : prev === 'rightForeground' ? 'leftForeground'
        : prev
      )
    }
  }, [handleUndo, handleRedo, handleSave, handleSaveAs])

  // ── File name display ──────────────────────────────────────────────────────

  const fileName = filePath
    ? filePath.replace(/\\/g, '/').split('/').pop()
    : mapFile ? 'Untitled.map' : null

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Toolbar */}
      <Box sx={{
        px: 1.5, py: 0.5,
        display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap',
        borderBottom: '1px solid', borderColor: 'divider',
        '& .MuiIconButton-root': { color: 'text.primary' },
        '& .MuiIconButton-root.Mui-disabled': { color: 'text.disabled' },
      }}>
        <Tooltip title="New Map">
          <IconButton size="small" onClick={() => setNewMapOpen(true)}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Open Map">
          <IconButton size="small" onClick={handleOpenMap}>
            <FolderOpenIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Save (Ctrl+S)">
          <span>
            <IconButton size="small" onClick={handleSave} disabled={!mapFile}>
              <SaveIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Save As (Ctrl+Shift+S)">
          <span>
            <IconButton size="small" onClick={handleSaveAs} disabled={!mapFile}>
              <SaveAsIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem />

        {/* Tools */}
        <ToggleButtonGroup
          value={tool}
          exclusive
          onChange={(_, v) => v && setTool(v)}
          size="small"
          sx={{
            '& .MuiToggleButton-root': { color: 'text.primary' },
            '& .MuiToggleButton-root.Mui-selected': { color: 'info.light', bgcolor: 'action.selected' },
          }}
        >
          <ToggleButton value="draw">
            <Tooltip title="Draw (D)"><BrushIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="erase">
            <Tooltip title="Erase (E)"><DeleteIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="sample">
            <Tooltip title="Sample (S)"><ColorizeIcon fontSize="small" /></Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        <Divider orientation="vertical" flexItem />

        {/* Undo/redo */}
        <Tooltip title="Undo (Ctrl+Z)">
          <span>
            <IconButton size="small" onClick={handleUndo} disabled={undoStack.length === 0}>
              <UndoIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Redo (Ctrl+Y)">
          <span>
            <IconButton size="small" onClick={handleRedo} disabled={redoStack.length === 0}>
              <RedoIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem />

        {/* Zoom */}
        <Typography variant="caption" color="text.primary" sx={{ minWidth: 35 }}>
          {Math.round(zoom * 100)}%
        </Typography>
        <Slider
          value={zoom}
          onChange={(_, v) => setZoom(v as number)}
          min={0.25}
          max={2}
          step={0.25}
          sx={{
            width: 100,
            '& .MuiSlider-thumb': { color: 'text.primary' },
            '& .MuiSlider-track': { color: 'text.primary' },
            '& .MuiSlider-rail': { color: 'text.secondary' },
          }}
          size="small"
        />

        <Tooltip title="Toggle Grid (G)">
          <IconButton
            size="small"
            onClick={() => setShowGrid(g => !g)}
            sx={{ color: showGrid ? 'info.light' : 'text.primary' }}
          >
            <GridOnIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem />

        {/* Layer visibility */}
        <Tooltip title="Toggle Background">
          <IconButton
            size="small"
            onClick={() => setShowBg(v => !v)}
            sx={{ color: showBg ? 'text.primary' : 'error.main' }}
          >
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 'bold', lineHeight: 1 }}>BG</Typography>
          </IconButton>
        </Tooltip>
        <Tooltip title="Toggle Left Foreground">
          <IconButton
            size="small"
            onClick={() => setShowLfg(v => !v)}
            sx={{ color: showLfg ? 'text.primary' : 'error.main' }}
          >
            <Typography sx={{ fontSize: '0.6rem', fontWeight: 'bold', lineHeight: 1 }}>LF</Typography>
          </IconButton>
        </Tooltip>
        <Tooltip title="Toggle Right Foreground">
          <IconButton
            size="small"
            onClick={() => setShowRfg(v => !v)}
            sx={{ color: showRfg ? 'text.primary' : 'error.main' }}
          >
            <Typography sx={{ fontSize: '0.6rem', fontWeight: 'bold', lineHeight: 1 }}>RF</Typography>
          </IconButton>
        </Tooltip>
        <Tooltip title="Show Passability">
          <IconButton
            size="small"
            onClick={() => setShowPassability(v => !v)}
            sx={{ color: showPassability ? 'warning.main' : 'text.primary' }}
          >
            <BlockIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Status */}
        <Box sx={{ flexGrow: 1 }} />
        {fileName && (
          <Typography variant="caption" color="text.secondary" noWrap>
            {fileName}{dirty ? ' *' : ''} {mapFile ? `(${mapFile.width}×${mapFile.height})` : ''}
          </Typography>
        )}
        {hoverTile && mapFile && (() => {
          const t = mapFile.getTile(hoverTile.tx, hoverTile.ty)
          return (
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
              ({hoverTile.tx}, {hoverTile.ty})
              {' · '}bg:{t.background} lf:{t.leftForeground} rf:{t.rightForeground}
            </Typography>
          )
        })()}
        {hoverTile && !mapFile && (
          <Typography variant="caption" color="text.disabled">
            ({hoverTile.tx}, {hoverTile.ty})
          </Typography>
        )}
        {selectedTileId > 0 && (
          <Typography variant="caption" color="text.disabled">
            brush: {selectedTileId}
          </Typography>
        )}
      </Box>

      {/* Body: tile picker + canvas */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: tile picker */}
        <Box sx={{
          width: 280, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          borderRight: '1px solid', borderColor: 'divider',
        }}>
          <TilePicker
            clientPath={clientPath}
            activeLayer={activeLayer}
            selectedTileId={selectedTileId}
            onSelectTile={setSelectedTileId}
            onLayerChange={setActiveLayer}
          />
        </Box>

        {/* Center: canvas */}
        {mapFile ? (
          <MapEditorCanvas
            key={canvasKey}
            mapFile={mapFile}
            clientPath={clientPath}
            tool={tool}
            activeLayer={activeLayer}
            selectedTileId={selectedTileId}
            zoom={zoom}
            showGrid={showGrid}
            showBg={showBg}
            showLfg={showLfg}
            showRfg={showRfg}
            showPassability={showPassability}
            onTileChange={handleTileChange}
            onSampleTile={handleSampleTile}
            onHoverTile={setHoverTile}
            onZoomChange={setZoom}
          />
        ) : (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography color="text.secondary" gutterBottom>
                Create a new map or open an existing one.
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 2 }}>
                <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setNewMapOpen(true)}>
                  New Map
                </Button>
                <Button variant="outlined" startIcon={<FolderOpenIcon />} onClick={handleOpenMap}>
                  Open Map
                </Button>
              </Box>
            </Box>
          </Box>
        )}
      </Box>

      {/* Dialogs */}
      <NewMapDialog
        open={newMapOpen}
        onClose={() => setNewMapOpen(false)}
        onCreate={handleNewMap}
      />
      {dimPickerState && (
        <DimensionPickerDialog
          open={dimPickerState.open}
          filename={dimPickerState.filename}
          fileBuffer={dimPickerState.fileBuffer}
          clientPath={clientPath}
          onConfirm={handleDimConfirm}
          onCancel={handleDimCancel}
        />
      )}
    </Box>
  )
}

export default MapMakerPage
