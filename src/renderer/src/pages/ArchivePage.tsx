import React, { useState, useCallback, useMemo, useEffect } from 'react'
import {
  Box, Typography, TextField, Button, CircularProgress,
  Divider, Tooltip, FormControl, InputLabel, Select, MenuItem,
  type SelectChangeEvent,
} from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import { DataArchive, type DataArchiveEntry } from '@eriscorp/dalib-ts'
import { useRecoilValue } from 'recoil'
import { clientPathState } from '../recoil/atoms'
import ArchiveEntryList from '../components/archive/ArchiveEntryList'
import ArchivePreview from '../components/archive/ArchivePreview'

const ArchivePage: React.FC = () => {
  const clientPath = useRecoilValue(clientPathState)

  const [archivePath, setArchivePath] = useState<string | null>(null)
  const [archive, setArchive]         = useState<DataArchive | null>(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [filter, setFilter]           = useState('')
  const [selected, setSelected]       = useState<DataArchiveEntry | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const [extracting, setExtracting] = useState(false)

  // Discovered .dat files inside `clientPath` (top level + one subfolder deep).
  // Stored as relative paths so `npc/npc.dat` and `legend.dat` are distinguishable.
  const [datFiles, setDatFiles] = useState<string[]>([])

  const entries = useMemo(() => archive?.entries ?? [], [archive])

  const archiveName = useMemo(() => {
    if (!archivePath) return null
    const parts = archivePath.replace(/\\/g, '/').split('/')
    return parts[parts.length - 1] ?? archivePath
  }, [archivePath])

  const loadArchive = useCallback(async (filePath: string) => {
    setLoading(true)
    setError(null)
    setSelected(null)
    setFilter('')
    setExpandedGroups(new Set())

    try {
      const buf = await window.api.readFile(filePath)
      const arc = DataArchive.fromBuffer(new Uint8Array(buf))
      setArchive(arc)
      setArchivePath(filePath)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open archive')
      setArchive(null)
      setArchivePath(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleOpenFile = useCallback(async () => {
    const path = await window.api.openFile([
      { name: 'DA Archives', extensions: ['dat'] },
    ])
    if (path) loadArchive(path)
  }, [loadArchive])

  const handleQuickOpen = useCallback((relPath: string) => {
    if (!clientPath || !relPath) return
    const sep = clientPath.includes('\\') ? '\\' : '/'
    const normalized = relPath.replace(/\//g, sep)
    loadArchive(`${clientPath}${sep}${normalized}`)
  }, [clientPath, loadArchive])

  // Scan the client folder for .dat files (top level + one level of subfolders).
  // npc.dat lives under client/npc/, so we recurse one level deep.
  useEffect(() => {
    let cancelled = false
    if (!clientPath) { setDatFiles([]); return }
    ;(async () => {
      try {
        const top = await window.api.listDir(clientPath)
        const found: string[] = []
        const subdirs: string[] = []
        for (const entry of top) {
          if (entry.isDirectory) subdirs.push(entry.name)
          else if (entry.name.toLowerCase().endsWith('.dat')) found.push(entry.name)
        }
        const sep = clientPath.includes('\\') ? '\\' : '/'
        for (const sub of subdirs) {
          try {
            const inner = await window.api.listDir(`${clientPath}${sep}${sub}`)
            for (const e of inner) {
              if (!e.isDirectory && e.name.toLowerCase().endsWith('.dat')) {
                found.push(`${sub}/${e.name}`)
              }
            }
          } catch {
            // ignore unreadable subfolders
          }
        }
        if (!cancelled) setDatFiles(found.sort((a, b) => a.localeCompare(b)))
      } catch {
        if (!cancelled) setDatFiles([])
      }
    })()
    return () => { cancelled = true }
  }, [clientPath])

  const handleToggleGroup = useCallback((ext: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(ext)) next.delete(ext)
      else next.add(ext)
      return next
    })
  }, [])

  const handleExtractAll = useCallback(async () => {
    if (!archive) return
    const dir = await window.api.openDirectory()
    if (!dir) return
    setExtracting(true)
    try {
      for (const entry of archive.entries) {
        const buf = entry.toUint8Array()
        await window.api.writeBytes(`${dir}/${entry.entryName}`, buf)
      }
    } finally {
      setExtracting(false)
    }
  }, [archive])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <Box sx={{
        px: 2, py: 1,
        display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
        borderBottom: '1px solid', borderColor: 'divider',
      }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<FolderOpenIcon />}
          onClick={handleOpenFile}
          disabled={loading}
        >
          Open Archive
        </Button>

        {/* Client-folder dat picker */}
        {clientPath && datFiles.length > 0 && (
          <>
            <Divider orientation="vertical" flexItem />
            <FormControl size="small" sx={{ minWidth: 200 }} disabled={loading}>
              <InputLabel id="client-dat-select-label">Client archives</InputLabel>
              <Select
                labelId="client-dat-select-label"
                label="Client archives"
                value=""
                onChange={(e: SelectChangeEvent<string>) => handleQuickOpen(e.target.value)}
              >
                {datFiles.map(rel => (
                  <MenuItem key={rel} value={rel}>{rel}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </>
        )}

        {archiveName && (
          <>
            <Divider orientation="vertical" flexItem />
            <Typography variant="body2" color="text.secondary" noWrap sx={{ flexShrink: 0 }}>
              {archiveName}
            </Typography>
            <Typography variant="caption" color="text.disabled">
              {entries.length} entries
            </Typography>
            <Tooltip title="Extract All to Directory">
              <Button
                size="small"
                variant="outlined"
                startIcon={extracting ? <CircularProgress size={14} /> : <SaveAltIcon />}
                onClick={handleExtractAll}
                disabled={extracting}
                sx={{ ml: 1 }}
              >
                {extracting ? 'Extracting...' : 'Extract All'}
              </Button>
            </Tooltip>
          </>
        )}
      </Box>

      {/* Search bar */}
      {archive && (
        <Box sx={{ px: 2, py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
          <TextField
            size="small"
            placeholder="Filter entries…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            fullWidth
          />
        </Box>
      )}

      {/* Body */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {loading && (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <CircularProgress size={20} />
            <Typography color="text.secondary">Loading archive…</Typography>
          </Box>
        )}

        {error && (
          <Box sx={{ flex: 1, p: 4 }}>
            <Typography color="error">{error}</Typography>
          </Box>
        )}

        {!loading && !error && !archive && (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography color="text.secondary">
              {clientPath
                ? 'Open a .dat archive or pick one from the client archives dropdown.'
                : 'Open a .dat archive to browse its contents. Set a client path in Settings to pick from your client folder.'}
            </Typography>
          </Box>
        )}

        {!loading && !error && archive && (
          <>
            {/* Left: entry list */}
            <Box sx={{ width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid', borderColor: 'divider' }}>
              <ArchiveEntryList
                entries={entries}
                filter={filter}
                selected={selected}
                expandedGroups={expandedGroups}
                onSelect={setSelected}
                onToggleGroup={handleToggleGroup}
              />
            </Box>

            {/* Right: preview */}
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
              {selected ? (
                <ArchivePreview entry={selected} archive={archive} />
              ) : (
                <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography color="text.disabled">Select an entry to preview.</Typography>
                </Box>
              )}
            </Box>
          </>
        )}
      </Box>
    </Box>
  )
}

export default ArchivePage
