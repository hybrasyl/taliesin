import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useRecoilValue } from 'recoil'
import {
  Box, Chip, Collapse, Divider, IconButton, List, ListItem, ListItemButton,
  ListItemText, Paper, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon        from '@mui/icons-material/Add'
import DeleteIcon     from '@mui/icons-material/Delete'
import EditIcon       from '@mui/icons-material/Edit'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import EditorHeader   from '../shared/EditorHeader'
import WarpDialog     from '../shared/WarpDialog'
import ClientMapSelect from './ClientMapSelect'
import WorldMapCanvas  from './WorldMapCanvas'
import { clientPathState } from '../../recoil/atoms'
import { clearFieldCache } from '../../utils/worldMapRenderer'
import {
  computeWorldMapFilename,
  type WorldMapData, type WorldMapPoint,
} from '../../data/worldMapData'
import type { MapWarp } from '../../data/mapData'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  worldMap: WorldMapData
  initialFileName: string | null
  isArchived: boolean
  isExisting: boolean
  mapNames: string[]
  onSave: (data: WorldMapData, fileName: string) => Promise<void>
  onArchive?: () => void
  onUnarchive?: () => void
  onDirtyChange: (dirty: boolean) => void
  saveRef: React.MutableRefObject<(() => Promise<void>) | null>
}

// ── Conversion helpers ────────────────────────────────────────────────────────

function pointToWarp(p: WorldMapPoint): MapWarp {
  return {
    x: p.x, y: p.y,
    targetType: 'map',
    mapTargetName: p.targetMap,
    mapTargetX: p.targetX,
    mapTargetY: p.targetY,
  }
}

function warpToPoint(warp: MapWarp, displayName: string, origX: number, origY: number): WorldMapPoint {
  return {
    x: origX, y: origY,
    name: displayName,
    targetMap: warp.mapTargetName ?? '',
    targetX: warp.mapTargetX ?? 0,
    targetY: warp.mapTargetY ?? 0,
  }
}

// ── Dialog state ──────────────────────────────────────────────────────────────

interface PointDialogState {
  canvasX: number
  canvasY: number
  editIndex?: number
  displayName: string
}

// ── Items group (right panel list) ────────────────────────────────────────────

interface ItemRow {
  key: number
  label: string
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onRemove: () => void
}

