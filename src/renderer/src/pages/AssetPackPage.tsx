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
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import SettingsIcon from '@mui/icons-material/Settings'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import RefreshIcon from '@mui/icons-material/Refresh'
import { useRecoilState, useSetRecoilState } from 'recoil'
import { packDirState, currentPageState } from '../recoil/atoms'
import PackEditor from '../components/assetpack/PackEditor'
import CreatePackDialog from '../components/assetpack/CreatePackDialog'

interface PackSummary {
  filename: string
  pack_id: string
  pack_version: string
  content_type: string
  assets?: { filename: string; sourcePath: string }[]
}

interface PackProject {
  pack_id: string
  pack_version: string
  content_type: string
  priority: number
  covers: Record<string, unknown>
  assets: { filename: string; sourcePath: string }[]
  createdAt: string
  updatedAt: string
}

const DEFAULT_COVERS: Record<string, Record<string, unknown>> = {
  ability_icons: { skill_icons: { dimensions: [32, 32] }, spell_icons: { dimensions: [32, 32] } },
  nation_badges: { nation_badges: {} }
}

const AssetPackPage: React.FC = () => {
  const [packDir, setPackDir] = useRecoilState(packDirState)
  const [packs, setPacks] = useState<PackSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loadedPack, setLoadedPack] = useState<PackProject | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const showStatus = useCallback((msg: string) => {
    setStatusMessage(msg)
    setTimeout(() => setStatusMessage(null), 2500)
  }, [])

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
      .then((data) => setLoadedPack(data as PackProject))
      .catch(() => setLoadedPack(null))
  }, [packDir, selected])

  // Set working directory
  const handleSetDir = useCallback(async () => {
    const dir = await window.api.openDirectory()
    if (dir) setPackDir(dir)
  }, [setPackDir])

  // Create pack
  const handleCreate = useCallback(
    async (packId: string, contentType: string, version: string) => {
      if (!packDir) return
      const project: PackProject = {
        pack_id: packId,
        pack_version: version,
        content_type: contentType,
        priority: 100,
        covers: DEFAULT_COVERS[contentType] ?? {},
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

  const setCurrentPage = useSetRecoilState(currentPageState)

  if (!packDir) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h5" gutterBottom sx={{ color: 'text.button', fontWeight: 'bold' }}>
          Asset Pack Manager
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Set a working directory in Settings to manage .datf asset packs.
        </Typography>
        <Button
          variant="outlined"
          startIcon={<SettingsIcon />}
          onClick={() => setCurrentPage('settings')}
        >
          Open Settings
        </Button>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <Box
        sx={{
          px: 2,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          borderBottom: '1px solid',
          borderColor: 'divider'
        }}
      >
        <Tooltip title="Change working directory">
          <IconButton size="small" onClick={handleSetDir}>
            <FolderOpenIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1 }}>
          {packDir}
        </Typography>
        {statusMessage && (
          <Typography variant="caption" sx={{ color: 'success.light', fontWeight: 'bold' }}>
            {statusMessage}
          </Typography>
        )}
        <Typography variant="caption" color="text.disabled">
          {packs.length} pack{packs.length !== 1 ? 's' : ''}
        </Typography>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={refresh}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

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
          <Box sx={{ px: 1, py: 1, display: 'flex', gap: 1 }}>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setCreateOpen(true)}
              fullWidth
            >
              New Pack
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
                    primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                    secondaryTypographyProps={{ variant: 'caption' }}
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
              <Typography color="text.disabled">
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
