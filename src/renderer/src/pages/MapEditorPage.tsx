import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Snackbar,
  TextField,
  Tooltip,
  Typography
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ArchiveIcon from '@mui/icons-material/Archive'
import SearchIcon from '@mui/icons-material/Search'
import { useSettingsStore, useMapFilesDirectory } from '../store/settingsStore'
import { useUnsavedGuard } from '../hooks/useUnsavedGuard'
import { useWorldIndex } from '../hooks/useWorldIndex'
import UnsavedChangesDialog from '../components/UnsavedChangesDialog'
import MapEditorPanel from '../components/mapeditor/MapEditorPanel'
import SectionFileList from '../components/shared/SectionFileList'
import DimensionPickerDialog from '../components/catalog/DimensionPickerDialog'
import { parseMapXml, serializeMapXml } from '../utils/mapXml'
import { activeRel, baseName, displayName, joinRel, relFolder } from '../utils/mapFileRel'
import { folderOptions } from '../utils/fileTree'
import { DEFAULT_MAP, type MapData } from '../data/mapData'

interface FileEntry {
  /**
   * Type-relative, forward-slashed: `Abel.xml`, `fire/blast.xml`,
   * `.ignore/old.xml`. This *is* the `mapDetails[].filename` index key, so
   * name/id lookups need no prefix stripping.
   */
  rel: string
  /** Absolute, forward-slashed: `${dir}/${rel}`. */
  path: string
  /** Row label and filter target — see `displayName`. */
  display: string
  mapName?: string
  mapId?: number
  archived?: boolean
}

const MAPS_SUBDIR = 'maps'

// ── Derive map id from binary filename (e.g. lod00001.map → 1, hyb30001.map → 30001) ────

function mapBinToId(filename: string): number {
  const m = filename.match(/^(?:lod|hyb)(\d+)\.map$/i)
  return m ? parseInt(m[1], 10) : 0
}

// ── New Map Dialog ────────────────────────────────────────────────────────────

// Each binary is classified before display
type BinStatus = 'available' | 'archived'
interface BinEntry {
  name: string
  id: number
  status: BinStatus
}

interface NewMapDialogProps {
  open: boolean
  activeMapDirectory: string | null
  worldIndex: WorldIndex | null
  clientPath: string | null
  onConfirm: (data: MapData) => void
  onCancel: () => void
}

