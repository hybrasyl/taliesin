import React, { useState, useCallback, useMemo } from 'react'
import {
  Box, Typography, TextField, Button, CircularProgress,
  Divider, Chip, Tooltip,
} from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import { DataArchive, type DataArchiveEntry } from '@eriscorp/dalib-ts'
import { useRecoilValue } from 'recoil'
import { clientPathState } from '../recoil/atoms'
import ArchiveEntryList from '../components/archive/ArchiveEntryList'
import ArchivePreview from '../components/archive/ArchivePreview'

// Known client archives for quick-open buttons
const KNOWN_ARCHIVES = [
  'legend.dat', 'seo.dat', 'ia.dat', 'hades.dat',
  'setoa.dat', 'national.dat', 'roh.dat', 'misc.dat',
] as const

const ArchivePage: React.FC = () => {
  const clientPath = useRecoilValue(clientPathState)

  const [archivePath, setArchivePath] = useState<string | null>(null)
  const [archive, setArchive]         = useState<DataArchive | null>(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [filter, setFilter]           = useState('')
  const [selected, setSelected]       = useState<DataArchiveEntry | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

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

      // Auto-expand the first group
      if (arc.entries.length > 0) {
        const firstExt = getExt(arc.entries[0])
        setExpandedGroups(new Set([firstExt]))
      }
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

  const handleQuickOpen = useCallback((name: string) => {
    if (!clientPath) return
    const sep = clientPath.includes('\\') ? '\\' : '/'
    loadArchive(`${clientPath}${sep}${name}`)
  }, [clientPath, loadArchive])

  const handleToggleGroup = useCallback((ext: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(ext)) next.delete(ext)
      else next.add(ext)
      return next
    })
  }, [])

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

        {/* Quick-open buttons */}
        {clientPath && (
          <>
            <Divider orientation="vertical" flexItem />
            {KNOWN_ARCHIVES.map(name => (
              <Tooltip key={name} title={`Open ${name}`}>
                <Chip
                  label={name.replace('.dat', '')}
                  size="small"
                  variant="outlined"
                  onClick={() => handleQuickOpen(name)}
                  disabled={loading}
                  sx={{ cursor: 'pointer' }}
                />
              </Tooltip>
            ))}
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
                ? 'Open a .dat archive or use the quick-open buttons above.'
                : 'Open a .dat archive to browse its contents. Set a client path in Settings for quick-open buttons.'}
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function getExt(entry: DataArchiveEntry): string {
  const name = entry.entryName.toLowerCase()
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot) : '(none)'
}

export default ArchivePage
