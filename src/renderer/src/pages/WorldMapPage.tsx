import React, { useCallback, useEffect, useState } from 'react'
import { useRecoilValue } from 'recoil'
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, Divider, IconButton,
  InputAdornment, List, ListItem, ListItemButton, ListItemText,
  Snackbar, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ArchiveIcon from '@mui/icons-material/Archive'
import SearchIcon from '@mui/icons-material/Search'
import { activeLibraryState } from '../recoil/atoms'
import { useUnsavedGuard } from '../hooks/useUnsavedGuard'
import { useWorldIndex } from '../hooks/useWorldIndex'
import UnsavedChangesDialog from '../components/UnsavedChangesDialog'
import WorldMapEditorPanel from '../components/worldmapeditor/WorldMapEditorPanel'
import { parseWorldMapXml, serializeWorldMapXml } from '../utils/worldMapXml'
import {
  DEFAULT_WORLD_MAP, computeWorldMapFilename,
  pointKey, type WorldMapData, type WorldMapMeta,
} from '../data/worldMapData'

interface FileEntry {
  name: string
  path: string
  template?: boolean
}

const WORLDMAPS_SUBDIR    = 'worldmaps'
const IGNORE_SUBDIR       = 'worldmaps/.ignore'
const REFERENCE_FILENAME  = 'ReferenceMapSet.xml'

// ── File list panel ───────────────────────────────────────────────────────────

