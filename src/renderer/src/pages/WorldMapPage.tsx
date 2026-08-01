import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Snackbar,
  Tooltip,
  Typography
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import StarIcon from '@mui/icons-material/Star'
import { useSettingsStore } from '../store/settingsStore'
import { useUnsavedGuard } from '../hooks/useUnsavedGuard'
import { useWorldIndex } from '../hooks/useWorldIndex'
import UnsavedChangesDialog from '../components/UnsavedChangesDialog'
import WorldMapEditorPanel from '../components/worldmapeditor/WorldMapEditorPanel'
import SectionFileList from '../components/shared/SectionFileList'
import { parseWorldMapXml, serializeWorldMapXml } from '../utils/worldMapXml'
import { activeRel, baseName, displayName, joinRel, relFolder } from '../utils/mapFileRel'
import { folderOptions } from '../utils/fileTree'
import {
  DEFAULT_WORLD_MAP,
  pointKey,
  type WorldMapData,
  type WorldMapMeta
} from '../data/worldMapData'

interface FileEntry {
  /**
   * Type-relative, forward-slashed: `Temuair.xml`, `regions/Mileth.xml`,
   * `.ignore/Draft.xml`. The identity a row carries — see `mapFileRel`.
   */
  rel: string
  /** Absolute, forward-slashed: `${dir}/${rel}`. */
  path: string
  /** Bare filename, what the editor's filename field edits. */
  name: string
  /** Row label and filter target — `activeRel` minus `.xml`. */
  display: string
  /** Lives under `.ignore/` — a template rather than an active world map. */
  template?: boolean
  /** True only for the canonical reference set */
  isReferenceSet?: boolean
}

const WORLDMAPS_SUBDIR = 'worldmaps'
const REFERENCE_FILENAME = 'ReferenceMapSet.xml'

// ── File list panel ───────────────────────────────────────────────────────────

const matchesQuery = (f: FileEntry, q: string): boolean => f.display.toLowerCase().includes(q)

/** The reference set is pinned above the list, so it answers the filter itself. */
const referenceMatchesQuery = (q: string): boolean =>
  !q || REFERENCE_FILENAME.toLowerCase().includes(q) || 'reference set'.includes(q)