function ItemsGroup({ label, color, count, items, onAdd }: {
  label: string; color: string; count: number; items: ItemRow[]; onAdd: () => void
}) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <Box
        sx={{ px: 1.5, py: 0.75, display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', bgcolor: 'action.hover' }}
        onClick={() => setOpen(v => !v)}
      >
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
        <Typography variant="caption" sx={{ flex: 1, fontWeight: 600 }}>{label}</Typography>
        <Chip label={count} size="small" sx={{ height: 16, fontSize: 10 }} />
        <Tooltip title={`Place ${label.slice(0, -1)}`}>
          <IconButton size="small" onClick={e => { e.stopPropagation(); onAdd() }} sx={{ p: 0.25 }}>
            <AddIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
        {open ? <ExpandLessIcon sx={{ fontSize: 14 }} /> : <ExpandMoreIcon sx={{ fontSize: 14 }} />}
      </Box>
      <Collapse in={open}>
        {items.length === 0 ? (
          <Typography variant="caption" color="text.disabled" sx={{ px: 2, py: 0.5, display: 'block' }}>None placed</Typography>
        ) : (
          <List dense disablePadding>
            {items.map(item => (
              <ListItem
                key={item.key}
                disablePadding
                secondaryAction={
                  <Box sx={{ display: 'flex' }}>
                    <IconButton size="small" onClick={item.onEdit}   sx={{ p: 0.25 }}><EditIcon   sx={{ fontSize: 13 }} /></IconButton>
                    <IconButton size="small" onClick={item.onRemove} sx={{ p: 0.25 }}><DeleteIcon sx={{ fontSize: 13 }} /></IconButton>
                  </Box>
                }
              >
                <ListItemButton selected={item.selected} onClick={item.onSelect} sx={{ py: 0.25, pr: 7 }}>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{ variant: 'caption', noWrap: true, fontFamily: 'monospace' }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Collapse>
    </>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function WorldMapEditorPanel({
  worldMap,
  initialFileName,
  isArchived,
  isExisting,
  mapNames,
  onSave,
  onArchive,
  onUnarchive,
  onDirtyChange,
  saveRef,
}: Props) {
  const clientPath = useRecoilValue(clientPathState)

  const prevClientPath = useRef(clientPath)
  useEffect(() => {
    if (prevClientPath.current !== clientPath) {
      clearFieldCache()
      prevClientPath.current = clientPath
    }
  }, [clientPath])

  const [data,          setData]          = useState<WorldMapData>(worldMap)
  const [fileName,      setFileName]      = useState(initialFileName ?? computeWorldMapFilename(worldMap.name))
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [placeMode,     setPlaceMode]     = useState(false)
  const [dialogState,   setDialogState]   = useState<PointDialogState | null>(null)
  const isDirtyRef = useRef(false)

  useEffect(() => {
    setData(worldMap)
    setFileName(initialFileName ?? computeWorldMapFilename(worldMap.name))
    setSelectedIndex(null)
    setPlaceMode(false)
    setDialogState(null)
    isDirtyRef.current = false
    onDirtyChange(false)
  }, [worldMap, initialFileName]) // eslint-disable-line react-hooks/exhaustive-deps

  const markDirty = useCallback(() => {
    if (!isDirtyRef.current) { isDirtyRef.current = true; onDirtyChange(true) }
  }, [onDirtyChange])

  const updateData = useCallback(<K extends keyof WorldMapData>(key: K, value: WorldMapData[K]) => {
    setData(prev => {
      const next = { ...prev, [key]: value }
      if (key === 'name' && (fileName === computeWorldMapFilename(prev.name) || !initialFileName)) {
        setFileName(computeWorldMapFilename(next.name as string))
      }
      return next
    })
    markDirty()
  }, [fileName, initialFileName, markDirty])

  // ── Save ─────────────────────────────────────────────────────────────────

  const computedFileName = computeWorldMapFilename(data.name)

  const doSave = useCallback(async () => {
    await onSave(data, fileName)
    isDirtyRef.current = false
    onDirtyChange(false)
  }, [data, fileName, onSave, onDirtyChange])

  useEffect(() => { saveRef.current = doSave }, [doSave, saveRef])

  // ── Point actions ─────────────────────────────────────────────────────────

  const handlePlacePoint = useCallback((x: number, y: number) => {
    setPlaceMode(false)
    setDialogState({ canvasX: x, canvasY: y, displayName: '' })
  }, [])

  const handleEditPoint = useCallback((index: number) => {
    const p = data.points[index]
    if (!p) return
    setDialogState({ canvasX: p.x, canvasY: p.y, editIndex: index, displayName: p.name })
  }, [data.points])

  const handleRemovePoint = useCallback((index: number) => {
    setData(prev => ({ ...prev, points: prev.points.filter((_, i) => i !== index) }))
    setSelectedIndex(s => s === index ? null : (s !== null && s > index ? s - 1 : s))
    markDirty()
  }, [markDirty])

  const handleConfirmPoint = useCallback((warp: MapWarp) => {
    const ds = dialogState
    if (!ds) return
    const point = warpToPoint(warp, ds.displayName, ds.canvasX, ds.canvasY)
    if (ds.editIndex !== undefined) {
      setData(prev => ({ ...prev, points: prev.points.map((p, i) => i === ds.editIndex ? point : p) }))
      setSelectedIndex(ds.editIndex)
    } else {
      setData(prev => {
        const next = { ...prev, points: [...prev.points, point] }
        setSelectedIndex(next.points.length - 1)
        return next
      })
    }
    setDialogState(null)
    markDirty()
  }, [dialogState, markDirty])

  // ── WarpDialog initial (MapWarp shape from selected point) ────────────────

  const dialogInitial: MapWarp | null = dialogState?.editIndex !== undefined
    ? (() => { const p = data.points[dialogState.editIndex!]; return p ? pointToWarp(p) : null })()
    : null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <EditorHeader
        title={data.name || 'New World Map'}
        entityLabel="world map"
        fileName={fileName}
        initialFileName={initialFileName ?? undefined}
        computedFileName={computedFileName}
        isExisting={isExisting}
        isArchived={isArchived}
        onFileNameChange={setFileName}
        onRegenerate={() => setFileName(computedFileName)}
        onSave={doSave}
        onArchive={onArchive}
        onUnarchive={onUnarchive}
      />

      {/* Top fields row */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, pb: 1, flexShrink: 0, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          label="Name"
          value={data.name}
          onChange={e => updateData('name', e.target.value)}
          inputProps={{ spellCheck: false }}
          disabled={isArchived}
          sx={{ width: 240 }}
        />
        <ClientMapSelect
          value={data.clientMap}
          onChange={v => updateData('clientMap', v)}
          clientPath={clientPath}
          disabled={isArchived}
        />
      </Box>

      <Divider sx={{ mb: 1, flexShrink: 0 }} />

      {/* Toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">Place:</Typography>
        <Chip
          label="Point"
          size="small"
          clickable
          disabled={isArchived}
          color={placeMode ? 'primary' : 'default'}
          onClick={() => setPlaceMode(p => !p)}
        />
        {placeMode && (
          <Typography variant="caption" color="primary" sx={{ fontStyle: 'italic' }}>
            Click map to place
          </Typography>
        )}
      </Box>
      <Divider sx={{ mb: 1, flexShrink: 0 }} />

      {/* Main area: canvas + items panel */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', gap: 1 }}>
        <WorldMapCanvas
          fieldName={data.clientMap}
          clientPath={clientPath}
          points={data.points}
          selectedIndex={selectedIndex}
          placeMode={placeMode && !isArchived}
          onPointClick={i => { setSelectedIndex(s => s === i ? null : i); setPlaceMode(false) }}
          onPlacePoint={handlePlacePoint}
          sx={{ flex: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}
        />

        {/* Items panel */}
        <Box sx={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: 1 }}>
          <Paper variant="outlined" sx={{ p: 1, flexShrink: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#2196f3', flexShrink: 0 }} />
              <Typography variant="caption">Point — destination map tile</Typography>
            </Box>
          </Paper>

          <Box sx={{ flex: 1, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <ItemsGroup
              label="Points"
              color="#2196f3"
              count={data.points.length}
              onAdd={() => { if (!isArchived) setPlaceMode(p => !p) }}
              items={data.points.map((p, i) => ({
                key: i,
                label: `(${p.x},${p.y}) ${p.name || '?'} → ${p.targetMap || '?'}`,
                selected: selectedIndex === i,
                onSelect: () => setSelectedIndex(s => s === i ? null : i),
                onEdit:   () => handleEditPoint(i),
                onRemove: () => handleRemovePoint(i),
              }))}
            />
          </Box>
        </Box>
      </Box>

      {/* Point dialog */}
      {dialogState && (
        <WarpDialog
          open
          tileX={dialogState.canvasX}
          tileY={dialogState.canvasY}
          initial={dialogInitial}
          lockType="map"
          mapNames={mapNames}
          worldMapNames={[]}
          pointDisplayName={dialogState.displayName}
          onPointDisplayNameChange={name => setDialogState(s => s ? { ...s, displayName: name } : s)}
          onConfirm={handleConfirmPoint}
          onCancel={() => setDialogState(null)}
        />
      )}
    </Box>
  )
}