function FileListPanel({
  files,
  templateFiles,
  selectedFile,
  onSelect,
  onNew,
  showTemplates,
  onToggleTemplates,
}: {
  files: FileEntry[]
  templateFiles: FileEntry[]
  selectedFile: FileEntry | null
  onSelect: (f: FileEntry) => void
  onNew: () => void
  showTemplates: boolean
  onToggleTemplates: () => void
}) {
  const [search, setSearch] = React.useState('')

  const filtered = (list: FileEntry[]) =>
    search.trim()
      ? list.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
      : list

  const filteredActive    = filtered(files)
  const filteredTemplates = filtered(templateFiles)

  return (
    <Box sx={{ width: 240, flexShrink: 0, borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle2">World Maps</Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title={showTemplates ? 'Hide Templates' : 'Show Templates'}>
            <IconButton size="small" onClick={onToggleTemplates} color={showTemplates ? 'primary' : 'default'}>
              <ArchiveIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="New World Map">
            <Button size="small" startIcon={<AddIcon />} onClick={onNew}>New</Button>
          </Tooltip>
        </Box>
      </Box>
      <Box sx={{ px: 1, pb: 1 }}>
        <TextField
          size="small" fullWidth placeholder="Filter..."
          value={search} onChange={e => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
      </Box>
      <Divider />
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {files.length === 0 && !showTemplates ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No world map XMLs found. Check that a library is set in Settings.
          </Typography>
        ) : filteredActive.length === 0 && (!showTemplates || filteredTemplates.length === 0) ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No matches.</Typography>
        ) : (
          <>
            <List dense disablePadding>
              {filteredActive.map(f => (
                <ListItem key={f.path} disablePadding>
                  <ListItemButton selected={selectedFile?.path === f.path} onClick={() => onSelect(f)}>
                    <ListItemText
                      primary={f.name.replace(/\.xml$/i, '')}
                      primaryTypographyProps={{ noWrap: true, variant: 'body2' }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
            {showTemplates && filteredTemplates.length > 0 && (
              <>
                <Divider sx={{ my: 0.5 }} />
                <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, py: 0.5, display: 'block' }}>
                  Templates
                </Typography>
                <List dense disablePadding>
                  {filteredTemplates.map(f => (
                    <ListItem key={f.path} disablePadding>
                      <ListItemButton selected={selectedFile?.path === f.path} onClick={() => onSelect(f)}>
                        <ListItemText
                          primary={f.name.replace(/\.xml$/i, '')}
                          primaryTypographyProps={{ noWrap: true, variant: 'body2', color: 'text.secondary' }}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </>
            )}
          </>
        )}
      </Box>
    </Box>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorldMapPage() {
  const activeLibrary = useRecoilValue(activeLibraryState)

  const [files,          setFiles]          = useState<FileEntry[]>([])
  const [templateFiles,  setTemplateFiles]  = useState<FileEntry[]>([])
  const [selectedFile,   setSelectedFile]   = useState<FileEntry | null>(null)
  const [editingMap,     setEditingMap]     = useState<WorldMapData | null>(null)
  const [loadingMap,     setLoadingMap]     = useState(false)
  const [loadError,      setLoadError]      = useState<string | null>(null)
  const [showTemplates,  setShowTemplates]  = useState(false)
  const [snackbar,       setSnackbar]       = useState<{ message: string; severity: 'success' | 'error' | 'info' | 'warning' } | null>(null)

  const [meta,             setMeta]             = useState<WorldMapMeta | null>(null)
  const [referencePoints,  setReferencePoints]  = useState<WorldMapData['points'] | null>(null)
  const [syncConfirm,      setSyncConfirm]      = useState(false)

  const { markDirty, markClean, saveRef, guard, dialogOpen,
    handleDialogSave, handleDialogDiscard, handleDialogCancel } = useUnsavedGuard('World Map')

  const { index: worldIndex } = useWorldIndex()
  const mapNames = worldIndex?.maps ?? []

  const worldmapsDir = activeLibrary ? `${activeLibrary}/${WORLDMAPS_SUBDIR}` : null
  const ignoreDir    = activeLibrary ? `${activeLibrary}/${IGNORE_SUBDIR}`    : null

  // ── File list loaders ─────────────────────────────────────────────────────

  const loadActiveFiles = async () => {
    if (!worldmapsDir) { setFiles([]); return }
    try {
      const entries = await window.api.listDir(worldmapsDir)
      setFiles(
        entries
          .filter(e => !e.isDirectory && /\.xml$/i.test(e.name))
          .map(e => ({ name: e.name, path: `${worldmapsDir}/${e.name}` }))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
    } catch {
      setFiles([])
    }
  }

  const loadTemplateFiles = async () => {
    if (!ignoreDir) { setTemplateFiles([]); return }
    try {
      await window.api.ensureDir(ignoreDir)
      const entries = await window.api.listDir(ignoreDir)
      setTemplateFiles(
        entries
          .filter(e => !e.isDirectory && /\.xml$/i.test(e.name))
          .map(e => ({ name: e.name, path: `${ignoreDir}/${e.name}`, template: true }))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
    } catch {
      setTemplateFiles([])
    }
  }

  useEffect(() => {
    if (!activeLibrary) {
      setFiles([])
      setTemplateFiles([])
      setSelectedFile(null)
      setEditingMap(null)
      setMeta(null)
      setReferencePoints(null)
      return
    }
    loadActiveFiles()
    loadTemplateFiles()
  }, [activeLibrary])

  const handleToggleTemplates = async () => {
    const next = !showTemplates
    setShowTemplates(next)
    if (next) await loadTemplateFiles()
  }

  // ── Meta helpers ──────────────────────────────────────────────────────────

  const metaPath = (fileName: string) =>
    ignoreDir ? `${ignoreDir}/${fileName.replace(/\.xml$/i, '.meta.json')}` : null

  const saveMeta = async (fileName: string, newMeta: WorldMapMeta) => {
    const path = metaPath(fileName)
    if (!path) return
    await window.api.writeFile(path, JSON.stringify(newMeta, null, 2))
  }

  const loadMetaAndReference = async (fileName: string): Promise<{ meta: WorldMapMeta; referencePoints: WorldMapData['points'] } | null> => {
    const path = metaPath(fileName)
    if (!path || !ignoreDir) return null
    try {
      const exists = await window.api.exists(path)
      if (!exists) return null
      const bytes = await window.api.readFile(path)
      const raw = JSON.parse(new TextDecoder().decode(bytes))
      // Support legacy meta files that use "master" instead of "reference"
      const m: WorldMapMeta = { reference: raw.reference ?? raw.master, excludes: raw.excludes ?? [] }
      const refPath = `${ignoreDir}/${m.reference}`
      const refBytes = await window.api.readFile(refPath)
      const refData  = parseWorldMapXml(new TextDecoder().decode(refBytes))
      return { meta: m, referencePoints: refData.points }
    } catch {
      return null
    }
  }

  // ── New / Select ──────────────────────────────────────────────────────────

  const doNew = () => {
    setSelectedFile(null)
    setLoadError(null)
    setEditingMap({ ...DEFAULT_WORLD_MAP })
    setMeta(null)
    setReferencePoints(null)
  }
  const handleNew = () => guard(doNew)

  const doSelect = async (file: FileEntry) => {
    setSelectedFile(file)
    setLoadError(null)
    setEditingMap(null)
    setMeta(null)
    setReferencePoints(null)
    setLoadingMap(true)
    try {
      const bytes = await window.api.readFile(file.path)
      const xml   = new TextDecoder('utf-8').decode(bytes)
      setEditingMap(parseWorldMapXml(xml))

      const result = await loadMetaAndReference(file.name)
      if (result) {
        setMeta(result.meta)
        setReferencePoints(result.referencePoints)
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to parse XML.')
    } finally {
      setLoadingMap(false)
    }
  }
  const handleSelect = (file: FileEntry) => guard(() => doSelect(file))

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async (data: WorldMapData, fileName: string) => {
    if (!activeLibrary || !worldmapsDir) return
    try {
      const isTemplate = selectedFile?.template === true
      const baseDir    = isTemplate ? ignoreDir! : worldmapsDir
      const isRename   = !!(selectedFile && fileName !== selectedFile.name)
      const newPath    = isRename || !selectedFile ? `${baseDir}/${fileName}` : selectedFile.path

      const xml = serializeWorldMapXml(data)
      await window.api.writeFile(newPath, xml)
      setEditingMap(data)

      if (isRename && selectedFile) {
        setSnackbar({ message: `Saved as "${fileName}". Old file remains (manual delete may be needed).`, severity: 'info' })
        setSelectedFile({ name: fileName, path: newPath, template: isTemplate || undefined })
      } else if (!selectedFile) {
        setSelectedFile({ name: fileName, path: newPath })
      }

      markClean()
      await loadActiveFiles()
      if (isTemplate) await loadTemplateFiles()
    } catch (err) {
      setSnackbar({ message: `Save failed: ${err instanceof Error ? err.message : String(err)}`, severity: 'error' })
    }
  }

  // ── Move to Templates / Move to Active ──────────────────────────────────

  const handleMoveToTemplates = async () => {
    if (!selectedFile || !ignoreDir || !worldmapsDir) return
    try {
      const destPath = `${ignoreDir}/${selectedFile.name}`
      const exists   = await window.api.exists(destPath)
      if (exists) { setSnackbar({ message: 'A template with this name already exists.', severity: 'error' }); return }
      await window.api.copyFile(selectedFile.path, destPath)
      markClean()
      setSelectedFile(null)
      setEditingMap(null)
      setMeta(null)
      setReferencePoints(null)
      await loadActiveFiles()
      await loadTemplateFiles()
    } catch (err) {
      setSnackbar({ message: `Move failed: ${err instanceof Error ? err.message : String(err)}`, severity: 'error' })
    }
  }

  const handleMoveToActive = async () => {
    if (!selectedFile || !worldmapsDir) return
    try {
      const destPath = `${worldmapsDir}/${selectedFile.name}`
      const exists   = await window.api.exists(destPath)
      if (exists) { setSnackbar({ message: 'An active world map with this name already exists.', severity: 'error' }); return }
      await window.api.copyFile(selectedFile.path, destPath)
      markClean()
      setSelectedFile(null)
      setEditingMap(null)
      setMeta(null)
      setReferencePoints(null)
      await loadActiveFiles()
      await loadTemplateFiles()
    } catch (err) {
      setSnackbar({ message: `Move failed: ${err instanceof Error ? err.message : String(err)}`, severity: 'error' })
    }
  }

  // ── Derived group: exclude / restore ──────────────────────────────────────

  const handleExclude = async (key: string) => {
    if (!meta || !selectedFile) return
    const newMeta: WorldMapMeta = { ...meta, excludes: [...meta.excludes, key] }
    setMeta(newMeta)
    try { await saveMeta(selectedFile.name, newMeta) }
    catch { setSnackbar({ message: 'Failed to save exclusion.', severity: 'error' }) }
  }

  const handleRestore = async (key: string) => {
    if (!meta || !selectedFile || !referencePoints) return
    const newMeta: WorldMapMeta = { ...meta, excludes: meta.excludes.filter(k => k !== key) }
    const restoredPoint = referencePoints.find(p => pointKey(p) === key)
    if (!restoredPoint) return
    setMeta(newMeta)
    setEditingMap(prev => prev ? { ...prev, points: [...prev.points, restoredPoint] } : null)
    markDirty()
    try { await saveMeta(selectedFile.name, newMeta) }
    catch { setSnackbar({ message: 'Failed to save restore.', severity: 'error' }) }
  }

  // ── Derived group: sync from reference ────────────────────────────────────

  const handleSyncRequest = () => setSyncConfirm(true)

  const handleSyncConfirm = () => {
    setSyncConfirm(false)
    if (!meta || !referencePoints) return
    const newPoints = referencePoints.filter(p => !meta.excludes.includes(pointKey(p)))
    setEditingMap(prev => prev ? { ...prev, points: newPoints } : null)
    markDirty()
  }

  // ── Link to reference ──────────────────────────────────────────────────────

  const handleLinkToReference = async () => {
    if (!ignoreDir || !selectedFile || !editingMap) return
    const refPath = `${ignoreDir}/${REFERENCE_FILENAME}`
    try {
      const exists = await window.api.exists(refPath)
      if (!exists) {
        setSnackbar({ message: `Reference set not found: ${REFERENCE_FILENAME}`, severity: 'error' })
        return
      }
      const bytes   = await window.api.readFile(refPath)
      const refData = parseWorldMapXml(new TextDecoder().decode(bytes))
      const refKeys = new Set(refData.points.map(pointKey))
      const groupKeys = new Set(editingMap.points.map(pointKey))

      // Excludes = reference points not present in this group
      const excludes = refData.points
        .map(pointKey)
        .filter(k => !groupKeys.has(k))

      // Warn about orphans = group points not in reference
      const orphanCount = editingMap.points.filter(p => !refKeys.has(pointKey(p))).length
      if (orphanCount > 0) {
        setSnackbar({ message: `Linked to reference set. ${orphanCount} point(s) in this group are not in the reference — they will be lost on next sync.`, severity: 'warning' })
      }

      const newMeta: WorldMapMeta = { reference: REFERENCE_FILENAME, excludes }
      setMeta(newMeta)
      setReferencePoints(refData.points)
      await saveMeta(selectedFile.name, newMeta)
    } catch (err) {
      setSnackbar({ message: `Link failed: ${err instanceof Error ? err.message : String(err)}`, severity: 'error' })
    }
  }

  const handleDirtyChange = useCallback((dirty: boolean) => { dirty ? markDirty() : markClean() }, [markDirty, markClean])
  const isTemplate = selectedFile?.template === true

  // ── Sync confirm dialog ───────────────────────────────────────────────────

  const orphanCount = editingMap && referencePoints
    ? editingMap.points.filter(p => !referencePoints.some(m => pointKey(m) === pointKey(p))).length
    : 0

  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <FileListPanel
        files={files}
        templateFiles={templateFiles}
        selectedFile={selectedFile}
        onSelect={handleSelect}
        onNew={handleNew}
        showTemplates={showTemplates}
        onToggleTemplates={handleToggleTemplates}
      />

      <Box sx={{ flex: 1, p: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loadError ? (
          <Alert severity="error"><strong>Failed to load world map:</strong> {loadError}</Alert>
        ) : loadingMap ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <CircularProgress size={64} thickness={4} color="info" disableShrink />
          </Box>
        ) : editingMap ? (
          <WorldMapEditorPanel
            worldMap={editingMap}
            initialFileName={selectedFile?.name ?? null}
            isTemplate={isTemplate}
            isExisting={!!selectedFile}
            mapNames={mapNames}
            meta={meta}
            referencePoints={referencePoints}
            onSave={handleSave}
            onMoveToTemplates={handleMoveToTemplates}
            onMoveToActive={handleMoveToActive}
            onDirtyChange={handleDirtyChange}
            onExclude={handleExclude}
            onRestore={handleRestore}
            onSyncRequest={handleSyncRequest}
            onLinkToReference={handleLinkToReference}
            saveRef={saveRef}
          />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Typography variant="body1" color="text.secondary">
              Select a world map or create a new one.
            </Typography>
          </Box>
        )}
      </Box>

      {/* Sync confirmation dialog */}
      <Dialog open={syncConfirm} onClose={() => setSyncConfirm(false)}>
        <DialogTitle>Sync from Reference</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will replace all points in this group with the reference set minus your exclusions.
            {orphanCount > 0 && (
              <><br /><br />
                <strong>{orphanCount} point(s)</strong> in this group are not in the reference set and will be removed.
              </>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSyncConfirm(false)}>Cancel</Button>
          <Button onClick={handleSyncConfirm} color="warning" variant="contained">Sync</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snackbar}
        autoHideDuration={6000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar?.severity ?? 'info'} onClose={() => setSnackbar(null)} sx={{ width: '100%' }}>
          {snackbar?.message}
        </Alert>
      </Snackbar>
      <UnsavedChangesDialog
        open={dialogOpen} label="World Map"
        onSave={handleDialogSave} onDiscard={handleDialogDiscard} onCancel={handleDialogCancel}
      />
    </Box>
  )
}
