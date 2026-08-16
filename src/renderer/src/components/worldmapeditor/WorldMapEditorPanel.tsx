import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Chip,
  Collapse,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  TextField,
  Tooltip,
  Typography
} from '@mui/material'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import LinkIcon from '@mui/icons-material/Link'
import RestoreIcon from '@mui/icons-material/Restore'
import StarIcon from '@mui/icons-material/Star'
import SyncIcon from '@mui/icons-material/Sync'
import EditorHeader from '../shared/EditorHeader'
import { ItemsGroup } from '../shared/ItemsGroup'
import WarpDialog from '../shared/WarpDialog'
import ClientMapSelect from './ClientMapSelect'
import WorldMapCanvas from './WorldMapCanvas'
import { useSettingsStore } from '../../store/settingsStore'
import { clearFieldCache } from '../../utils/worldMapRenderer'
import { normalizeFolder } from '../../utils/fileTree'
import {
  computeWorldMapFilename,
  overlappingPointPairs,
  referenceFilenameFor,
  pointKey,
  type WorldMapData,
  type WorldMapMeta,
  type WorldMapPoint
} from '../../data/worldMapData'
import type { MapWarp } from '../../data/mapData'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  worldMap: WorldMapData
  initialFileName: string | null
  /** Folder the selected file lives in, `''` at the type root. */
  initialFolder: string
  /** Folders already in use, offered as save destinations. */
  folderOptions: string[]
  isTemplate: boolean
  isReferenceSet?: boolean
  isExisting: boolean
  mapNames: string[]
  meta: WorldMapMeta | null
  referencePoints: WorldMapPoint[] | null
  onSave: (data: WorldMapData, fileName: string, folder: string) => Promise<void>
  onMoveToTemplates?: () => void
  onMoveToActive?: () => void
  onDirtyChange: (dirty: boolean) => void
  onExclude: (key: string) => void
  onRestore: (key: string) => void
  onSyncRequest: () => void
  onLinkToReference: () => void
  saveRef: React.MutableRefObject<(() => Promise<void>) | null>
}

// ── Conversion helpers ────────────────────────────────────────────────────────

function pointToWarp(p: WorldMapPoint): MapWarp {
  return {
    x: p.x,
    y: p.y,
    targetType: 'map',
    mapTargetName: p.targetMap,
    mapTargetX: p.targetX,
    mapTargetY: p.targetY
  }
}

