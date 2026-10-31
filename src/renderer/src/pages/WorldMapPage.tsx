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
  Menu,
  MenuItem,
  Snackbar,
  Typography
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import StarIcon from '@mui/icons-material/Star'
import { useSettingsStore } from '../store/settingsStore'
import { useUnsavedGuard } from '../hooks/useUnsavedGuard'
import { useWorldIndex } from '../hooks/useWorldIndex'
import UnsavedChangesDialog from '../components/UnsavedChangesDialog'
import WorldMapEditorPanel from '../components/worldmapeditor/WorldMapEditorPanel'
import EditorFileListPanel, { type DisabledActions } from '../components/shared/EditorFileListPanel'
import { RowTooltip } from '../components/shared/RowTooltip'
import { parseWorldMapXml, serializeWorldMapXml } from '../utils/worldMapXml'
import { FIELD_NAMES } from '../utils/worldMapRenderer'
import { activeRel, baseName, displayName, joinRel, relFolder } from '../utils/mapFileRel'
import { folderOptions } from '../utils/fileTree'
import {
  DEFAULT_WORLD_MAP,
  fieldOfReferenceFilename,
  isReferenceFilename,
  referenceFilenameFor,
  pointKey,
  LEGACY_REFERENCE_FILENAME,
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
  /** The same as {@link template}: the panel's name for the `.ignore` set. */
  archived?: boolean
  /** True only for a reference set — one per field map (HTOO-410). */
  isReferenceSet?: boolean
  /** The field this reference set serves; null for the legacy single set. */
  referenceField?: string | null
}

const WORLDMAPS_SUBDIR = 'worldmaps'

// ── File list panel ───────────────────────────────────────────────────────────

const matchesQuery = (f: FileEntry, q: string): boolean => f.display.toLowerCase().includes(q)

/** Reference sets are pinned above the list, so they answer the filter themselves. */
const referenceMatchesQuery = (q: string): boolean =>
  !q || 'referencemapset'.includes(q) || 'reference set'.includes(q)

