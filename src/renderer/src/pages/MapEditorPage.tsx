import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRecoilValue } from 'recoil'
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
  Divider,
  IconButton,
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
import { activeLibraryState, mapFilesDirectoryState, clientPathState } from '../recoil/atoms'
import { useUnsavedGuard } from '../hooks/useUnsavedGuard'
import { useWorldIndex } from '../hooks/useWorldIndex'
import UnsavedChangesDialog from '../components/UnsavedChangesDialog'
import MapEditorPanel from '../components/mapeditor/MapEditorPanel'
import DimensionPickerDialog from '../components/catalog/DimensionPickerDialog'
import { parseMapXml, serializeMapXml } from '../utils/mapXml'
import { DEFAULT_MAP, type MapData } from '../data/mapData'

interface FileEntry {
  name: string
  path: string
  mapName?: string
  mapId?: number
  archived?: boolean
}

const MAPS_SUBDIR = 'maps'
const IGNORE_SUBDIR = 'maps/.ignore'

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
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  )
                }}
                sx={{ mt: 1, mb: 1 }}
              />
              {filtered.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
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
                          primaryTypographyProps={{ fontFamily: 'monospace', variant: 'body2' }}
                          secondaryTypographyProps={{ variant: 'caption' }}
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
  const [search, setSearch] = React.useState('')

  const filtered = (list: FileEntry[]) => {
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.mapName?.toLowerCase().includes(q) ?? false) ||
        (f.mapId !== undefined && `lod${f.mapId}`.includes(q))
    )
  }

  const filteredActive = filtered(files)
  const filteredArchived = filtered(archivedFiles)

  return (
    <Box
      sx={{
        width: 240,
        flexShrink: 0,
        borderRight: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      <Box sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle2">Maps</Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title={showArchived ? 'Hide Archived' : 'Show Archived'}>
            <IconButton
              size="small"
              onClick={onToggleArchived}
              color={showArchived ? 'primary' : 'default'}
            >
              <ArchiveIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="New Map">
            <Button size="small" startIcon={<AddIcon />} onClick={onNew}>
              New
            </Button>
          </Tooltip>
        </Box>
      </Box>
      <Box sx={{ px: 1, pb: 1 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Filter..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            )
          }}
        />
      </Box>
      <Divider />
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {files.length === 0 && !showArchived ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No map XMLs found. Check that a library is set in Settings.
          </Typography>
        ) : filteredActive.length === 0 && (!showArchived || filteredArchived.length === 0) ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No matches.
          </Typography>
        ) : (
          <>
            <List dense disablePadding>
              {filteredActive.map((f) => (
                <ListItem key={f.path} disablePadding>
                  <ListItemButton
                    selected={selectedFile?.path === f.path}
                    onClick={() => onSelect(f)}
                  >
                    <ListItemText
                      primary={f.name.replace(/\.xml$/i, '')}
                      secondary={
                        <>
                          {f.mapName && (
                            <Box
                              component="span"
                              sx={{
                                display: 'block',
                                fontStyle: 'italic',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {f.mapName}
                            </Box>
                          )}
                          {f.mapId !== undefined && (
                            <Box
                              component="span"
                              sx={{
                                display: 'block',
                                fontStyle: 'italic',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >{`lod${f.mapId}`}</Box>
                          )}
                        </>
                      }
                      primaryTypographyProps={{ noWrap: true, variant: 'body2' }}
                      secondaryTypographyProps={{ component: 'div', variant: 'caption' }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
            {showArchived && filteredArchived.length > 0 && (
              <>
                <Divider sx={{ my: 0.5 }} />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ px: 1.5, py: 0.5, display: 'block' }}
                >
                  Archived
                </Typography>
                <List dense disablePadding>
                  {filteredArchived.map((f) => (
                    <ListItem key={f.path} disablePadding>
                      <ListItemButton
                        selected={selectedFile?.path === f.path}
                        onClick={() => onSelect(f)}
                      >
                        <ListItemText
                          primary={f.name.replace(/\.xml$/i, '')}
                          secondary={
                            <>
                              {f.mapName && (
                                <Box
                                  component="span"
                                  sx={{
                                    display: 'block',
                                    fontStyle: 'italic',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    color: 'text.disabled'
                                  }}
                                >
                                  {f.mapName}
                                </Box>
                              )}
                              {f.mapId !== undefined && (
                                <Box
                                  component="span"
                                  sx={{
                                    display: 'block',
                                    fontStyle: 'italic',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    color: 'text.disabled'
                                  }}
                                >{`lod${f.mapId}`}</Box>
                              )}
                            </>
                          }
                          primaryTypographyProps={{
                            noWrap: true,
                            variant: 'body2',
                            color: 'text.secondary'
                          }}
                          secondaryTypographyProps={{ component: 'div', variant: 'caption' }}
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

export default function MapEditorPage() {
  const activeLibrary = useRecoilValue(activeLibraryState)
  const activeMapDirectory = useRecoilValue(mapFilesDirectoryState)
  const clientPath = useRecoilValue(clientPathState)

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

  const mapsDir = activeLibrary ? `${activeLibrary}/${MAPS_SUBDIR}` : null
  const ignoreDir = activeLibrary ? `${activeLibrary}/${IGNORE_SUBDIR}` : null

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

  const loadActiveFiles = async () => {
    if (!mapsDir) {
      setFiles([])
      return
    }
    try {
      const entries = await window.api.listDir(mapsDir)
      setFiles(
        entries
          .filter((e) => !e.isDirectory && /\.xml$/i.test(e.name))
          .map((e) => ({
            name: e.name,
            path: `${mapsDir}/${e.name}`,
            mapName: activeNameMap.get(e.name),
            mapId: activeIdMap.get(e.name)
          }))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      )
    } catch {
      setFiles([])
    }
  }

  const loadArchivedFiles = async () => {
    if (!ignoreDir) {
      setArchivedFiles([])
      return
    }
    try {
      const entries = await window.api.listDir(ignoreDir)
      setArchivedFiles(
        entries
          .filter((e) => !e.isDirectory && /\.xml$/i.test(e.name))
          .map((e) => ({
            name: e.name,
            path: `${ignoreDir}/${e.name}`,
            mapName: ignoredNameMap.get(e.name),
            mapId: ignoredIdMap.get(e.name),
            archived: true
          }))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      )
    } catch {
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
    loadActiveFiles()
    loadArchivedFiles()
  }, [activeLibrary])

  // Re-populate mapName/mapId when the index is (re)built without re-scanning the filesystem
  useEffect(() => {
    setFiles((prev) =>
      prev.map((f) => ({
        ...f,
        mapName: activeNameMap.get(f.name),
        mapId: activeIdMap.get(f.name)
      }))
    )
    setArchivedFiles((prev) =>
      prev.map((f) => ({
        ...f,
        mapName: ignoredNameMap.get(f.name),
        mapId: ignoredIdMap.get(f.name)
      }))
    )
  }, [activeNameMap, ignoredNameMap, activeIdMap, ignoredIdMap])

  const handleToggleArchived = async () => {
    const next = !showArchived
    setShowArchived(next)
    if (next) await loadArchivedFiles()
  }

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

  const handleSave = async (data: MapData, fileName: string) => {
    if (!activeLibrary) return
    try {
      const isRename = !!(selectedFile && fileName !== selectedFile.name)
      const newPath = isRename || !selectedFile ? `${mapsDir}/${fileName}` : selectedFile.path

      const xml = serializeMapXml(data)
      await window.api.writeFile(newPath, xml)
      setEditingMap(data)

      if (isRename && selectedFile) {
        const archivePath = `${ignoreDir}/${selectedFile.name}`
        await window.api.copyFile(selectedFile.path, archivePath)
        setSnackbar({
          message: `Saved as "${fileName}". Old file remains (manual delete may be needed).`,
          severity: 'info'
        })
        setSelectedFile({ name: fileName, path: newPath })
      } else if (!selectedFile) {
        setSelectedFile({ name: fileName, path: newPath })
      }

      markClean()
      await loadActiveFiles()
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
      const destPath = `${ignoreDir}/${selectedFile.name}`
      const exists = await window.api.exists(destPath)
      if (exists) {
        setSnackbar({
          message: 'An archived map with this name already exists.',
          severity: 'error'
        })
        return
      }
      await window.api.copyFile(selectedFile.path, destPath)
      markClean()
      setSelectedFile(null)
      setEditingMap(null)
      await loadActiveFiles()
      await loadArchivedFiles()
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
      const destPath = `${mapsDir}/${selectedFile.name}`
      const exists = await window.api.exists(destPath)
      if (exists) {
        setSnackbar({ message: 'An active map with this name already exists.', severity: 'error' })
        return
      }
      await window.api.copyFile(selectedFile.path, destPath)
      markClean()
      setSelectedFile(null)
      setEditingMap(null)
      await loadActiveFiles()
      await loadArchivedFiles()
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
            initialFileName={selectedFile?.name ?? null}
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
            <Typography variant="body1" color="text.secondary">
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
