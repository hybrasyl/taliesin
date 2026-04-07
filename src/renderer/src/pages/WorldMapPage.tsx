import React, { useCallback, useEffect, useState } from 'react'
import { useRecoilValue } from 'recoil'
import {
  Alert, Box, Button, CircularProgress, Divider, IconButton,
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
import { DEFAULT_WORLD_MAP, computeWorldMapFilename, type WorldMapData } from '../data/worldMapData'

interface FileEntry {
  name: string
  path: string
  archived?: boolean
}

const WORLDMAPS_SUBDIR = 'worldmaps'
const IGNORE_SUBDIR    = 'worldmaps/.ignore'

// ── File list panel ───────────────────────────────────────────────────────────

function FileListPanel({
  files,
  archivedFiles,
  selectedFile,
  onSelect,
  onNew,
  showArchived,
  onToggleArchived,
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

  const filtered = (list: FileEntry[]) =>
    search.trim()
      ? list.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
      : list

  const filteredActive   = filtered(files)
  const filteredArchived = filtered(archivedFiles)

  return (
    <Box sx={{ width: 240, flexShrink: 0, borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle2">World Maps</Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title={showArchived ? 'Hide Archived' : 'Show Archived'}>
            <IconButton size="small" onClick={onToggleArchived} color={showArchived ? 'primary' : 'default'}>
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
        {files.length === 0 && !showArchived ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No world map XMLs found. Check that a library is set in Settings.
          </Typography>
        ) : filteredActive.length === 0 && (!showArchived || filteredArchived.length === 0) ? (
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
            {showArchived && filteredArchived.length > 0 && (
              <>
                <Divider sx={{ my: 0.5 }} />
                <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, py: 0.5, display: 'block' }}>
                  Archived
                </Typography>
                <List dense disablePadding>
                  {filteredArchived.map(f => (
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

  const [files,         setFiles]         = useState<FileEntry[]>([])
  const [archivedFiles, setArchivedFiles] = useState<FileEntry[]>([])
  const [selectedFile,  setSelectedFile]  = useState<FileEntry | null>(null)
  const [editingMap,    setEditingMap]    = useState<WorldMapData | null>(null)
  const [loadingMap,    setLoadingMap]    = useState(false)
  const [loadError,     setLoadError]     = useState<string | null>(null)
  const [showArchived,  setShowArchived]  = useState(false)
  const [snackbar,      setSnackbar]      = useState<{ message: string; severity: 'success' | 'error' | 'info' } | null>(null)

  const { markDirty, markClean, saveRef, guard, dialogOpen,
    handleDialogSave, handleDialogDiscard, handleDialogCancel } = useUnsavedGuard('World Map')

  const { index: worldIndex } = useWorldIndex()
  const mapNames = worldIndex?.maps ?? []

  const worldmapsDir = activeLibrary ? `${activeLibrary}/${WORLDMAPS_SUBDIR}` : null
  const ignoreDir    = activeLibrary ? `${activeLibrary}/${IGNORE_SUBDIR}`    : null

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

  const loadArchivedFiles = async () => {
    if (!ignoreDir) { setArchivedFiles([]); return }
    try {
      await window.api.ensureDir(ignoreDir)
      const entries = await window.api.listDir(ignoreDir)
      setArchivedFiles(
        entries
          .filter(e => !e.isDirectory && /\.xml$/i.test(e.name))
          .map(e => ({ name: e.name, path: `${ignoreDir}/${e.name}`, archived: true }))
          .sort((a, b) => a.name.localeCompare(b.name))
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

  const handleToggleArchived = async () => {
    const next = !showArchived
    setShowArchived(next)
    if (next) await loadArchivedFiles()
  }

  const doNew = () => {
    setSelectedFile(null)
    setLoadError(null)
    setEditingMap({ ...DEFAULT_WORLD_MAP })
  }
  const handleNew = () => guard(doNew)

  const doSelect = async (file: FileEntry) => {
    setSelectedFile(file)
    setLoadError(null)
    setEditingMap(null)
    setLoadingMap(true)
    try {
      const bytes = await window.api.readFile(file.path)
      const xml   = new TextDecoder('utf-8').decode(bytes)
      setEditingMap(parseWorldMapXml(xml))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to parse XML.')
    } finally {
      setLoadingMap(false)
    }
  }
  const handleSelect = (file: FileEntry) => guard(() => doSelect(file))

  const handleSave = async (data: WorldMapData, fileName: string) => {
    if (!activeLibrary || !worldmapsDir) return
    try {
      const isRename = !!(selectedFile && fileName !== selectedFile.name)
      const newPath  = isRename || !selectedFile ? `${worldmapsDir}/${fileName}` : selectedFile.path

      const xml = serializeWorldMapXml(data)
      await window.api.writeFile(newPath, xml)
      setEditingMap(data)

      if (isRename && selectedFile) {
        setSnackbar({ message: `Saved as "${fileName}". Old file remains (manual delete may be needed).`, severity: 'info' })
        setSelectedFile({ name: fileName, path: newPath })
      } else if (!selectedFile) {
        setSelectedFile({ name: fileName, path: newPath })
      }

      markClean()
      await loadActiveFiles()
    } catch (err) {
      setSnackbar({ message: `Save failed: ${err instanceof Error ? err.message : String(err)}`, severity: 'error' })
    }
  }

  const handleArchive = async () => {
    if (!selectedFile || !ignoreDir || !worldmapsDir) return
    try {
      const destPath = `${ignoreDir}/${selectedFile.name}`
      const exists   = await window.api.exists(destPath)
      if (exists) { setSnackbar({ message: 'An archived world map with this name already exists.', severity: 'error' }); return }
      await window.api.copyFile(selectedFile.path, destPath)
      markClean()
      setSelectedFile(null)
      setEditingMap(null)
      await loadActiveFiles()
      await loadArchivedFiles()
    } catch (err) {
      setSnackbar({ message: `Archive failed: ${err instanceof Error ? err.message : String(err)}`, severity: 'error' })
    }
  }

  const handleUnarchive = async () => {
    if (!selectedFile || !worldmapsDir) return
    try {
      const destPath = `${worldmapsDir}/${selectedFile.name}`
      const exists   = await window.api.exists(destPath)
      if (exists) { setSnackbar({ message: 'An active world map with this name already exists.', severity: 'error' }); return }
      await window.api.copyFile(selectedFile.path, destPath)
      markClean()
      setSelectedFile(null)
      setEditingMap(null)
      await loadActiveFiles()
      await loadArchivedFiles()
    } catch (err) {
      setSnackbar({ message: `Unarchive failed: ${err instanceof Error ? err.message : String(err)}`, severity: 'error' })
    }
  }

  const handleDirtyChange = useCallback((dirty: boolean) => { dirty ? markDirty() : markClean() }, [markDirty, markClean])
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
          <Alert severity="error"><strong>Failed to load world map:</strong> {loadError}</Alert>
        ) : loadingMap ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <CircularProgress size={64} thickness={4} color="info" disableShrink />
          </Box>
        ) : editingMap ? (
          <WorldMapEditorPanel
            worldMap={editingMap}
            initialFileName={selectedFile?.name ?? null}
            isArchived={isArchived}
            isExisting={!!selectedFile}
            mapNames={mapNames}
            onSave={handleSave}
            onArchive={handleArchive}
            onUnarchive={handleUnarchive}
            onDirtyChange={handleDirtyChange}
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