function FileListPanel({
  referenceFile,
  files,
  templateFiles,
  selectedFile,
  onSelect,
  onNew,
  onCreateReference,
  showTemplates,
  onToggleTemplates
}: {
  referenceFile: FileEntry | null
  files: FileEntry[]
  templateFiles: FileEntry[]
  selectedFile: FileEntry | null
  onSelect: (f: FileEntry) => void
  onNew: () => void
  onCreateReference: () => void
  showTemplates: boolean
  onToggleTemplates: () => void
}) {
  const viewMode = useSettingsStore((s) => s.fileListViewMode)

  const renderRow = useCallback(
    (f: FileEntry, muted: boolean): React.ReactElement => (
      <ListItem disablePadding>
        <ListItemButton selected={selectedFile?.path === f.path} onClick={() => onSelect(f)}>
          <ListItemText
            // In folder view the enclosing header already names the folder.
            primary={viewMode === 'folder' ? f.name.replace(/\.xml$/i, '') : f.display}
            slotProps={{
              primary: {
                noWrap: true,
                variant: 'body2',
                ...(muted && { color: 'text.secondary' })
              }
            }}
          />
        </ListItemButton>
      </ListItem>
    ),
    [selectedFile, onSelect, viewMode]
  )

  const header = useCallback(
    (query: string): React.ReactNode =>
      referenceMatchesQuery(query) && (
        <>
          <Box sx={{ px: 1.5, pt: 1, pb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <StarIcon sx={{ fontSize: 14, color: 'warning.main' }} />
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              Reference Set
            </Typography>
          </Box>
          {referenceFile ? (
            <List dense disablePadding>
              <ListItem disablePadding>
                <ListItemButton
                  selected={selectedFile?.path === referenceFile.path}
                  onClick={() => onSelect(referenceFile)}
                >
                  <ListItemText
                    primary={referenceFile.name.replace(/\.xml$/i, '')}
                    slotProps={{ primary: { noWrap: true, variant: 'body2' } }}
                  />
                </ListItemButton>
              </ListItem>
            </List>
          ) : (
            <Box sx={{ px: 1.5, pb: 1 }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={onCreateReference}
                fullWidth
              >
                Create Reference Set
              </Button>
            </Box>
          )}
          <Divider sx={{ my: 0.5 }} />
        </>
      ),
    [referenceFile, selectedFile, onSelect, onCreateReference]
  )

  return (
    <SectionFileList
      title="World Maps"
      files={files}
      archivedFiles={templateFiles}
      archivedLabel="Templates"
      showArchived={showTemplates}
      onToggleArchived={onToggleTemplates}
      matches={matchesQuery}
      renderRow={renderRow}
      header={header}
      // The Create Reference Set button counts as content: a world with no
      // world maps at all still gets an actionable panel, not "none found".
      headerMatches={referenceMatchesQuery}
      emptyMessage="No world map XMLs found. Check that a library is set in Settings."
      actions={
        <Tooltip title="New World Map">
          <Button size="small" startIcon={<AddIcon />} onClick={onNew}>
            New
          </Button>
        </Tooltip>
      }
    />
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorldMapPage() {
  const activeLibrary = useSettingsStore((s) => s.activeLibrary)

  const [referenceFile, setReferenceFile] = useState<FileEntry | null>(null)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [templateFiles, setTemplateFiles] = useState<FileEntry[]>([])
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null)
  const [editingMap, setEditingMap] = useState<WorldMapData | null>(null)
  const [loadingMap, setLoadingMap] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [snackbar, setSnackbar] = useState<{
    message: string
    severity: 'success' | 'error' | 'info' | 'warning'
  } | null>(null)

  const [meta, setMeta] = useState<WorldMapMeta | null>(null)
  const [referencePoints, setReferencePoints] = useState<WorldMapData['points'] | null>(null)
  const [syncConfirm, setSyncConfirm] = useState(false)

  const {
    markDirty,
    markClean,
    saveRef,
    guard,
    dialogOpen,
    handleDialogSave,
    handleDialogDiscard,
    handleDialogCancel
  } = useUnsavedGuard('World Map')

  const { index: worldIndex } = useWorldIndex()
  const mapNames = worldIndex?.maps ?? []

  // Both directories come back from fs:listSection rather than being rebuilt
  // from activeLibrary here: it is the same join hybindex itself uses, already
  // forward-slashed, so row paths and write paths cannot disagree about
  // separators (resolveLibraryPath hands back native ones).
  const [worldmapsDir, setWorldmapsDir] = useState<string | null>(null)
  const ignoreDir = worldmapsDir ? `${worldmapsDir}/.ignore` : null

  // Save destinations offered by the folder picker — templates included, since
  // a template's folder is exactly where its active counterpart belongs.
  const folderChoices = useMemo(
    () => folderOptions([...files, ...templateFiles]),
    [files, templateFiles]
  )

  // ── File list loader ──────────────────────────────────────────────────────

  /**
   * One listSection call replaces the two flat listDir scans this used to do.
   * It enumerates recursively — a world map filed in a subdirectory is no
   * longer invisible here while the index lists it — and returns active and
   * archived already split, so templates come from the same round trip.
   */
  const loadFiles = async () => {
    if (!activeLibrary) {
      setFiles([])
      setTemplateFiles([])
      setReferenceFile(null)
      setWorldmapsDir(null)
      return
    }
    try {
      const { dir, active, archived } = await window.api.listSection(
        activeLibrary,
        WORLDMAPS_SUBDIR
      )
      setWorldmapsDir(dir)
      const toEntry = (rel: string, template: boolean): FileEntry => ({
        rel,
        path: `${dir}/${rel}`,
        name: baseName(rel),
        display: displayName(rel),
        ...(template && { template: true })
      })
      // listSection sorts by code unit; re-sort for display with numeric
      // collation so Field10 follows Field2.
      const byDisplay = (a: FileEntry, b: FileEntry) =>
        a.display.localeCompare(b.display, undefined, { numeric: true })

      setFiles(active.map((rel) => toEntry(rel, false)).sort(byDisplay))

      // The reference set is the one at the archive root — a template filed in
      // a subfolder that happens to share the name is just a template.
      const templates = archived.map((rel) => toEntry(rel, true))
      const ref = templates.find((f) => f.name === REFERENCE_FILENAME && relFolder(f.rel) === '')
      setReferenceFile(ref ? { ...ref, isReferenceSet: true } : null)
      setTemplateFiles(templates.filter((f) => f !== ref).sort(byDisplay))
    } catch {
      setFiles([])
      setTemplateFiles([])
      setReferenceFile(null)
    }
  }

  useEffect(() => {
    if (!activeLibrary) {
      setReferenceFile(null)
      setFiles([])
      setTemplateFiles([])
      setSelectedFile(null)
      setEditingMap(null)
      setMeta(null)
      setReferencePoints(null)
      return
    }
    loadFiles()
    // Same as MapEditorPage: `loadFiles` is a fresh function each render, so
    // listing it would re-scan the filesystem every render. See
    // docs/plans/00a-backlog.md.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLibrary])

  // Both lists arrive from one listSection call, so revealing templates is
  // pure state — no round trip.
  const handleToggleTemplates = () => setShowTemplates((v) => !v)

  // ── Create reference set ──────────────────────────────────────────────────

  const handleCreateReference = async () => {
    if (!ignoreDir) return
    const refPath = `${ignoreDir}/${REFERENCE_FILENAME}`
    try {
      const newMap: WorldMapData = { ...DEFAULT_WORLD_MAP, name: 'Reference Map Set' }
      const xml = serializeWorldMapXml(newMap)
      await window.api.writeFile(refPath, xml)
      const entry: FileEntry = {
        rel: `.ignore/${REFERENCE_FILENAME}`,
        name: REFERENCE_FILENAME,
        display: displayName(REFERENCE_FILENAME),
        path: refPath,
        template: true,
        isReferenceSet: true
      }
      setReferenceFile(entry)
      // Open it immediately for editing
      setSelectedFile(entry)
      setEditingMap(newMap)
      setMeta(null)
      setReferencePoints(null)
      setLoadError(null)
    } catch (err) {
      setSnackbar({
        message: `Failed to create reference set: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error'
      })
    }
  }

  // ── Meta helpers ──────────────────────────────────────────────────────────

  /**
   * Sidecars live inside `.ignore`, mirroring the world map's own subfolder —
   * keying them on the bare filename would pile every subfoldered map's meta
   * into the archive root, where two same-named maps would collide.
   */
  const metaPath = (rel: string) =>
    ignoreDir ? `${ignoreDir}/${activeRel(rel).replace(/\.xml$/i, '.meta.json')}` : null

  const saveMeta = async (rel: string, newMeta: WorldMapMeta) => {
    const path = metaPath(rel)
    if (!path) return
    await window.api.writeFile(path, JSON.stringify(newMeta, null, 2))
  }

  const loadMetaAndReference = async (
    rel: string
  ): Promise<{ meta: WorldMapMeta; referencePoints: WorldMapData['points'] } | null> => {
    const path = metaPath(rel)
    if (!path || !ignoreDir) return null
    try {
      const exists = await window.api.exists(path)
      if (!exists) return null
      const bytes = await window.api.readFile(path)
      const raw = JSON.parse(new TextDecoder().decode(bytes))
      // Support legacy meta files that use "master" instead of "reference"
      const m: WorldMapMeta = {
        reference: raw.reference ?? raw.master,
        excludes: raw.excludes ?? []
      }
      // The filename is legacy-tolerant too: sidecars written before the set was
      // renamed still point at `MasterMapSet.xml`. Reading that blind ENOENTs in
      // the main process and drops the group to unlinked — no derived chip, no
      // sync, exclusions inert — so probe first and fall back to the current
      // reference set. The normalized name goes back on the next saveMeta,
      // healing the sidecar without writing to the world on mere load.
      const storedPath = m.reference ? `${ignoreDir}/${m.reference}` : null
      const refPath =
        storedPath && (await window.api.exists(storedPath))
          ? storedPath
          : `${ignoreDir}/${REFERENCE_FILENAME}`
      if (refPath !== storedPath) {
        if (!(await window.api.exists(refPath))) return null
        m.reference = REFERENCE_FILENAME
      }
      const refBytes = await window.api.readFile(refPath)
      const refData = parseWorldMapXml(new TextDecoder().decode(refBytes))
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
      const xml = new TextDecoder('utf-8').decode(bytes)
      setEditingMap(parseWorldMapXml(xml))

      const result = await loadMetaAndReference(file.rel)
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

  const handleSave = async (data: WorldMapData, fileName: string, folder: string) => {
    if (!activeLibrary || !worldmapsDir) return
    try {
      const isTemplate = selectedFile?.template === true
      const baseDir = isTemplate ? ignoreDir! : worldmapsDir
      // The filename field's value is a bare name — it tracks the world map's
      // <Name>, so saving one filed in a subfolder must put it back there
      // rather than resolving against the type root.
      const targetRel = joinRel(folder, fileName)
      const isRename = !!(selectedFile && targetRel !== activeRel(selectedFile.rel))
      const newPath = isRename || !selectedFile ? `${baseDir}/${targetRel}` : selectedFile.path

      const xml = serializeWorldMapXml(data)
      await window.api.writeFile(newPath, xml)
      setEditingMap(data)

      if (isRename || !selectedFile) {
        if (isRename) {
          setSnackbar({
            message: `Saved as "${fileName}". Old file remains (manual delete may be needed).`,
            severity: 'info'
          })
        }
        setSelectedFile({
          rel: isTemplate ? `.ignore/${targetRel}` : targetRel,
          path: newPath,
          name: baseName(targetRel),
          display: displayName(targetRel),
          template: isTemplate || undefined,
          isReferenceSet: selectedFile?.isReferenceSet
        })
      }

      markClean()
      await loadFiles()
    } catch (err) {
      setSnackbar({
        message: `Save failed: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error'
      })
    }
  }

  // ── Move to Templates / Move to Active ──────────────────────────────────

  const handleMoveToTemplates = async () => {
    if (!selectedFile || !ignoreDir || !worldmapsDir) return
    try {
      // `.ignore/<activeRel>` mirrors the active subpath, so the round trip
      // back to active lands where it started instead of collapsing
      // `regions/Temuair.xml` and `drafts/Temuair.xml` onto one name.
      const destPath = `${ignoreDir}/${activeRel(selectedFile.rel)}`
      const exists = await window.api.exists(destPath)
      if (exists) {
        setSnackbar({ message: 'A template with this name already exists.', severity: 'error' })
        return
      }
      await window.api.copyFile(selectedFile.path, destPath)
      markClean()
      setSelectedFile(null)
      setEditingMap(null)
      setMeta(null)
      setReferencePoints(null)
      await loadFiles()
    } catch (err) {
      setSnackbar({
        message: `Move failed: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error'
      })
    }
  }

  const handleMoveToActive = async () => {
    if (!selectedFile || !worldmapsDir) return
    try {
      // Strip the `.ignore/` prefix but keep any subfolder beneath it.
      const destPath = `${worldmapsDir}/${activeRel(selectedFile.rel)}`
      const exists = await window.api.exists(destPath)
      if (exists) {
        setSnackbar({
          message: 'An active world map with this name already exists.',
          severity: 'error'
        })
        return
      }
      await window.api.copyFile(selectedFile.path, destPath)
      markClean()
      setSelectedFile(null)
      setEditingMap(null)
      setMeta(null)
      setReferencePoints(null)
      await loadFiles()
    } catch (err) {
      setSnackbar({
        message: `Move failed: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error'
      })
    }
  }

  // ── Derived group: exclude / restore ──────────────────────────────────────

  const handleExclude = async (key: string) => {
    if (!meta || !selectedFile) return
    const newMeta: WorldMapMeta = { ...meta, excludes: [...meta.excludes, key] }
    setMeta(newMeta)
    try {
      await saveMeta(selectedFile.rel, newMeta)
    } catch {
      setSnackbar({ message: 'Failed to save exclusion.', severity: 'error' })
    }
  }

  const handleRestore = async (key: string) => {
    if (!meta || !selectedFile || !referencePoints) return
    const newMeta: WorldMapMeta = { ...meta, excludes: meta.excludes.filter((k) => k !== key) }
    const restoredPoint = referencePoints.find((p) => pointKey(p) === key)
    if (!restoredPoint) return
    setMeta(newMeta)
    setEditingMap((prev) => (prev ? { ...prev, points: [...prev.points, restoredPoint] } : null))
    markDirty()
    try {
      await saveMeta(selectedFile.rel, newMeta)
    } catch {
      setSnackbar({ message: 'Failed to save restore.', severity: 'error' })
    }
  }

  // ── Derived group: sync from reference ────────────────────────────────────

  const handleSyncRequest = () => setSyncConfirm(true)

  const handleSyncConfirm = () => {
    setSyncConfirm(false)
    if (!meta || !referencePoints) return
    const newPoints = referencePoints.filter((p) => !meta.excludes.includes(pointKey(p)))
    setEditingMap((prev) => (prev ? { ...prev, points: newPoints } : null))
    markDirty()
  }

  // ── Link to reference ──────────────────────────────────────────────────────

  const handleLinkToReference = async () => {
    if (!ignoreDir || !selectedFile || !editingMap) return
    const refPath = `${ignoreDir}/${REFERENCE_FILENAME}`
    try {
      const exists = await window.api.exists(refPath)
      if (!exists) {
        setSnackbar({
          message: `Reference set not found: ${REFERENCE_FILENAME}`,
          severity: 'error'
        })
        return
      }
      const bytes = await window.api.readFile(refPath)
      const refData = parseWorldMapXml(new TextDecoder().decode(bytes))
      const refKeys = new Set(refData.points.map(pointKey))
      const groupKeys = new Set(editingMap.points.map(pointKey))

      // Excludes = reference points not present in this group
      const excludes = refData.points.map(pointKey).filter((k) => !groupKeys.has(k))

      // Warn about orphans = group points not in reference
      const orphanCount = editingMap.points.filter((p) => !refKeys.has(pointKey(p))).length
      if (orphanCount > 0) {
        setSnackbar({
          message: `Linked to reference set. ${orphanCount} point(s) in this group are not in the reference — they will be lost on next sync.`,
          severity: 'warning'
        })
      }

      const newMeta: WorldMapMeta = { reference: REFERENCE_FILENAME, excludes }
      setMeta(newMeta)
      setReferencePoints(refData.points)
      await saveMeta(selectedFile.rel, newMeta)
    } catch (err) {
      setSnackbar({
        message: `Link failed: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error'
      })
    }
  }

  const handleDirtyChange = useCallback(
    (dirty: boolean) => {
      dirty ? markDirty() : markClean()
    },
    [markDirty, markClean]
  )
  const isTemplate = selectedFile?.template === true
  const isReferenceSet = selectedFile?.isReferenceSet === true

  // ── Sync confirm dialog ───────────────────────────────────────────────────

  const orphanCount =
    editingMap && referencePoints
      ? editingMap.points.filter((p) => !referencePoints.some((m) => pointKey(m) === pointKey(p)))
          .length
      : 0

  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <FileListPanel
        referenceFile={referenceFile}
        files={files}
        templateFiles={templateFiles}
        selectedFile={selectedFile}
        onSelect={handleSelect}
        onNew={handleNew}
        onCreateReference={() => guard(handleCreateReference)}
        showTemplates={showTemplates}
        onToggleTemplates={handleToggleTemplates}
      />
      <Box sx={{ flex: 1, p: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loadError ? (
          <Alert severity="error">
            <strong>Failed to load world map:</strong> {loadError}
          </Alert>
        ) : loadingMap ? (
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}
          >
            <CircularProgress size={64} thickness={4} color="info" disableShrink />
          </Box>
        ) : editingMap ? (
          <WorldMapEditorPanel
            worldMap={editingMap}
            initialFileName={selectedFile?.name ?? null}
            initialFolder={selectedFile ? relFolder(selectedFile.rel) : ''}
            folderOptions={folderChoices}
            isTemplate={isTemplate}
            isReferenceSet={isReferenceSet}
            isExisting={!!selectedFile}
            mapNames={mapNames}
            meta={meta}
            referencePoints={referencePoints}
            onSave={handleSave}
            onMoveToTemplates={isReferenceSet ? undefined : handleMoveToTemplates}
            onMoveToActive={isReferenceSet ? undefined : handleMoveToActive}
            onDirtyChange={handleDirtyChange}
            onExclude={handleExclude}
            onRestore={handleRestore}
            onSyncRequest={handleSyncRequest}
            onLinkToReference={handleLinkToReference}
            saveRef={saveRef}
          />
        ) : (
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}
          >
            <Typography
              variant="body1"
              sx={{
                color: 'text.secondary'
              }}
            >
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
              <>
                <br />
                <br />
                <strong>{orphanCount} point(s)</strong> in this group are not in the reference set
                and will be removed.
              </>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSyncConfirm(false)}>Cancel</Button>
          <Button onClick={handleSyncConfirm} color="warning" variant="contained">
            Sync
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={!!snackbar}
        autoHideDuration={6000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar?.severity ?? 'info'}
          onClose={() => setSnackbar(null)}
          sx={{ width: '100%' }}
        >
          {snackbar?.message}
        </Alert>
      </Snackbar>
      <UnsavedChangesDialog
        open={dialogOpen}
        label="World Map"
        onSave={handleDialogSave}
        onDiscard={handleDialogDiscard}
        onCancel={handleDialogCancel}
      />
    </Box>
  )
}