function NewMapDialog({
  open,
  activeMapDirectory,
  worldIndex,
  clientPath,
  onConfirm,
  onCancel
}: NewMapDialogProps) {
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState<BinEntry[]>([])
  const [search, setSearch] = useState('')
  const [selectedBin, setSelectedBin] = useState<string | null>(null)
  const [dimBuffer, setDimBuffer] = useState<Uint8Array | null>(null)
  const [dimPickerOpen, setDimPickerOpen] = useState(false)
  const [loadingBin, setLoadingBin] = useState(false)

  // Build id sets from index — available without any filesystem scan
  const activeIds = useMemo(
    () => new Set((worldIndex?.mapDetails ?? []).map((m) => m.id)),
    [worldIndex]
  )
  const ignoredIds = useMemo(
    () => new Set((worldIndex?.ignoredMapDetails ?? []).map((m) => m.id)),
    [worldIndex]
  )

  // Scan the binary directory only once per dialog open
  useEffect(() => {
    if (!open) {
      setEntries([])
      setSearch('')
      setSelectedBin(null)
      setDimBuffer(null)
      return
    }
    if (!activeMapDirectory) return

    setLoading(true)
    ;(async () => {
      try {
        const dirEntries = await window.api.listDir(activeMapDirectory)
        const result: BinEntry[] = []
        for (const e of dirEntries) {
          if (e.isDirectory || !/\.map$/i.test(e.name)) continue
          const id = mapBinToId(e.name)
          if (!id) continue
          if (activeIds.has(id)) continue // already has an active XML — omit
          const status: BinStatus = ignoredIds.has(id) ? 'archived' : 'available'
          result.push({ name: e.name, id, status })
        }
        result.sort((a, b) => a.id - b.id)
        setEntries(result)
      } catch {
        setEntries([])
      } finally {
        setLoading(false)
      }
    })()
  }, [open, activeMapDirectory, activeIds, ignoredIds])

  const handleSelectBin = async (entry: BinEntry) => {
    if (!activeMapDirectory) return
    setSelectedBin(entry.name)
    setLoadingBin(true)
    try {
      const raw = await window.api.readFile(`${activeMapDirectory}/${entry.name}`)
      setDimBuffer(new Uint8Array(raw))
      setDimPickerOpen(true)
    } catch {
      // binary unreadable
    } finally {
      setLoadingBin(false)
    }
  }

  const handleDimConfirm = (width: number, height: number) => {
    if (!selectedBin) return
    const id = mapBinToId(selectedBin)
    setDimPickerOpen(false)
    onConfirm({ ...DEFAULT_MAP, id, x: width, y: height })
  }

  const noIndex = !worldIndex
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q
      ? entries.filter((e) => e.name.toLowerCase().includes(q) || String(e.id).includes(q))
      : entries
  }, [entries, search])

  return (
    <>
      <Dialog open={open && !dimPickerOpen} onClose={onCancel} maxWidth="xs" fullWidth>
        <DialogTitle>New Map — Select Binary</DialogTitle>
        <DialogContent sx={{ pb: 1 }}>
          {!activeMapDirectory ? (
            <Alert severity="info" sx={{ mt: 1 }}>
              Configure a map directory in Settings to select an existing binary.
            </Alert>
          ) : loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={40} />
            </Box>
          ) : (
            <>
              {noIndex && (
                <Alert severity="warning" sx={{ mb: 1 }}>
                  Index not built — all map files shown. Build the index in Settings to filter out
                  already-assigned maps.
                </Alert>
              )}
              <TextField
                size="small"
                fullWidth
                placeholder="Filter by name or ID…"
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    )
                  }
                }}
                sx={{ mt: 1, mb: 1 }}
              />
              {filtered.length === 0 ? (
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary',
                    py: 1
                  }}
                >
                  {entries.length === 0
                    ? 'All map binaries are already assigned to active XML files, or no binaries were found.'
                    : 'No matches.'}
                </Typography>
              ) : (
                <List
                  dense
                  disablePadding
                  sx={{
                    maxHeight: 380,
                    overflow: 'auto',
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1
                  }}
                >
                  {filtered.map((entry) => (
                    <ListItem
                      key={entry.name}
                      disablePadding
                      secondaryAction={
                        entry.status === 'archived' ? (
                          <Tooltip title="This map ID has an XML in .ignore (archived)">
                            <Chip
                              icon={<ArchiveIcon />}
                              label="Archived"
                              size="small"
                              color="warning"
                              variant="outlined"
                              sx={{ mr: 1 }}
                            />
                          </Tooltip>
                        ) : undefined
                      }
                    >
                      <ListItemButton
                        onClick={() => handleSelectBin(entry)}
                        disabled={loadingBin}
                        sx={{ pr: entry.status === 'archived' ? 12 : undefined }}
                      >
                        <ListItemText
                          primary={entry.name}
                          secondary={`Map ID: ${entry.id}`}
                          slotProps={{
                            primary: { variant: 'body2', sx: { fontFamily: 'monospace' } },
                            secondary: { variant: 'caption' }
                          }}
                        />
                        {loadingBin && selectedBin === entry.name && (
                          <CircularProgress size={16} sx={{ ml: 1 }} />
                        )}
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel}>Cancel</Button>
        </DialogActions>
      </Dialog>
      {dimBuffer && selectedBin && (
        <DimensionPickerDialog
          open={dimPickerOpen}
          filename={selectedBin}
          fileBuffer={dimBuffer}
          clientPath={clientPath}
          onConfirm={handleDimConfirm}
          onCancel={() => {
            setDimPickerOpen(false)
            setSelectedBin(null)
            setDimBuffer(null)
          }}
        />
      )}
    </>
  )
}

// ── File list panel ───────────────────────────────────────────────────────────

/**
 * Filter what the user sees, not the raw rel path — searching the latter would
 * make "ignore" match every archived map.
 */
function matchesQuery(f: FileEntry, q: string): boolean {
  return (
    f.display.toLowerCase().includes(q) ||
    (f.mapName?.toLowerCase().includes(q) ?? false) ||
    (f.mapId !== undefined && `lod${f.mapId}`.includes(q))
  )
}

function FileListPanel({
  files,
  archivedFiles,
  selectedFile,
  onSelect,
  onNew,
  showArchived,
  onToggleArchived
}: {
  files: FileEntry[]
  archivedFiles: FileEntry[]
  selectedFile: FileEntry | null
  onSelect: (f: FileEntry) => void
  onNew: () => void
  showArchived: boolean
  onToggleArchived: () => void
}) {
  const viewMode = useSettingsStore((s) => s.fileListViewMode)

  // Active + archived rows are identical except archived ones are muted.
  const renderRow = useCallback(
    (f: FileEntry, muted: boolean): React.ReactElement => {
      const italicClip = {
        display: 'block',
        fontStyle: 'italic',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        ...(muted && { color: 'text.disabled' })
      }
      return (
        <ListItem disablePadding>
          <ListItemButton selected={selectedFile?.path === f.path} onClick={() => onSelect(f)}>
            <ListItemText
              // In folder view the enclosing header already names the folder,
              // so the row shows only the filename.
              primary={viewMode === 'folder' ? baseName(f.rel).replace(/\.xml$/i, '') : f.display}
              secondary={
                <>
                  {f.mapName && (
                    <Box component="span" sx={italicClip}>
                      {f.mapName}
                    </Box>
                  )}
                  {f.mapId !== undefined && (
                    <Box component="span" sx={italicClip}>{`lod${f.mapId}`}</Box>
                  )}
                </>
              }
              slotProps={{
                primary: {
                  noWrap: true,
                  variant: 'body2',
                  ...(muted && { color: 'text.secondary' })
                },

                secondary: { component: 'div', variant: 'caption' }
              }}
            />
          </ListItemButton>
        </ListItem>
      )
    },
    [selectedFile, onSelect, viewMode]
  )

  return (
    <SectionFileList
      title="Maps"
      files={files}
      archivedFiles={archivedFiles}
      archivedLabel="Archived"
      showArchived={showArchived}
      onToggleArchived={onToggleArchived}
      matches={matchesQuery}
      renderRow={renderRow}
      emptyMessage="No map XMLs found. Check that a library is set in Settings."
      actions={
        <Tooltip title="New Map">
          <Button size="small" startIcon={<AddIcon />} onClick={onNew}>
            New
          </Button>
        </Tooltip>
      }
    />
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MapEditorPage() {
  const activeLibrary = useSettingsStore((s) => s.activeLibrary)
  const activeMapDirectory = useMapFilesDirectory()
  const clientPath = useSettingsStore((s) => s.clientPath)

  const [files, setFiles] = useState<FileEntry[]>([])
  const [archivedFiles, setArchivedFiles] = useState<FileEntry[]>([])
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null)
  const [editingMap, setEditingMap] = useState<MapData | null>(null)
  const [loadingMap, setLoadingMap] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [snackbar, setSnackbar] = useState<{
    message: string
    severity: 'success' | 'error' | 'info'
  } | null>(null)

  const {
    markDirty,
    markClean,
    saveRef,
    guard,
    dialogOpen,
    handleDialogSave,
    handleDialogDiscard,
    handleDialogCancel
  } = useUnsavedGuard('Map')

  const { index: worldIndex } = useWorldIndex()
  const mapNames = worldIndex?.maps ?? []
  const npcNames = worldIndex?.npcs ?? []
  const worldMapNames = worldIndex?.worldmaps ?? []
  const spawnGroupNames = worldIndex?.spawngroups ?? []

  // The section directory comes back from fs:listSection rather than being
  // rebuilt from activeLibrary here. It is the same join hybindex itself uses,
  // already forward-slashed, so row paths and write paths cannot disagree about
  // separators — a second derivation would have to normalize identically
  // forever, and resolveLibraryPath hands back native separators.
  const [mapsDir, setMapsDir] = useState<string | null>(null)
  const ignoreDir = mapsDir ? `${mapsDir}/.ignore` : null

  // filename → map <Name> lookup built from the index (zero extra file reads)
  const activeNameMap = useMemo(
    () => new Map((worldIndex?.mapDetails ?? []).map((d) => [d.filename, d.name])),
    [worldIndex]
  )
  const ignoredNameMap = useMemo(
    () => new Map((worldIndex?.ignoredMapDetails ?? []).map((d) => [d.filename, d.name])),
    [worldIndex]
  )
  const activeIdMap = useMemo(
    () => new Map((worldIndex?.mapDetails ?? []).map((d) => [d.filename, d.id])),
    [worldIndex]
  )
  const ignoredIdMap = useMemo(
    () => new Map((worldIndex?.ignoredMapDetails ?? []).map((d) => [d.filename, d.id])),
    [worldIndex]
  )

  // Save destinations offered by the folder picker: every folder maps already
  // occupy, archived ones included — a folder emptied by archiving everything
  // in it is still somewhere you might file a map.
  const folderChoices = useMemo(
    () => folderOptions([...files, ...archivedFiles]),
    [files, archivedFiles]
  )

  /**
   * One listSection call replaces the two flat listDir scans this used to do.
   * It enumerates recursively — so a map filed in a subdirectory is no longer
   * invisible here while the index lists it — and returns active and archived
   * already split, which excludes the archive *explicitly* rather than relying
   * on a `.isFile()` filter to drop the `.ignore` directory by accident.
   */
  const loadFiles = async () => {
    if (!activeLibrary) {
      setFiles([])
      setArchivedFiles([])
      setMapsDir(null)
      return
    }
    try {
      const { dir, active, archived } = await window.api.listSection(activeLibrary, MAPS_SUBDIR)
      setMapsDir(dir)
      const toEntry = (rel: string, isArchived: boolean): FileEntry => ({
        rel,
        path: `${dir}/${rel}`,
        display: displayName(rel),
        mapName: (isArchived ? ignoredNameMap : activeNameMap).get(rel),
        mapId: (isArchived ? ignoredIdMap : activeIdMap).get(rel),
        ...(isArchived && { archived: true })
      })
      // listSection sorts by code unit — deterministic, but it puts lod10 ahead
      // of lod2. Re-sort for display with numeric collation.
      const byDisplay = (a: FileEntry, b: FileEntry) =>
        a.display.localeCompare(b.display, undefined, { numeric: true })
      setFiles(active.map((rel) => toEntry(rel, false)).sort(byDisplay))
      setArchivedFiles(archived.map((rel) => toEntry(rel, true)).sort(byDisplay))
    } catch {
      setFiles([])
      setArchivedFiles([])
    }
  }

  useEffect(() => {
    if (!activeLibrary) {
      setFiles([])
      setArchivedFiles([])
      setSelectedFile(null)
      setEditingMap(null)
      return
    }
    loadFiles()
    // `loadFiles` is declared in the component body, so it is a new function on
    // every render. Adding it here would re-scan the library filesystem on every
    // render. Re-scanning when the active library changes is exactly the
    // intent; wrapping loadFiles in useCallback to satisfy the rule honestly is
    // a larger refactor, tracked in docs/plans/00a-backlog.md.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLibrary])

  // Re-populate mapName/mapId when the index is (re)built without re-scanning the filesystem
  useEffect(() => {
    setFiles((prev) =>
      prev.map((f) => ({
        ...f,
        mapName: activeNameMap.get(f.rel),
        mapId: activeIdMap.get(f.rel)
      }))
    )
    setArchivedFiles((prev) =>
      prev.map((f) => ({
        ...f,
        mapName: ignoredNameMap.get(f.rel),
        mapId: ignoredIdMap.get(f.rel)
      }))
    )
  }, [activeNameMap, ignoredNameMap, activeIdMap, ignoredIdMap])

  // Both lists arrive from one listSection call, so revealing the archive is
  // pure state — no round-trip.
  const handleToggleArchived = () => setShowArchived((v) => !v)

  const doNew = () => setNewDialogOpen(true)
  const handleNew = () => guard(doNew)

  const handleNewConfirm = (data: MapData) => {
    setNewDialogOpen(false)
    setSelectedFile(null)
    setLoadError(null)
    setEditingMap(data)
  }

  const doSelect = async (file: FileEntry) => {
    setSelectedFile(file)
    setLoadError(null)
    setEditingMap(null)
    setLoadingMap(true)
    try {
      const bytes = await window.api.readFile(file.path)
      const xml = new TextDecoder('utf-8').decode(bytes)
      const parsed = parseMapXml(xml)
      setEditingMap(parsed)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to parse XML.')
    } finally {
      setLoadingMap(false)
    }
  }
  const handleSelect = (file: FileEntry) => guard(() => doSelect(file))

  const handleSave = async (data: MapData, fileName: string, folder: string) => {
    // mapsDir arrives with the first listSection response, so it is null until
    // the list has loaded — there is nothing to save against before then.
    if (!activeLibrary || !mapsDir || !ignoreDir) return
    try {
      // `fileName` is a bare name from the editor's field; `folder` is the
      // picker's, defaulted to the folder the map already lives in. Resolving
      // the name against the type root instead would silently lift a
      // subfoldered map out of its folder — most easily by clicking
      // regenerate, which hands back a bare `lod00001.xml`.
      const targetRel = joinRel(folder, fileName)
      const isRename = !!(selectedFile && targetRel !== activeRel(selectedFile.rel))
      const newPath = isRename || !selectedFile ? `${mapsDir}/${targetRel}` : selectedFile.path

      const xml = serializeMapXml(data)
      await window.api.writeFile(newPath, xml)
      setEditingMap(data)

      if (isRename && selectedFile) {
        // activeRel, not rel: keyed on the rel path this mirrors an active
        // map's subfolder into the archive, but an already-archived map's rel
        // still carries `.ignore/` and would double it into `.ignore/.ignore/`.
        const archivePath = `${ignoreDir}/${activeRel(selectedFile.rel)}`
        await window.api.copyFile(selectedFile.path, archivePath)
        setSnackbar({
          message: `Saved as "${fileName}". Old file remains (manual delete may be needed).`,
          severity: 'info'
        })
        setSelectedFile({ rel: targetRel, path: newPath, display: displayName(targetRel) })
      } else if (!selectedFile) {
        setSelectedFile({ rel: targetRel, path: newPath, display: displayName(targetRel) })
      }

      markClean()
      await loadFiles()
    } catch (err) {
      console.error('Failed to save map:', err)
      setSnackbar({
        message: `Save failed: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error'
      })
    }
  }

  const handleArchive = async () => {
    if (!selectedFile || !ignoreDir || !mapsDir) return
    try {
      // `.ignore/<activeRel>` mirrors the active subpath, so archive/unarchive
      // round-trips instead of collapsing `fire/blast.xml` and `ice/blast.xml`
      // onto one name. Only active maps can reach here, so activeRel is a
      // no-op today — it keeps the prefix from ever being doubled.
      const destPath = `${ignoreDir}/${activeRel(selectedFile.rel)}`
      const exists = await window.api.exists(destPath)
      if (exists) {
        setSnackbar({
          message: 'An archived map with this name already exists.',
          severity: 'error'
        })
        return
      }
      // move, not copy: a copy leaves the map live in `maps/` while the UI
      // reports it archived, so the map the user took out of service is still
      // being served.
      await window.api.moveFile(selectedFile.path, destPath)
      markClean()
      setSelectedFile(null)
      setEditingMap(null)
      await loadFiles()
    } catch (err) {
      setSnackbar({
        message: `Archive failed: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error'
      })
    }
  }

  const handleUnarchive = async () => {
    if (!selectedFile || !mapsDir) return
    try {
      // Strip the `.ignore/` prefix but keep any subfolder beneath it, so the
      // map returns to where it was archived from.
      const destPath = `${mapsDir}/${activeRel(selectedFile.rel)}`
      const exists = await window.api.exists(destPath)
      if (exists) {
        setSnackbar({ message: 'An active map with this name already exists.', severity: 'error' })
        return
      }
      await window.api.moveFile(selectedFile.path, destPath)
      markClean()
      setSelectedFile(null)
      setEditingMap(null)
      await loadFiles()
    } catch (err) {
      setSnackbar({
        message: `Unarchive failed: ${err instanceof Error ? err.message : String(err)}`,
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
  const isArchived = selectedFile?.archived === true

  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <FileListPanel
        files={files}
        archivedFiles={archivedFiles}
        selectedFile={selectedFile}
        onSelect={handleSelect}
        onNew={handleNew}
        showArchived={showArchived}
        onToggleArchived={handleToggleArchived}
      />
      <Box sx={{ flex: 1, p: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loadError ? (
          <Alert severity="error">
            <strong>Failed to load map:</strong> {loadError}
          </Alert>
        ) : loadingMap ? (
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}
          >
            <CircularProgress size={64} thickness={4} color="info" disableShrink />
          </Box>
        ) : editingMap ? (
          <MapEditorPanel
            map={editingMap}
            initialFileName={selectedFile ? baseName(selectedFile.rel) : null}
            initialFolder={selectedFile ? relFolder(selectedFile.rel) : ''}
            folderOptions={folderChoices}
            isArchived={isArchived}
            isExisting={!!selectedFile}
            mapNames={mapNames}
            npcNames={npcNames}
            worldMapNames={worldMapNames}
            spawnGroupNames={spawnGroupNames}
            onSave={handleSave}
            onArchive={handleArchive}
            onUnarchive={handleUnarchive}
            onDirtyChange={handleDirtyChange}
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
              Select a map or create a new one.
            </Typography>
          </Box>
        )}
      </Box>
      <NewMapDialog
        open={newDialogOpen}
        activeMapDirectory={activeMapDirectory}
        worldIndex={worldIndex}
        clientPath={clientPath}
        onConfirm={handleNewConfirm}
        onCancel={() => setNewDialogOpen(false)}
      />
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
        label="Map"
        onSave={handleDialogSave}
        onDiscard={handleDialogDiscard}
        onCancel={handleDialogCancel}
      />
    </Box>
  )
}
