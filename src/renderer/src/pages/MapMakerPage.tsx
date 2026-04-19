import React, { useState, useCallback, useRef } from 'react'
import {
  Box, Typography, Button, Divider, ToggleButton, ToggleButtonGroup,
  IconButton, Tooltip, Slider, Select, MenuItem,
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
import FormatColorFillIcon from '@mui/icons-material/FormatColorFill'
import TimelineIcon from '@mui/icons-material/Timeline'
import CropSquareIcon from '@mui/icons-material/CropSquare'
import SelectAllIcon from '@mui/icons-material/SelectAll'
import ShuffleIcon from '@mui/icons-material/Shuffle'
import GridOnIcon from '@mui/icons-material/GridOn'
import BlockIcon from '@mui/icons-material/Block'
import AspectRatioIcon from '@mui/icons-material/AspectRatio'
import ImageIcon from '@mui/icons-material/Image'
import AnimationIcon from '@mui/icons-material/Animation'
import CallSplitIcon from '@mui/icons-material/CallSplit'
import MapIcon from '@mui/icons-material/Map'
import ExtensionIcon from '@mui/icons-material/Extension'
import { useRecoilValue } from 'recoil'
import { clientPathState, activeLibraryState } from '../recoil/atoms'
import { MapFile, type MapTile } from '@eriscorp/dalib-ts'
import TilePicker, { type TileLayer } from '../components/mapmaker/TilePicker'
import MapEditorCanvas, { type EditorTool, type TileChange, type Selection, type Clipboard } from '../components/mapmaker/MapEditorCanvas'
import NewMapDialog from '../components/mapmaker/NewMapDialog'
import ResizeMapDialog from '../components/mapmaker/ResizeMapDialog'
import ExportMapDialog from '../components/mapmaker/ExportMapDialog'
import CreatePrefabDialog from '../components/mapmaker/CreatePrefabDialog'
import PrefabSidebar from '../components/mapmaker/PrefabSidebar'
import TabMapPopup from '../components/mapmaker/TabMapPopup'
import DirectionalResizeButtons from '../components/mapmaker/DirectionalResizeButtons'
import ShortcutHelpPanel from '../components/mapmaker/ShortcutHelpPanel'
import SplitMapDialog from '../components/mapmaker/SplitMapDialog'
import DimensionPickerDialog from '../components/catalog/DimensionPickerDialog'
import { applyChanges, revertChanges, type ShapeMode, type TileCoord } from '../utils/mapEditorTools'
import { floodFill } from '../utils/mapEditorTools'
import { sanitizePrefabName, trimPrefab, type Prefab } from '../utils/prefabTypes'
import { type MapAssets } from '../utils/mapRenderer'

// ── Undo types ───────────────────────────────────────────────────────────────

type UndoGroup = TileChange[]
const MAX_UNDO = 100

// ── Component ────────────────────────────────────────────────────────────────

const MapMakerPage: React.FC = () => {
  const clientPath = useRecoilValue(clientPathState)
  const activeLibrary = useRecoilValue(activeLibraryState)

  // Map state
  const [mapFile, setMapFile] = useState<MapFile | null>(null)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  // Tool state
  const [tool, setTool] = useState<EditorTool>('draw')
  const [activeLayer, setActiveLayer] = useState<TileLayer>('background')
  const [selectedTileIds, setSelectedTileIds] = useState<number[]>([1])
  const [zoom, setZoom] = useState(1)
  const [shapeMode, setShapeMode] = useState<ShapeMode>('rect-outline')
  const [showGrid, setShowGrid] = useState(true)
  const [showBg, setShowBg] = useState(true)
  const [showLfg, setShowLfg] = useState(true)
  const [showRfg, setShowRfg] = useState(true)
  const [showPassability, setShowPassability] = useState(false)
  const [showAnimation, setShowAnimation] = useState(true)
  const [lastFgLayer, setLastFgLayer] = useState<'leftForeground' | 'rightForeground'>('leftForeground')

  // Status bar
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Selection / clipboard / paste
  const [selection, setSelection] = useState<Selection | null>(null)
  const [clipboard, setClipboard] = useState<Clipboard | null>(null)
  const [pasteMode, setPasteMode] = useState(false)

  // Hover
  const [hoverTile, setHoverTile] = useState<{ tx: number; ty: number } | null>(null)

  // Undo/redo
  const [undoStack, setUndoStack] = useState<UndoGroup[]>([])
  const [redoStack, setRedoStack] = useState<UndoGroup[]>([])

  // Dialogs
  const [newMapOpen, setNewMapOpen] = useState(false)
  const [resizeOpen, setResizeOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [createPrefabOpen, setCreatePrefabOpen] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const [showPrefabSidebar, setShowPrefabSidebar] = useState(false)
  const [showTabMap, setShowTabMap] = useState(false)
  const [stampPrefab, setStampPrefab] = useState<Prefab | null>(null)
  const prefabSidebarRef = useRef<{ refresh: () => void }>(null)
  const [dimPickerState, setDimPickerState] = useState<{
    open: boolean; filePath: string; filename: string; fileBuffer: Uint8Array
  } | null>(null)

  const [canvasKey, setCanvasKey] = useState(0)

  // Derived
  const selectedTileId = selectedTileIds[0] ?? 0

  const showStatus = useCallback((msg: string) => {
    setStatusMessage(msg)
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current)
    statusTimeoutRef.current = setTimeout(() => setStatusMessage(null), 2500)
  }, [])

  // ── New / Open / Save ──────────────────────────────────────────────────────

  const handleNewMap = useCallback((width: number, height: number) => {
    setMapFile(new MapFile(width, height))
    setFilePath(null)
    setDirty(false)
    setUndoStack([]); setRedoStack([])
    setSelection(null); setPasteMode(false)
    setCanvasKey(k => k + 1)
  }, [])

  const handleOpenMap = useCallback(async () => {
    const path = await window.api.openFile([{ name: 'DA Map Files', extensions: ['map'] }])
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
    setUndoStack([]); setRedoStack([])
    setSelection(null); setPasteMode(false)
    setCanvasKey(k => k + 1)
    setDimPickerState(null)
  }, [dimPickerState])

  const handleSave = useCallback(async () => {
    if (!mapFile) return
    let savePath = filePath
    if (!savePath) {
      savePath = await window.api.saveFile([{ name: 'DA Map Files', extensions: ['map'] }])
      if (!savePath) return
    }
    await window.api.writeBytes(savePath, mapFile.toUint8Array())
    setFilePath(savePath); setDirty(false)
    showStatus('Saved')
  }, [mapFile, filePath, showStatus])

  const handleSaveAs = useCallback(async () => {
    if (!mapFile) return
    const savePath = await window.api.saveFile([{ name: 'DA Map Files', extensions: ['map'] }])
    if (!savePath) return
    await window.api.writeBytes(savePath, mapFile.toUint8Array())
    setFilePath(savePath); setDirty(false)
    showStatus('Saved')
  }, [mapFile, showStatus])

  // ── Tile changes + undo/redo ───────────────────────────────────────────────

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
    setSelectedTileIds([tileId])
    setTool('draw')
  }, [])

  const handleUndo = useCallback(() => {
    if (!mapFile || undoStack.length === 0) return
    const group = undoStack[undoStack.length - 1]
    revertChanges(mapFile, group)
    setUndoStack(prev => prev.slice(0, -1))
    setRedoStack(prev => [...prev, group])
    setCanvasKey(k => k + 1)
    setDirty(true)
    showStatus('Undo')
  }, [mapFile, undoStack, showStatus])

  const handleRedo = useCallback(() => {
    if (!mapFile || redoStack.length === 0) return
    const group = redoStack[redoStack.length - 1]
    applyChanges(mapFile, group)
    setRedoStack(prev => prev.slice(0, -1))
    setUndoStack(prev => [...prev, group])
    setCanvasKey(k => k + 1)
    setDirty(true)
    showStatus('Redo')
  }, [mapFile, redoStack, showStatus])

  // ── Clipboard ──────────────────────────────────────────────────────────────

  const copySelection = useCallback(() => {
    if (!mapFile || !selection) return
    const tiles: MapTile[] = []
    for (let dy = 0; dy < selection.h; dy++) {
      for (let dx = 0; dx < selection.w; dx++) {
        const tx = selection.x + dx
        const ty = selection.y + dy
        if (tx < mapFile.width && ty < mapFile.height) {
          tiles.push({ ...mapFile.getTile(tx, ty) })
        } else {
          tiles.push({ background: 0, leftForeground: 0, rightForeground: 0 })
        }
      }
    }
    setClipboard({ tiles, w: selection.w, h: selection.h })
    showStatus(`Copied ${selection.w}×${selection.h} tiles`)
  }, [mapFile, selection, showStatus])

  const cutSelection = useCallback(() => {
    if (!mapFile || !selection) return
    copySelection()
    // Clear selected area
    const changes: TileChange[] = []
    for (let dy = 0; dy < selection.h; dy++) {
      for (let dx = 0; dx < selection.w; dx++) {
        const tx = selection.x + dx
        const ty = selection.y + dy
        if (tx >= mapFile.width || ty >= mapFile.height) continue
        const tile = mapFile.getTile(tx, ty)
        for (const layer of ['background', 'leftForeground', 'rightForeground'] as const) {
          if (tile[layer] !== 0) {
            changes.push({ x: tx, y: ty, layer, oldValue: tile[layer], newValue: 0 })
          }
        }
      }
    }
    if (changes.length > 0) {
      applyChanges(mapFile, changes)
      handleTileChange(changes)
      setCanvasKey(k => k + 1)
    }
    setSelection(null)
  }, [mapFile, selection, copySelection, handleTileChange])

  const deleteSelection = useCallback(() => {
    if (!mapFile || !selection) return
    const changes: TileChange[] = []
    for (let dy = 0; dy < selection.h; dy++) {
      for (let dx = 0; dx < selection.w; dx++) {
        const tx = selection.x + dx
        const ty = selection.y + dy
        if (tx >= mapFile.width || ty >= mapFile.height) continue
        const tile = mapFile.getTile(tx, ty)
        for (const layer of ['background', 'leftForeground', 'rightForeground'] as const) {
          if (tile[layer] !== 0) {
            changes.push({ x: tx, y: ty, layer, oldValue: tile[layer], newValue: 0 })
          }
        }
      }
    }
    if (changes.length > 0) {
      applyChanges(mapFile, changes)
      handleTileChange(changes)
      setCanvasKey(k => k + 1)
    }
    setSelection(null)
  }, [mapFile, selection, handleTileChange])

  const handleRequestPaste = useCallback((tx: number, ty: number, keepPasting: boolean) => {
    if (!mapFile || !clipboard) return
    const changes: TileChange[] = []
    for (let dy = 0; dy < clipboard.h; dy++) {
      for (let dx = 0; dx < clipboard.w; dx++) {
        const destX = tx + dx
        const destY = ty + dy
        if (destX < 0 || destY < 0 || destX >= mapFile.width || destY >= mapFile.height) continue
        const clipTile = clipboard.tiles[dy * clipboard.w + dx]
        const existingTile = mapFile.getTile(destX, destY)
        for (const layer of ['background', 'leftForeground', 'rightForeground'] as const) {
          if (clipTile[layer] !== 0 && clipTile[layer] !== existingTile[layer]) {
            changes.push({ x: destX, y: destY, layer, oldValue: existingTile[layer], newValue: clipTile[layer] })
          }
        }
      }
    }
    if (changes.length > 0) {
      applyChanges(mapFile, changes)
      handleTileChange(changes)
      setCanvasKey(k => k + 1)
    }
    if (!keepPasting) setPasteMode(false)
  }, [mapFile, clipboard, handleTileChange])

  // ── Selection move/duplicate ───────────────────────────────────────────────

  const handleSelectionMove = useCallback((dx: number, dy: number, duplicate: boolean) => {
    if (!mapFile || !selection) return
    const changes: TileChange[] = []

    // Read source tiles
    const srcTiles: MapTile[] = []
    for (let sy = 0; sy < selection.h; sy++) {
      for (let sx = 0; sx < selection.w; sx++) {
        const tx = selection.x + sx
        const ty = selection.y + sy
        if (tx < mapFile.width && ty < mapFile.height) {
          srcTiles.push({ ...mapFile.getTile(tx, ty) })
        } else {
          srcTiles.push({ background: 0, leftForeground: 0, rightForeground: 0 })
        }
      }
    }

    // Clear source (unless duplicating)
    if (!duplicate) {
      for (let sy = 0; sy < selection.h; sy++) {
        for (let sx = 0; sx < selection.w; sx++) {
          const tx = selection.x + sx
          const ty = selection.y + sy
          if (tx >= mapFile.width || ty >= mapFile.height) continue
          const tile = mapFile.getTile(tx, ty)
          for (const layer of ['background', 'leftForeground', 'rightForeground'] as const) {
            if (tile[layer] !== 0) {
              changes.push({ x: tx, y: ty, layer, oldValue: tile[layer], newValue: 0 })
            }
          }
        }
      }
    }

    // Place at destination
    for (let sy = 0; sy < selection.h; sy++) {
      for (let sx = 0; sx < selection.w; sx++) {
        const destX = selection.x + sx + dx
        const destY = selection.y + sy + dy
        if (destX < 0 || destY < 0 || destX >= mapFile.width || destY >= mapFile.height) continue
        const srcTile = srcTiles[sy * selection.w + sx]
        const existing = mapFile.getTile(destX, destY)
        for (const layer of ['background', 'leftForeground', 'rightForeground'] as const) {
          if (srcTile[layer] !== existing[layer]) {
            // Check if this position was already changed (from clear step)
            const existingChange = changes.find(c => c.x === destX && c.y === destY && c.layer === layer)
            if (existingChange) {
              existingChange.newValue = srcTile[layer]
            } else {
              changes.push({ x: destX, y: destY, layer, oldValue: existing[layer], newValue: srcTile[layer] })
            }
          }
        }
      }
    }

    if (changes.length > 0) {
      applyChanges(mapFile, changes)
      handleTileChange(changes)
      setCanvasKey(k => k + 1)
    }

    // Move selection to new position
    setSelection({
      x: selection.x + dx,
      y: selection.y + dy,
      w: selection.w,
      h: selection.h,
    })
  }, [mapFile, selection, handleTileChange])

  // ── Map resize ─────────────────────────────────────────────────────────────

  const handleResize = useCallback((newW: number, newH: number) => {
    if (!mapFile) return
    const oldW = mapFile.width
    const oldH = mapFile.height
    const newMap = new MapFile(newW, newH)
    const copyW = Math.min(oldW, newW)
    const copyH = Math.min(oldH, newH)

    // Store all old tiles for undo
    const changes: TileChange[] = []
    for (let y = 0; y < copyH; y++) {
      for (let x = 0; x < copyW; x++) {
        const src = mapFile.getTile(x, y)
        newMap.setTile(x, y, { ...src })
      }
    }

    setMapFile(newMap)
    setDirty(true)
    setUndoStack([]); setRedoStack([])
    setSelection(null); setPasteMode(false)
    setCanvasKey(k => k + 1)
    showStatus(`Resized to ${newW}×${newH}`)
  }, [mapFile, showStatus])

  // ── Context menu action handler ────────────────────────────────────────────

  const handleContextAction = useCallback((action: string, tile?: TileCoord) => {
    switch (action) {
      case 'cut': cutSelection(); break
      case 'copy': copySelection(); break
      case 'delete': deleteSelection(); break
      case 'paste': if (clipboard) setPasteMode(true); break
      case 'sample':
        if (tile && mapFile) {
          const t = mapFile.getTile(tile.tx, tile.ty)
          handleSampleTile(t[activeLayer])
        }
        break
      case 'fillHere':
        if (tile && mapFile) {
          const changes = floodFill(mapFile, tile.tx, tile.ty, activeLayer, selectedTileId)
          if (changes.length > 0) {
            applyChanges(mapFile, changes)
            handleTileChange(changes)
            setCanvasKey(k => k + 1)
            showStatus(`Filled ${changes.length} tiles`)
          }
        }
        break
      case 'toggleBg': setShowBg(v => !v); break
      case 'toggleLfg': setShowLfg(v => !v); break
      case 'toggleRfg': setShowRfg(v => !v); break
      case 'togglePassability': setShowPassability(v => !v); break
      case 'tool-draw': setTool('draw'); break
      case 'tool-erase': setTool('erase'); break
      case 'tool-fill': setTool('fill'); break
      case 'tool-line': setTool('line'); break
      case 'tool-shape': setTool('shape'); break
      case 'tool-select': setTool('select'); break
      case 'createPrefab': if (selection) setCreatePrefabOpen(true); break
    }
  }, [cutSelection, copySelection, deleteSelection, clipboard, mapFile, activeLayer, selectedTileId, handleSampleTile, handleTileChange, showStatus, selection])

  // ── Create prefab from selection ────────────────────────────────────────────

  const handleCreatePrefab = useCallback(async (name: string, includeGround: boolean) => {
    if (!mapFile || !selection || !activeLibrary) return
    const tiles: { background: number; leftForeground: number; rightForeground: number }[] = []
    for (let dy = 0; dy < selection.h; dy++) {
      for (let dx = 0; dx < selection.w; dx++) {
        const tx = selection.x + dx
        const ty = selection.y + dy
        if (tx < mapFile.width && ty < mapFile.height) {
          const t = mapFile.getTile(tx, ty)
          tiles.push({
            background: includeGround ? t.background : 0,
            leftForeground: t.leftForeground,
            rightForeground: t.rightForeground,
          })
        } else {
          tiles.push({ background: 0, leftForeground: 0, rightForeground: 0 })
        }
      }
    }
    const prefab: Prefab = { name, width: selection.w, height: selection.h, tiles, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const trimmed = trimPrefab(prefab)
    const filename = sanitizePrefabName(name) + '.json'
    await window.api.prefabSave(activeLibrary, filename, trimmed)
    showStatus(`Prefab "${name}" saved`)
  }, [mapFile, selection, activeLibrary, showStatus])

  // ── Stamp prefab ───────────────────────────────────────────────────────────

  const handleStampPrefab = useCallback((prefab: Prefab) => {
    // Convert prefab to clipboard format and enter paste mode
    const clipTiles: MapTile[] = prefab.tiles.map(t => ({
      background: t.background,
      leftForeground: t.leftForeground,
      rightForeground: t.rightForeground,
    }))
    setClipboard({ tiles: clipTiles, w: prefab.width, h: prefab.height })
    setPasteMode(true)
    showStatus(`Stamping: ${prefab.name}`)
  }, [showStatus])

  // ── Directional resize ─────────────────────────────────────────────────────

  const handleDirectionalResize = useCallback((side: 'top' | 'bottom' | 'left' | 'right', delta: number) => {
    if (!mapFile) return
    const oldW = mapFile.width
    const oldH = mapFile.height

    let newW = oldW, newH = oldH
    let offsetX = 0, offsetY = 0

    if (side === 'top')    { newH += delta; offsetY = delta > 0 ? delta : 0 }
    if (side === 'bottom') { newH += delta }
    if (side === 'left')   { newW += delta; offsetX = delta > 0 ? delta : 0 }
    if (side === 'right')  { newW += delta }

    if (newW < 1 || newH < 1 || newW > 512 || newH > 512) return

    const newMap = new MapFile(newW, newH)

    // Copy tiles with offset
    const srcStartX = delta < 0 && side === 'left' ? Math.abs(delta) : 0
    const srcStartY = delta < 0 && side === 'top' ? Math.abs(delta) : 0

    for (let y = 0; y < oldH; y++) {
      for (let x = 0; x < oldW; x++) {
        const destX = x + offsetX - srcStartX
        const destY = y + offsetY - srcStartY
        if (destX >= 0 && destX < newW && destY >= 0 && destY < newH) {
          if (x >= srcStartX && y >= srcStartY) {
            newMap.setTile(destX, destY, { ...mapFile.getTile(x, y) })
          }
        }
      }
    }

    setMapFile(newMap)
    setDirty(true)
    setUndoStack([]); setRedoStack([])
    setSelection(null); setPasteMode(false)
    setCanvasKey(k => k + 1)
    const label = side === 'top' || side === 'bottom' ? 'row' : 'column'
    const action = delta > 0 ? 'Added' : 'Removed'
    showStatus(`${action} ${label} at ${side} (${newW}×${newH})`)
  }, [mapFile, showStatus])

  // ── Tile picker callbacks ──────────────────────────────────────────────────

  const handleSelectTile = useCallback((id: number) => {
    setSelectedTileIds([id])
  }, [])

  const handleSelectTiles = useCallback((ids: number[]) => {
    setSelectedTileIds(ids.length > 0 ? ids : [0])
  }, [])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Ctrl combinations
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); handleUndo(); return }
    if (e.ctrlKey && e.key === 'y') { e.preventDefault(); handleRedo(); return }
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault()
      if (e.shiftKey) handleSaveAs(); else handleSave()
      return
    }
    if (e.ctrlKey && e.key === 'c') { e.preventDefault(); copySelection(); return }
    if (e.ctrlKey && e.key === 'x') { e.preventDefault(); cutSelection(); return }
    if (e.ctrlKey && e.key === 'v') {
      e.preventDefault()
      if (clipboard) setPasteMode(true)
      return
    }

    // Delete/Backspace
    if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
      e.preventDefault(); deleteSelection(); return
    }

    // Escape
    if (e.key === 'Escape') {
      if (pasteMode) { setPasteMode(false); return }
      if (selection) { setSelection(null); return }
    }

    // Tool shortcuts (no modifiers)
    if (e.ctrlKey || e.metaKey) return
    switch (e.key) {
      case 'd': setTool('draw'); break
      case 'e': setTool('erase'); break
      case 's': setTool('sample'); break
      case 'g': if (!e.shiftKey) setShowGrid(g => !g); else setTool('fill'); break
      case 'l': setTool('line'); break
      case 'u': if (e.shiftKey) {
          setShapeMode(prev => {
            const modes: ShapeMode[] = ['rect-outline', 'rect-filled', 'circle-outline', 'circle-filled']
            return modes[(modes.indexOf(prev) + 1) % modes.length]
          })
        } else { setTool('shape') }
        break
      case 'v': setTool('select'); break
      case 'r': setTool('randomFill'); break
      case 'f': setActiveLayer(prev =>
          prev === 'leftForeground' ? 'rightForeground'
          : prev === 'rightForeground' ? 'leftForeground'
          : prev
        ); break
      case 'G': setTool('fill'); break  // Shift+G = fill
      case 'p': if (stampPrefab) { handleStampPrefab(stampPrefab) } break
      case 't': {
        // Toggle ground ↔ wall
        if (activeLayer === 'background') {
          setActiveLayer(lastFgLayer)
        } else {
          setLastFgLayer(activeLayer as 'leftForeground' | 'rightForeground')
          setActiveLayer('background')
        }
        break
      }
    }
  }, [handleUndo, handleRedo, handleSave, handleSaveAs, copySelection, cutSelection, deleteSelection, clipboard, pasteMode, selection])

  // ── File name ──────────────────────────────────────────────────────────────

  const fileName = filePath
    ? filePath.replace(/\\/g, '/').split('/').pop()
    : mapFile ? 'Untitled.map' : null

  // ── Render ─────────────────────────────────────────────────────────────────

  const toolBtnSx = {
    '& .MuiToggleButton-root': { color: 'text.primary', px: 0.75 },
    '& .MuiToggleButton-root.Mui-selected': { color: 'info.light', bgcolor: 'action.selected' },
  } as const

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
        {/* File ops */}
        <Tooltip title="New Map"><IconButton size="small" onClick={() => setNewMapOpen(true)}><AddIcon fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="Open Map"><IconButton size="small" onClick={handleOpenMap}><FolderOpenIcon fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="Save (Ctrl+S)"><span><IconButton size="small" onClick={handleSave} disabled={!mapFile}><SaveIcon fontSize="small" /></IconButton></span></Tooltip>
        <Tooltip title="Save As (Ctrl+Shift+S)"><span><IconButton size="small" onClick={handleSaveAs} disabled={!mapFile}><SaveAsIcon fontSize="small" /></IconButton></span></Tooltip>

        <Divider orientation="vertical" flexItem />

        {/* Tools */}
        <ToggleButtonGroup value={tool} exclusive onChange={(_, v) => v && setTool(v)} size="small" sx={toolBtnSx}>
          <ToggleButton value="draw"><Tooltip title="Draw (D)"><BrushIcon fontSize="small" /></Tooltip></ToggleButton>
          <ToggleButton value="erase"><Tooltip title="Erase (E)"><DeleteIcon fontSize="small" /></Tooltip></ToggleButton>
          <ToggleButton value="sample"><Tooltip title="Sample (S / Alt+click)"><ColorizeIcon fontSize="small" /></Tooltip></ToggleButton>
          <ToggleButton value="fill"><Tooltip title="Fill (Shift+G)"><FormatColorFillIcon fontSize="small" /></Tooltip></ToggleButton>
          <ToggleButton value="line"><Tooltip title="Line (L)"><TimelineIcon fontSize="small" /></Tooltip></ToggleButton>
          <ToggleButton value="shape"><Tooltip title="Shape (U, Shift+U cycle)"><CropSquareIcon fontSize="small" /></Tooltip></ToggleButton>
          <ToggleButton value="select"><Tooltip title="Select (V)"><SelectAllIcon fontSize="small" /></Tooltip></ToggleButton>
          <ToggleButton value="randomFill"><Tooltip title="Random Fill (R)"><ShuffleIcon fontSize="small" /></Tooltip></ToggleButton>
        </ToggleButtonGroup>

        {/* Shape mode selector */}
        {tool === 'shape' && (
          <Select
            value={shapeMode}
            onChange={(e) => setShapeMode(e.target.value as ShapeMode)}
            size="small"
            sx={{ fontSize: '0.7rem', height: 28, minWidth: 100, color: 'text.primary' }}
          >
            <MenuItem value="rect-outline">Rect Outline</MenuItem>
            <MenuItem value="rect-filled">Rect Filled</MenuItem>
            <MenuItem value="circle-outline">Circle Outline</MenuItem>
            <MenuItem value="circle-filled">Circle Filled</MenuItem>
          </Select>
        )}

        <Divider orientation="vertical" flexItem />

        {/* Undo/redo */}
        <Tooltip title="Undo (Ctrl+Z)"><span><IconButton size="small" onClick={handleUndo} disabled={undoStack.length === 0}><UndoIcon fontSize="small" /></IconButton></span></Tooltip>
        <Tooltip title="Redo (Ctrl+Y)"><span><IconButton size="small" onClick={handleRedo} disabled={redoStack.length === 0}><RedoIcon fontSize="small" /></IconButton></span></Tooltip>

        <Divider orientation="vertical" flexItem />

        {/* Zoom */}
        <Typography variant="caption" color="text.primary" sx={{ minWidth: 35 }}>{Math.round(zoom * 100)}%</Typography>
        <Slider
          value={zoom} onChange={(_, v) => setZoom(v as number)}
          min={0.25} max={2} step={0.25}
          sx={{ width: 100, '& .MuiSlider-thumb': { color: 'text.primary' }, '& .MuiSlider-track': { color: 'text.primary' }, '& .MuiSlider-rail': { color: 'text.secondary' } }}
          size="small"
        />

        <Tooltip title="Toggle Grid (G)">
          <IconButton size="small" onClick={() => setShowGrid(g => !g)} sx={{ color: showGrid ? 'info.light' : 'text.primary' }}>
            <GridOnIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem />

        {/* Layer visibility */}
        <Tooltip title="Toggle Background"><IconButton size="small" onClick={() => setShowBg(v => !v)} sx={{ color: showBg ? 'text.primary' : 'error.main' }}><Typography sx={{ fontSize: '0.65rem', fontWeight: 'bold', lineHeight: 1 }}>BG</Typography></IconButton></Tooltip>
        <Tooltip title="Toggle Left Foreground"><IconButton size="small" onClick={() => setShowLfg(v => !v)} sx={{ color: showLfg ? 'text.primary' : 'error.main' }}><Typography sx={{ fontSize: '0.6rem', fontWeight: 'bold', lineHeight: 1 }}>LF</Typography></IconButton></Tooltip>
        <Tooltip title="Toggle Right Foreground"><IconButton size="small" onClick={() => setShowRfg(v => !v)} sx={{ color: showRfg ? 'text.primary' : 'error.main' }}><Typography sx={{ fontSize: '0.6rem', fontWeight: 'bold', lineHeight: 1 }}>RF</Typography></IconButton></Tooltip>
        <Tooltip title="Show Passability"><IconButton size="small" onClick={() => setShowPassability(v => !v)} sx={{ color: showPassability ? 'warning.main' : 'text.primary' }}><BlockIcon fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="Toggle Animation"><IconButton size="small" onClick={() => setShowAnimation(v => !v)} sx={{ color: showAnimation ? 'info.light' : 'text.primary' }}><AnimationIcon fontSize="small" /></IconButton></Tooltip>

        <Divider orientation="vertical" flexItem />

        {/* Map operations */}
        <Tooltip title="Resize Map"><span><IconButton size="small" onClick={() => setResizeOpen(true)} disabled={!mapFile}><AspectRatioIcon fontSize="small" /></IconButton></span></Tooltip>
        <Tooltip title="Export PNG"><span><IconButton size="small" onClick={() => setExportOpen(true)} disabled={!mapFile}><ImageIcon fontSize="small" /></IconButton></span></Tooltip>
        <Tooltip title="Split Map"><span><IconButton size="small" onClick={() => setSplitOpen(true)} disabled={!mapFile}><CallSplitIcon fontSize="small" /></IconButton></span></Tooltip>

        <Divider orientation="vertical" flexItem />

        <Tooltip title="Prefab Sidebar">
          <IconButton size="small" onClick={() => setShowPrefabSidebar(v => !v)} sx={{ color: showPrefabSidebar ? 'info.light' : 'text.primary' }}>
            <ExtensionIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Collision Map">
          <span>
            <IconButton size="small" onClick={() => setShowTabMap(v => !v)} disabled={!mapFile} sx={{ color: showTabMap ? 'info.light' : 'text.primary' }}>
              <MapIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <ShortcutHelpPanel />

        {/* Status */}
        <Box sx={{ flexGrow: 1 }} />
        {statusMessage && (
          <Typography variant="caption" sx={{ color: 'success.light', fontWeight: 'bold', mr: 1 }}>
            {statusMessage}
          </Typography>
        )}
        {pasteMode && <Typography variant="caption" color="warning.main">PASTE MODE (click to place, Shift+click repeat, Esc cancel)</Typography>}
        {fileName && (
          <Typography variant="caption" color="text.secondary" noWrap>
            {fileName}{dirty ? ' *' : ''} {mapFile ? `(${mapFile.width}×${mapFile.height})` : ''}
          </Typography>
        )}
        {hoverTile && mapFile && (() => {
          const t = mapFile.getTile(hoverTile.tx, hoverTile.ty)
          return (
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
              ({hoverTile.tx}, {hoverTile.ty}) · bg:{t.background} lf:{t.leftForeground} rf:{t.rightForeground}
            </Typography>
          )
        })()}
        {selectedTileIds.length > 1 && (
          <Typography variant="caption" color="text.disabled">
            {selectedTileIds.length} tiles selected
          </Typography>
        )}
        {selectedTileIds.length === 1 && selectedTileId > 0 && (
          <Typography variant="caption" color="text.disabled">brush: {selectedTileId}</Typography>
        )}
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: tile picker */}
        <Box sx={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid', borderColor: 'divider' }}>
          <TilePicker
            clientPath={clientPath}
            activeLayer={activeLayer}
            selectedTileId={selectedTileId}
            selectedTileIds={selectedTileIds}
            onSelectTile={handleSelectTile}
            onSelectTiles={handleSelectTiles}
            onLayerChange={setActiveLayer}
          />
        </Box>

        {/* Center: canvas + directional resize */}
        {mapFile ? (
          <Box sx={{ flex: 1, position: 'relative', display: 'flex' }}>
            <MapEditorCanvas
              key={canvasKey}
              mapFile={mapFile}
              clientPath={clientPath}
              tool={tool}
              activeLayer={activeLayer}
              selectedTileId={selectedTileId}
              selectedTileIds={selectedTileIds}
              zoom={zoom}
              shapeMode={shapeMode}
              showGrid={showGrid}
              showBg={showBg}
              showLfg={showLfg}
              showRfg={showRfg}
              showPassability={showPassability}
              selection={selection}
              clipboard={clipboard}
              pasteMode={pasteMode}
              onTileChange={handleTileChange}
              onSampleTile={handleSampleTile}
              onHoverTile={setHoverTile}
              onZoomChange={setZoom}
              onSelectionChange={setSelection}
              onRequestPaste={handleRequestPaste}
              onSelectionMove={handleSelectionMove}
              showAnimation={showAnimation}
              onContextAction={handleContextAction}
            />
            <DirectionalResizeButtons
              mapWidth={mapFile.width}
              mapHeight={mapFile.height}
              onResize={handleDirectionalResize}
            />
          </Box>
        ) : (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography color="text.secondary" gutterBottom>Create a new map or open an existing one.</Typography>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 2 }}>
                <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setNewMapOpen(true)}>New Map</Button>
                <Button variant="outlined" startIcon={<FolderOpenIcon />} onClick={handleOpenMap}>Open Map</Button>
              </Box>
            </Box>
          </Box>
        )}

        {/* Right: prefab sidebar */}
        {showPrefabSidebar && (
          <Box sx={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid', borderColor: 'divider' }}>
            <PrefabSidebar
              libraryPath={activeLibrary}
              onStampPrefab={handleStampPrefab}
              onStatus={showStatus}
            />
          </Box>
        )}
      </Box>

      {/* Tab map floating popup */}
      {showTabMap && mapFile && (
        <TabMapPopup
          mapFile={mapFile}
          clientPath={clientPath}
          onClose={() => setShowTabMap(false)}
        />
      )}

      {/* Dialogs */}
      <NewMapDialog open={newMapOpen} onClose={() => setNewMapOpen(false)} onCreate={handleNewMap} />
      {selection && (
        <CreatePrefabDialog
          open={createPrefabOpen}
          selectionWidth={selection.w}
          selectionHeight={selection.h}
          onClose={() => setCreatePrefabOpen(false)}
          onCreate={handleCreatePrefab}
        />
      )}
      {dimPickerState && (
        <DimensionPickerDialog
          open={dimPickerState.open} filename={dimPickerState.filename}
          fileBuffer={dimPickerState.fileBuffer} clientPath={clientPath}
          onConfirm={handleDimConfirm} onCancel={() => setDimPickerState(null)}
        />
      )}
      {mapFile && (
        <ResizeMapDialog
          open={resizeOpen}
          currentWidth={mapFile.width}
          currentHeight={mapFile.height}
          onClose={() => setResizeOpen(false)}
          onResize={handleResize}
        />
      )}
      {mapFile && (
        <ExportMapDialog
          open={exportOpen}
          mapFile={mapFile}
          mapFilePath={filePath}
          clientPath={clientPath}
          onClose={() => setExportOpen(false)}
          onStatus={showStatus}
        />
      )}
      {mapFile && (
        <SplitMapDialog
          open={splitOpen}
          mapFile={mapFile}
          clientPath={clientPath}
          onClose={() => setSplitOpen(false)}
          onStatus={showStatus}
        />
      )}
    </Box>
  )
}

export default MapMakerPage