function FileListPanel({
  referenceFiles,
  files,
  templateFiles,
  selectedFile,
  onSelect,
  onNew,
  onCreateReference,
  unsetFields,
  onArchive,
  onUnarchive,
  onDuplicate,
  onDelete,
  disabledActions,
  children
}: {
  referenceFiles: FileEntry[]
  files: FileEntry[]
  templateFiles: FileEntry[]
  selectedFile: FileEntry | null
  onSelect: (f: FileEntry) => void
  onNew: () => void
  onCreateReference: (field: string) => void
  /** Fields with no reference set yet — what the create menu offers. */
  unsetFields: string[]
  onArchive: () => void
  onUnarchive: () => void
  onDuplicate: (f: FileEntry) => void
  onDelete: (f: FileEntry) => void
  disabledActions: DisabledActions
  children: React.ReactNode
}) {
  const viewMode = useSettingsStore((s) => s.fileListViewMode)
  const [createAnchor, setCreateAnchor] = useState<HTMLElement | null>(null)

  const renderRow = useCallback(
    (f: FileEntry, muted: boolean): React.ReactElement => (
      <RowTooltip
        details={[
          { label: 'File', value: f.rel },
          { label: 'Field', value: f.referenceField }
        ]}
      >
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
      </RowTooltip>
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
              {referenceFiles.length > 1 ? 'Reference Sets' : 'Reference Set'}
            </Typography>
          </Box>
          {referenceFiles.length > 0 && (
            <List dense disablePadding>
              {referenceFiles.map((ref) => (
                <RowTooltip
                  key={ref.rel}
                  details={[
                    { label: 'File', value: ref.rel },
                    { label: 'Field', value: ref.referenceField ?? 'none (legacy set)' }
                  ]}
                >
                  <ListItem disablePadding>
                    <ListItemButton
                      selected={selectedFile?.path === ref.path}
                      onClick={() => onSelect(ref)}
                    >
                      <ListItemText
                        // The field is the identity of a reference set, so it
                        // leads. The legacy set names no field and says so.
                        primary={ref.referenceField ?? 'Reference Set (no field)'}
                        secondary={ref.name}
                        slotProps={{
                          primary: { noWrap: true, variant: 'body2' },
                          secondary: { noWrap: true, variant: 'caption' }
                        }}
                      />
                    </ListItemButton>
                  </ListItem>
                </RowTooltip>
              ))}
            </List>
          )}
          {unsetFields.length > 0 && (
            <Box sx={{ px: 1.5, pb: 1, pt: referenceFiles.length > 0 ? 0.5 : 0 }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={(e) => setCreateAnchor(e.currentTarget)}
                fullWidth
              >
                {referenceFiles.length > 0 ? 'Reference Set for a Field' : 'Create Reference Set'}
              </Button>
              <Menu
                anchorEl={createAnchor}
                open={!!createAnchor}
                onClose={() => setCreateAnchor(null)}
              >
                {unsetFields.map((f) => (
                  <MenuItem
                    key={f}
                    onClick={() => {
                      setCreateAnchor(null)
                      onCreateReference(f)
                    }}
                  >
                    {f}
                  </MenuItem>
                ))}
              </Menu>
            </Box>
          )}
          <Divider sx={{ my: 0.5 }} />
        </>
      ),
    [referenceFiles, unsetFields, createAnchor, selectedFile, onSelect, onCreateReference]
  )

  return (
    <EditorFileListPanel
      title="World Maps"
      entityLabel="world map"
      files={files}
      archivedFiles={templateFiles}
      archivedLabel="Templates"
      selectedFile={selectedFile}
      matches={matchesQuery}
      renderRow={renderRow}
      header={header}
      // The Create Reference Set button counts as content: a world with no
      // world maps at all still gets an actionable panel, not "none found".
      headerMatches={referenceMatchesQuery}
      emptyMessage="No world map XMLs found. Check that a library is set in Settings."
      onNew={onNew}
      archiveLabel="Move to Templates"
      unarchiveLabel="Move to Active"
      onArchive={onArchive}
      onUnarchive={onUnarchive}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
      disabledActions={disabledActions}
    >
      {children}
    </EditorFileListPanel>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorldMapPage() {
  const activeLibrary = useSettingsStore((s) => s.activeLibrary)

  const [referenceFiles, setReferenceFiles] = useState<FileEntry[]>([])
  const [files, setFiles] = useState<FileEntry[]>([])
  const [templateFiles, setTemplateFiles] = useState<FileEntry[]>([])
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null)
  const [editingMap, setEditingMap] = useState<WorldMapData | null>(null)
  const [loadingMap, setLoadingMap] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
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

  const { index: worldIndex, refresh: refreshWorldIndex } = useWorldIndex()
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
      setReferenceFiles([])
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
        ...(template && { template: true, archived: true })
      })
      // listSection sorts by code unit; re-sort for display with numeric
      // collation so Field10 follows Field2.
      const byDisplay = (a: FileEntry, b: FileEntry) =>
        a.display.localeCompare(b.display, undefined, { numeric: true })

      setFiles(active.map((rel) => toEntry(rel, false)).sort(byDisplay))

      // Reference sets live at the archive root — a template filed in a
      // subfolder that happens to share the name is just a template. There is
      // one per field map now (HTOO-410), and possibly the legacy unfielded set
      // from before that, which is listed alongside them until it is renamed.
      const templates = archived.map((rel) => toEntry(rel, true))
      const refs = templates
        .filter((f) => relFolder(f.rel) === '' && isReferenceFilename(f.name))
        .map((f) => ({
          ...f,
          isReferenceSet: true,
          referenceField: fieldOfReferenceFilename(f.name) ?? null
        }))
        // Legacy first, then by field, so the list reads in field order.
        .sort((a, b) => (a.referenceField ?? '').localeCompare(b.referenceField ?? ''))
      const refRels = new Set(refs.map((r) => r.rel))
      setReferenceFiles(refs)
      setTemplateFiles(templates.filter((f) => !refRels.has(f.rel)).sort(byDisplay))
    } catch {
      setFiles([])
      setTemplateFiles([])
      setReferenceFiles([])
    }
  }

  useEffect(() => {
    if (!activeLibrary) {
      setReferenceFiles([])
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

  // ── Create reference set ──────────────────────────────────────────────────

  /**
   * Fields with no reference set of their own.
   *
   * The legacy unfielded set claims no field, so it never removes one from this
   * list. Renaming it to a field's name is what adopts it, and the editor
   * offers that: a reference set's computed filename comes from its field.
   */
  const unsetFields = useMemo(() => {
    const taken = new Set(referenceFiles.map((r) => r.referenceField).filter(Boolean))
    return FIELD_NAMES.filter((f) => !taken.has(f))
  }, [referenceFiles])

  const handleCreateReference = async (field: string) => {
    if (!ignoreDir) return
    const filename = referenceFilenameFor(field)
    const refPath = `${ignoreDir}/${filename}`
    try {
      const newMap: WorldMapData = {
        ...DEFAULT_WORLD_MAP,
        name: `Reference Map Set ${field}`,
        clientMap: field
      }
      const xml = serializeWorldMapXml(newMap)
      await window.api.writeFile(refPath, xml)
      const entry: FileEntry = {
        rel: `.ignore/${filename}`,
        name: filename,
        display: displayName(filename),
        path: refPath,
        template: true,
        archived: true,
        isReferenceSet: true,
        referenceField: field
      }
      setReferenceFiles((prev) =>
        [...prev, entry].sort((a, b) =>
          (a.referenceField ?? '').localeCompare(b.referenceField ?? '')
        )
      )
      // Open it immediately for editing
      setSelectedFile(entry)
      setEditingMap(newMap)
      setMeta(null)
      setReferencePoints(null)
      setLoadError(null)
      void refreshWorldIndex()
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

  /**
   * Carry a world map's sidecar with it when the file moves. The sidecar is
   * keyed on the map's rel, so a rename that leaves it behind unlinks the map
   * from its reference set, with no error.
   *
   * The world map has already moved when this runs, so a failure here does not
   * undo or cancel that. It returns false, and the caller says so.
   */
  const moveSidecar = async (fromRel: string, toRel: string): Promise<boolean> => {
    const from = metaPath(fromRel)
    const to = metaPath(toRel)
    if (!from || !to || from === to) return true
    try {
      if (await window.api.exists(from)) await window.api.moveFile(from, to)
      return true
    } catch {
      return false
    }
  }
  const SIDECAR_LEFT =
    'Its link to the reference set (.meta.json) did not move. Link it to the reference set again.'

  const loadMetaAndReference = async (
    rel: string,
    field: string
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
      // Resolution order, most specific first: the name the sidecar stores, the
      // set for this map's own field (HTOO-410), then the legacy unfielded set.
      // A world upgraded field by field has sidecars of all three vintages.
      const storedPath = m.reference ? `${ignoreDir}/${m.reference}` : null
      let refPath: string | null = null
      let refName: string | null = null
      for (const candidate of [
        m.reference,
        field ? referenceFilenameFor(field) : null,
        LEGACY_REFERENCE_FILENAME
      ]) {
        if (!candidate) continue
        const p = `${ignoreDir}/${candidate}`
        if (await window.api.exists(p)) {
          refPath = p
          refName = candidate
          break
        }
      }
      if (!refPath || !refName) return null
      if (refPath !== storedPath) m.reference = refName
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
      const parsed = parseWorldMapXml(xml)
      setEditingMap(parsed)

      const result = await loadMetaAndReference(file.rel, parsed.clientMap)
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

      if (isRename && selectedFile) {
        // The collision check lives in `moveFile` — see MapEditorPage.handleSave.
        try {
          await window.api.moveFile(selectedFile.path, newPath)
        } catch (e) {
          setSnackbar({
            message: `${e instanceof Error ? e.message : 'Cannot rename this world map'}. Rename cancelled.`,
            severity: 'error'
          })
          return
        }
      }

      const sidecarMoved =
        isRename && selectedFile ? await moveSidecar(selectedFile.rel, targetRel) : true

      // A new world map (New, or Duplicate) must not write over a file that is
      // there. The renamed one is checked inside `moveFile`, above.
      if (!selectedFile && (await window.api.exists(newPath))) {
        setSnackbar({
          message: `A world map file named "${targetRel}" exists. Change the filename, then save.`,
          severity: 'error'
        })
        return
      }

      await window.api.writeFile(newPath, xml)
      setEditingMap(data)

      if (isRename || !selectedFile) {
        if (isRename) {
          setSnackbar(
            sidecarMoved
              ? { message: `Renamed to "${fileName}".`, severity: 'success' }
              : { message: `Renamed to "${fileName}". ${SIDECAR_LEFT}`, severity: 'warning' }
          )
        }
        setSelectedFile({
          rel: isTemplate ? `.ignore/${targetRel}` : targetRel,
          path: newPath,
          name: baseName(targetRel),
          display: displayName(targetRel),
          template: isTemplate || undefined,
          archived: isTemplate || undefined,
          isReferenceSet: selectedFile?.isReferenceSet
        })
      }

      markClean()
      await loadFiles()
      // Nothing used to refresh the index after a write — see HTOO-335.
      void refreshWorldIndex()
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
      // move, not copy — see MapEditorPage.handleArchive
      await window.api.moveFile(selectedFile.path, destPath)
      markClean()
      setSelectedFile(null)
      setEditingMap(null)
      setMeta(null)
      setReferencePoints(null)
      await loadFiles()
      void refreshWorldIndex()
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
      // move, not copy — see MapEditorPage.handleArchive
      await window.api.moveFile(selectedFile.path, destPath)
      markClean()
      setSelectedFile(null)
      setEditingMap(null)
      setMeta(null)
      setReferencePoints(null)
      await loadFiles()
      void refreshWorldIndex()
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
    // Link to the set for this map's own field, and fall back to the legacy
    // unfielded set for a world not split by field yet (HTOO-410).
    const candidates = [
      editingMap.clientMap ? referenceFilenameFor(editingMap.clientMap) : null,
      LEGACY_REFERENCE_FILENAME
    ].filter((c): c is string => c !== null)
    let refName: string | null = null
    for (const c of candidates) {
      if (await window.api.exists(`${ignoreDir}/${c}`)) {
        refName = c
        break
      }
    }
    if (!refName) {
      setSnackbar({
        message: `No reference set for ${editingMap.clientMap || 'this field'}. Create one first.`,
        severity: 'error'
      })
      return
    }
    const refPath = `${ignoreDir}/${refName}`
    try {
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

      const newMeta: WorldMapMeta = { reference: refName, excludes }
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

  /**
   * Rename only: move the file, and its sidecar, to the typed name and folder,
   * and write nothing. The editor keeps its unsaved changes. The collision check
   * is inside `moveFile` (HTOO-379).
   */
  const handleRenameFile = async (fileName: string, folder: string) => {
    if (!selectedFile || !worldmapsDir || !ignoreDir) return
    const targetRel = joinRel(folder, fileName)
    if (targetRel === activeRel(selectedFile.rel)) return
    const isTemplateFile = selectedFile.template === true
    const newPath = `${isTemplateFile ? ignoreDir : worldmapsDir}/${targetRel}`
    try {
      await window.api.moveFile(selectedFile.path, newPath)
    } catch (e) {
      setSnackbar({
        message: `${e instanceof Error ? e.message : 'Cannot rename this world map'}. Rename cancelled.`,
        severity: 'error'
      })
      return
    }
    const sidecarMoved = await moveSidecar(selectedFile.rel, targetRel)
    const rel = isTemplateFile ? `.ignore/${targetRel}` : targetRel
    setSelectedFile({
      ...selectedFile,
      rel,
      path: newPath,
      name: baseName(targetRel),
      display: displayName(rel)
    })
    setSnackbar(
      sidecarMoved
        ? { message: `Renamed to "${fileName}".`, severity: 'success' }
        : { message: `Renamed to "${fileName}". ${SIDECAR_LEFT}`, severity: 'warning' }
    )
    await loadFiles()
    void refreshWorldIndex()
  }

  /**
   * Duplicate opens a copy of the file as a new, unsaved world map. Nothing is
   * written until Save. The copy's Name takes " (copy)", and the filename
   * follows the Name, so the copy does not save over its original.
   */
  const doDuplicate = async (file: FileEntry) => {
    try {
      const bytes = await window.api.readFile(file.path)
      const parsed = parseWorldMapXml(new TextDecoder('utf-8').decode(bytes))
      setSelectedFile(null)
      setLoadError(null)
      setMeta(null)
      setReferencePoints(null)
      setEditingMap({ ...parsed, name: `${parsed.name} (copy)` })
      setSnackbar({
        message: `Opened a copy of "${file.display}". Save writes it as a new file.`,
        severity: 'info'
      })
    } catch (err) {
      setSnackbar({
        message: `Duplicate failed: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error'
      })
    }
  }
  const handleDuplicate = (file: FileEntry) => guard(() => doDuplicate(file))

  /** Delete moves the file and its sidecar to the OS trash, after the panel's
   *  confirmation. */
  const handleDelete = async (file: FileEntry) => {
    try {
      await window.api.trashFile(file.path)
      const sidecar = metaPath(file.rel)
      if (sidecar && (await window.api.exists(sidecar))) await window.api.trashFile(sidecar)
      if (selectedFile?.path === file.path) {
        markClean()
        setSelectedFile(null)
        setEditingMap(null)
        setMeta(null)
        setReferencePoints(null)
      }
      await loadFiles()
      void refreshWorldIndex()
    } catch (err) {
      setSnackbar({
        message: `Delete failed: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error'
      })
    }
  }

  // A reference set is one per field, at the archive root, and derived world
  // maps link to it by name. None of the item actions applies to it.
  const disabledActions: DisabledActions =
    selectedFile?.isReferenceSet === true
      ? {
          archive: 'A reference set stays at the archive root',
          copy: 'A reference set is one per field. Create one from the list.',
          delete: 'Derived world maps link to a reference set, so it is not deleted here'
        }
      : {}

  const handleDirtyChange = useCallback(
    (dirty: boolean) => {
      dirty ? markDirty() : markClean()
    },
    [markDirty, markClean]
  )
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
        referenceFiles={referenceFiles}
        unsetFields={unsetFields}
        files={files}
        templateFiles={templateFiles}
        selectedFile={selectedFile}
        onSelect={handleSelect}
        onNew={handleNew}
        onCreateReference={(field) => guard(() => handleCreateReference(field))}
        onArchive={() => void handleMoveToTemplates()}
        onUnarchive={() => void handleMoveToActive()}
        onDuplicate={handleDuplicate}
        onDelete={(f) => void handleDelete(f)}
        disabledActions={disabledActions}
      >
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
            isReferenceSet={isReferenceSet}
            isExisting={!!selectedFile}
            mapNames={mapNames}
            meta={meta}
            referencePoints={referencePoints}
            onSave={handleSave}
            onRenameFile={handleRenameFile}
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
      </FileListPanel>
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
