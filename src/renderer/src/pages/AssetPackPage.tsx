import React, { useState, useCallback, useEffect } from 'react'
import {
  Box,
  Typography,
  Button,
  IconButton,
  Tooltip,
  List,
  ListItemButton,
  ListItemText
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import RefreshIcon from '@mui/icons-material/Refresh'
import ArchiveIcon from '@mui/icons-material/Archive'
import { useSettingsStore } from '../store/settingsStore'
import { useUiStore } from '../store/uiStore'
import { brigidAssetsDir } from '../utils/pickerDefaults'
import PackEditor from '../components/assetpack/PackEditor'
import CreatePackDialog from '../components/assetpack/CreatePackDialog'
import { getKind, isKnownContentType } from '../packKinds'
import type { ContentType, PackProject } from '../packKinds'
import { useTransientStatus } from '../hooks/useTransientStatus'
import { StatusMessage } from '../components/shared/StatusMessage'
import { EmptyStateSettings } from '../components/shared/EmptyStateSettings'
import { WorkingDirToolbar } from '../components/shared/WorkingDirToolbar'

interface PackSummary {
  filename: string
  pack_id: string
  pack_version: string
  content_type: string
  assets?: { filename: string; sourcePath: string }[]
}

const AssetPackPage: React.FC = () => {
  const packDir = useSettingsStore((s) => s.packDir)
  const setPackDir = useSettingsStore((s) => s.setPackDir)
  const [packs, setPacks] = useState<PackSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loadedPack, setLoadedPack] = useState<PackProject | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [statusMessage, showStatus] = useTransientStatus()

  // Scan packs
  const refresh = useCallback(async () => {
    if (!packDir) {
      setPacks([])
      return
    }
    const list = (await window.api.packScan(packDir)) as PackSummary[]
    setPacks(list.sort((a, b) => a.pack_id.localeCompare(b.pack_id)))
  }, [packDir])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Load selected pack
  useEffect(() => {
    if (!packDir || !selected) {
      setLoadedPack(null)
      return
    }
    window.api
      .packLoad(`${packDir}/${selected}`)
      .then((data) => {
        const raw = data as { content_type: string } & Omit<PackProject, 'content_type'>
        if (!isKnownContentType(raw.content_type)) {
          showStatus(`Unknown content_type: ${raw.content_type}`)
          setLoadedPack(null)
          return
        }
        setLoadedPack(raw as PackProject)
      })
      .catch(() => setLoadedPack(null))
  }, [packDir, selected, showStatus])

  // Set working directory
  const handleSetDir = useCallback(async () => {
    const dir = await window.api.openDirectory()
    if (dir) setPackDir(dir)
  }, [setPackDir])

  // Create pack
  const handleCreate = useCallback(
    async (packId: string, contentType: ContentType, version: string) => {
      if (!packDir) return
      const project: PackProject = {
        pack_id: packId,
        pack_version: version,
        content_type: contentType,
        priority: 100,
        covers: getKind(contentType).defaultCovers(),
        assets: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      const filename = `${packId}.json`
      await window.api.packSave(`${packDir}/${filename}`, project)
      await window.api.ensureDir(`${packDir}/${packId}`)
      showStatus(`Created pack: ${packId}`)
      refresh()
      setSelected(filename)
    },
    [packDir, refresh, showStatus]
  )

  // Import a .datf — extract into packDir/<pack_id>/, write the project json,
  // refresh the list, and select the new pack.
  const handleImport = useCallback(async () => {
    if (!packDir) return
    const datfPath = await window.api.openFile(
      [{ name: 'DATF Asset Pack', extensions: ['datf'] }],
      brigidAssetsDir()
    )
    if (!datfPath) return
    try {
      const result = await window.api.packImport(datfPath, packDir)
      const msg =
        result.warnings.length > 0
          ? `Imported ${result.projectFilename} (${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'})`
          : `Imported ${result.projectFilename}`
      showStatus(msg)
      await refresh()
      setSelected(result.projectFilename)
    } catch (e) {
      showStatus(`Import failed: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }, [packDir, refresh, showStatus])

  // Delete pack
  const handleDelete = useCallback(async () => {
    if (!packDir || !selected) return
    await window.api.packDelete(`${packDir}/${selected}`)
    setSelected(null)
    setLoadedPack(null)
    showStatus('Pack deleted')
    refresh()
  }, [packDir, selected, refresh, showStatus])

  // Pack save callback
  const handlePackSave = useCallback(
    (updated: PackProject) => {
      setLoadedPack(updated)
      refresh()
    },
    [refresh]
  )

  // Derive pack assets directory
  const packAssetsDir = loadedPack && packDir ? `${packDir}/${loadedPack.pack_id}` : null

  const setCurrentPage = useUiStore((s) => s.setCurrentPage)

  if (!packDir) {
    return (
      <EmptyStateSettings
        title="Asset Pack Manager"
        description="Set a working directory in Settings to manage .datf asset packs."
        onOpenSettings={() => setCurrentPage('settings')}
      />
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WorkingDirToolbar dir={packDir} onChangeDir={handleSetDir}>
        <StatusMessage message={statusMessage} />
        <Typography
          variant="caption"
          sx={{
            color: 'text.disabled'
          }}
        >
          {packs.length} pack{packs.length !== 1 ? 's' : ''}
        </Typography>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={refresh}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </WorkingDirToolbar>
      {/* Body */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: pack list */}
        <Box
          sx={{
            width: 260,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid',
            borderColor: 'divider'
          }}
        >
          <Box sx={{ px: 1, py: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setCreateOpen(true)}
              fullWidth
            >
              New Pack
            </Button>
            <Button
              size="small"
              startIcon={<ArchiveIcon />}
              onClick={handleImport}
              fullWidth
              variant="outlined"
            >
              Import .datf
            </Button>
          </Box>
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <List dense disablePadding>
              {packs.map((p) => (
                <ListItemButton
                  key={p.filename}
                  selected={selected === p.filename}
                  onClick={() => setSelected(p.filename)}
                >
                  <ListItemText
                    primary={p.pack_id}
                    secondary={`${p.content_type} · v${p.pack_version}`}
                    slotProps={{
                      primary: { variant: 'body2', noWrap: true },
                      secondary: { variant: 'caption' }
                    }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Box>
          {selected && (
            <Box sx={{ p: 1, borderTop: '1px solid', borderColor: 'divider' }}>
              <Button
                size="small"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={handleDelete}
                fullWidth
              >
                Delete Pack
              </Button>
            </Box>
          )}
        </Box>

        {/* Right: pack editor */}
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          {loadedPack && packAssetsDir ? (
            <PackEditor
              pack={loadedPack}
              packDir={packAssetsDir}
              packFilePath={`${packDir}/${selected}`}
              onSave={handlePackSave}
              onStatus={showStatus}
            />
          ) : (
            <Box
              sx={{
                p: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%'
              }}
            >
              <Typography
                sx={{
                  color: 'text.disabled'
                }}
              >
                Select a pack to edit, or create a new one.
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
      {/* Dialogs */}
      <CreatePackDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
    </Box>
  )
}

export default AssetPackPage