function warpToPoint(
  warp: MapWarp,
  displayName: string,
  origX: number,
  origY: number
): WorldMapPoint {
  return {
    x: origX,
    y: origY,
    name: displayName,
    targetMap: warp.mapTargetName ?? '',
    targetX: warp.mapTargetX ?? 0,
    targetY: warp.mapTargetY ?? 0
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

interface ExcludedRow {
  key: string
  label: string
  onRestore: () => void
}

function ExcludedGroup({ items }: { items: ExcludedRow[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Box
        sx={{
          px: 1.5,
          py: 0.75,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: 'pointer',
          bgcolor: 'action.hover'
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <Box
          sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'text.disabled', flexShrink: 0 }}
        />
        <Typography variant="caption" sx={{ flex: 1, fontWeight: 600, color: 'text.secondary' }}>
          Excluded
        </Typography>
        <Chip label={items.length} size="small" sx={{ height: 16, fontSize: 10 }} />
        {open ? <ExpandLessIcon sx={{ fontSize: 14 }} /> : <ExpandMoreIcon sx={{ fontSize: 14 }} />}
      </Box>
      <Collapse in={open}>
        {items.length === 0 ? (
          <Typography
            variant="caption"
            sx={{
              color: 'text.disabled',
              px: 2,
              py: 0.5,
              display: 'block'
            }}
          >
            None excluded
          </Typography>
        ) : (
          <List dense disablePadding>
            {items.map((item) => (
              <ListItem
                key={item.key}
                disablePadding
                secondaryAction={
                  <Tooltip title="Restore to group">
                    <IconButton size="small" onClick={item.onRestore} sx={{ p: 0.25 }}>
                      <RestoreIcon sx={{ fontSize: 13 }} />
                    </IconButton>
                  </Tooltip>
                }
              >
                <ListItemButton sx={{ py: 0.25, pr: 5 }} disabled>
                  <ListItemText
                    primary={item.label}
                    slotProps={{
                      primary: {
                        variant: 'caption',
                        noWrap: true,
                        color: 'text.disabled',
                        sx: { fontFamily: 'monospace' }
                      }
                    }}
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
  initialFolder,
  folderOptions,
  isTemplate,
  isReferenceSet,
  isExisting,
  mapNames,
  meta,
  referencePoints,
  onSave,
  onMoveToTemplates,
  onMoveToActive,
  onDirtyChange,
  onExclude,
  onRestore,
  onSyncRequest,
  onLinkToReference,
  saveRef
}: Props) {
  const clientPath = useSettingsStore((s) => s.clientPath)

  const prevClientPath = useRef(clientPath)
  useEffect(() => {
    if (prevClientPath.current !== clientPath) {
      clearFieldCache()
      prevClientPath.current = clientPath
    }
  }, [clientPath])

  const [data, setData] = useState<WorldMapData>(worldMap)
  const [fileName, setFileName] = useState(
    initialFileName ?? computeWorldMapFilename(worldMap.name)
  )
  const [folder, setFolder] = useState(initialFolder)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [placeMode, setPlaceMode] = useState(false)
  const [dialogState, setDialogState] = useState<PointDialogState | null>(null)
  const isDirtyRef = useRef(false)

  const isDerived = meta !== null

  useEffect(() => {
    setData(worldMap)
    setFileName(initialFileName ?? computeWorldMapFilename(worldMap.name))
    setFolder(initialFolder)
    setSelectedIndex(null)
    setPlaceMode(false)
    setDialogState(null)
    isDirtyRef.current = false
    onDirtyChange(false)
  }, [worldMap, initialFileName]) // eslint-disable-line react-hooks/exhaustive-deps

  const markDirty = useCallback(() => {
    if (!isDirtyRef.current) {
      isDirtyRef.current = true
      onDirtyChange(true)
    }
  }, [onDirtyChange])

  const updateData = useCallback(
    <K extends keyof WorldMapData>(key: K, value: WorldMapData[K]) => {
      setData((prev) => {
        const next = { ...prev, [key]: value }
        if (
          key === 'name' &&
          (fileName === computeWorldMapFilename(prev.name) || !initialFileName)
        ) {
          setFileName(computeWorldMapFilename(next.name as string))
        }
        return next
      })
      markDirty()
    },
    [fileName, initialFileName, markDirty]
  )

  // ── Derived mode computed values ──────────────────────────────────────────

  const refKeySet = new Set(referencePoints?.map(pointKey) ?? [])

  const orphanKeys: Set<string> = new Set(
    data.points.filter((p) => referencePoints && !refKeySet.has(pointKey(p))).map(pointKey)
  )

  const overlapPairs = overlappingPointPairs(data.points)

  const excludedRows: ExcludedRow[] =
    isDerived && referencePoints
      ? meta.excludes
          .map((k) => {
            const rp = referencePoints.find((p) => pointKey(p) === k)
            if (!rp) return null
            return {
              key: k,
              label: `(${rp.x},${rp.y}) ${rp.name || '?'} → ${rp.targetMap || '?'}`,
              onRestore: () => onRestore(k)
            }
          })
          .filter((r): r is ExcludedRow => r !== null)
      : []

  // ── Save ─────────────────────────────────────────────────────────────────

  // A reference set is identified by the field it serves, not by its display
  // name (HTOO-410). This is also how the legacy `ReferenceMapSet.xml` is
  // adopted: open it, and the header offers the field-specific name to
  // regenerate to, so the rename is one visible click rather than a migration.
  const computedFileName = isReferenceSet
    ? referenceFilenameFor(data.clientMap)
    : computeWorldMapFilename(data.name)

  const doSave = useCallback(async () => {
    await onSave(data, fileName, normalizeFolder(folder))
    isDirtyRef.current = false
    onDirtyChange(false)
  }, [data, fileName, folder, onSave, onDirtyChange])

  useEffect(() => {
    saveRef.current = doSave
  }, [doSave, saveRef])

  // ── Point actions ─────────────────────────────────────────────────────────

  const handlePlacePoint = useCallback((x: number, y: number) => {
    setPlaceMode(false)
    setDialogState({ canvasX: x, canvasY: y, displayName: '' })
  }, [])

  const handleEditPoint = useCallback(
    (index: number) => {
      const p = data.points[index]
      if (!p) return
      setDialogState({ canvasX: p.x, canvasY: p.y, editIndex: index, displayName: p.name })
    },
    [data.points]
  )

  const handleRemovePoint = useCallback(
    (index: number) => {
      const p = data.points[index]
      if (!p) return
      if (isDerived) {
        // In derived mode: exclude from reference instead of deleting
        onExclude(pointKey(p))
        setData((prev) => ({ ...prev, points: prev.points.filter((_, i) => i !== index) }))
        setSelectedIndex((s) => (s === index ? null : s !== null && s > index ? s - 1 : s))
        markDirty()
      } else {
        setData((prev) => ({ ...prev, points: prev.points.filter((_, i) => i !== index) }))
        setSelectedIndex((s) => (s === index ? null : s !== null && s > index ? s - 1 : s))
        markDirty()
      }
    },
    [isDerived, data.points, onExclude, markDirty]
  )

  const handleConfirmPoint = useCallback(
    (warp: MapWarp) => {
      const ds = dialogState
      if (!ds) return
      const point = warpToPoint(warp, ds.displayName, ds.canvasX, ds.canvasY)
      if (ds.editIndex !== undefined) {
        setData((prev) => ({
          ...prev,
          points: prev.points.map((p, i) => (i === ds.editIndex ? point : p))
        }))
        setSelectedIndex(ds.editIndex)
      } else {
        setData((prev) => {
          const next = { ...prev, points: [...prev.points, point] }
          setSelectedIndex(next.points.length - 1)
          return next
        })
      }
      setDialogState(null)
      markDirty()
    },
    [dialogState, markDirty]
  )

  const dialogInitial: MapWarp | null =
    dialogState?.editIndex !== undefined
      ? (() => {
          const p = data.points[dialogState.editIndex!]
          return p ? pointToWarp(p) : null
        })()
      : null

  const canPlace = !isDerived

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <EditorHeader
        title={data.name || 'New World Map'}
        entityLabel="world map"
        fileName={fileName}
        initialFileName={initialFileName ?? undefined}
        computedFileName={computedFileName}
        isExisting={isExisting}
        isArchived={isTemplate && !isReferenceSet}
        archiveLabel="Move to Templates"
        unarchiveLabel="Move to Active"
        onFileNameChange={setFileName}
        folder={folder}
        folderOptions={folderOptions}
        initialFolder={initialFolder}
        onFolderChange={setFolder}
        onRegenerate={() => setFileName(computedFileName)}
        onSave={doSave}
        onArchive={onMoveToTemplates}
        onUnarchive={onMoveToActive}
      />
      {/* Reference set badge */}
      {isReferenceSet && (
        <Chip
          icon={<StarIcon sx={{ fontSize: 14 }} />}
          label="Reference Set"
          size="small"
          color="warning"
          variant="outlined"
          sx={{ alignSelf: 'flex-start', mb: 1 }}
        />
      )}
      {/* Overlap — a fault in a set a player receives, expected in a reference
          set, whose overlapping points are normally split across derived sets. */}
      {!isReferenceSet && overlapPairs.length > 0 && (
        <Alert severity="error" sx={{ mb: 1, flexShrink: 0 }}>
          {overlapPairs.length === 1
            ? 'One pair of points overlaps'
            : `${overlapPairs.length} pairs of points overlap`}
          . The client draws the later point on top, but a click goes to the earlier one, so the
          point on top cannot be reached in game. Points may overlap in a reference set, not in a
          set a player receives.{' '}
          {overlapPairs
            .slice(0, 3)
            .map(
              ([a, b]) =>
                `${data.points[a]?.name || `#${a + 1}`} / ${data.points[b]?.name || `#${b + 1}`}`
            )
            .join(', ')}
          {overlapPairs.length > 3 ? ', …' : ''}
        </Alert>
      )}
      {/* Orphan warning */}
      {isDerived && orphanKeys.size > 0 && (
        <Alert severity="warning" sx={{ mb: 1, flexShrink: 0 }}>
          {orphanKeys.size} point(s) in this group are not in the reference set and will be lost on
          next sync.
        </Alert>
      )}
      {/* Top fields row */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 2,
          pb: 1,
          flexShrink: 0,
          flexWrap: 'wrap'
        }}
      >
        <TextField
          size="small"
          label="Name"
          value={data.name}
          onChange={(e) => updateData('name', e.target.value)}
          slotProps={{ htmlInput: { spellCheck: false } }}
          sx={{ width: 240 }}
        />
        <ClientMapSelect
          value={data.clientMap}
          onChange={(v) => updateData('clientMap', v)}
          clientPath={clientPath}
        />
      </Box>
      <Divider sx={{ mb: 1, flexShrink: 0 }} />
      {/* Toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexShrink: 0,
          mb: 0.5,
          flexWrap: 'wrap'
        }}
      >
        {isDerived ? (
          <>
            <Chip
              icon={<SyncIcon sx={{ fontSize: 14 }} />}
              label={`Derived from ${meta.reference}`}
              size="small"
              color="info"
              variant="outlined"
            />
            <Tooltip title="Replace all points with reference set minus exclusions">
              <Chip
                label="Sync from Reference"
                size="small"
                clickable
                color="warning"
                onClick={onSyncRequest}
              />
            </Tooltip>
          </>
        ) : (
          <>
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary'
              }}
            >
              Place:
            </Typography>
            <Chip
              label="Point"
              size="small"
              clickable
              color={placeMode ? 'primary' : 'default'}
              onClick={() => setPlaceMode((p) => !p)}
            />
            {placeMode && (
              <Typography variant="caption" color="primary" sx={{ fontStyle: 'italic' }}>
                {isReferenceSet
                  ? 'Click map to place — hold Alt to place on top of a point'
                  : 'Click map to place'}
              </Typography>
            )}
            {isExisting && !isReferenceSet && (
              <Tooltip title="Link this group to the reference map set">
                <Chip
                  icon={<LinkIcon sx={{ fontSize: 14 }} />}
                  label="Link to Reference"
                  size="small"
                  clickable
                  variant="outlined"
                  onClick={onLinkToReference}
                  sx={{ ml: 'auto' }}
                />
              </Tooltip>
            )}
          </>
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
          placeMode={canPlace && placeMode}
          onPointClick={(i) => {
            setSelectedIndex((s) => (s === i ? null : i))
            setPlaceMode(false)
          }}
          onPlacePoint={handlePlacePoint}
          // While the dialog is open the canvas shows the point at its typed
          // position, so a coordinate edit is visible as it is typed. On an
          // edit the stored point is hidden, or the ghost and the real marker
          // would sit apart and read as two points.
          pendingPoint={dialogState ? { x: dialogState.canvasX, y: dialogState.canvasY } : null}
          hiddenIndex={dialogState?.editIndex ?? null}
          allowOverlap={!!isReferenceSet}
          sx={{ flex: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}
        />

        {/* Items panel */}
        <Box
          sx={{
            width: 260,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            gap: 1
          }}
        >
          <Paper variant="outlined" sx={{ p: 1, flexShrink: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box
                sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#2196f3', flexShrink: 0 }}
              />
              <Typography variant="caption">Point — destination map tile</Typography>
            </Box>
          </Paper>

          <Box
            sx={{ flex: 1, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}
          >
            <ItemsGroup
              label="Points"
              color="#2196f3"
              count={data.points.length}
              addDisabled={isDerived}
              onAdd={() => {
                if (canPlace) setPlaceMode((p) => !p)
              }}
              items={data.points.map((p, i) => ({
                key: i,
                label: `(${p.x},${p.y}) ${p.name || '?'} → ${p.targetMap || '?'}`,
                selected: selectedIndex === i,
                isOrphan: orphanKeys.has(pointKey(p)),
                onSelect: () => setSelectedIndex((s) => (s === i ? null : i)),
                onEdit: !isDerived ? () => handleEditPoint(i) : undefined,
                onRemove: () => handleRemovePoint(i)
              }))}
            />

            {isDerived && (
              <>
                <Divider />
                <ExcludedGroup items={excludedRows} />
              </>
            )}
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
          onPointDisplayNameChange={(name) =>
            setDialogState((s) => (s ? { ...s, displayName: name } : s))
          }
          onPointPositionChange={(x, y) =>
            setDialogState((s) => (s ? { ...s, canvasX: x, canvasY: y } : s))
          }
          onConfirm={handleConfirmPoint}
          onCancel={() => setDialogState(null)}
        />
      )}
    </Box>
  )
}
