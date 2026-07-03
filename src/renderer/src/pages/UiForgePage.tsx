import React, { useState, useCallback, useEffect, useMemo } from 'react'
import {
  Box,
  Typography,
  Button,
  IconButton,
  Tooltip,
  List,
  ListItemButton,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import RefreshIcon from '@mui/icons-material/Refresh'
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize'
import { useSettingsStore } from '../store/settingsStore'
import { useUiStore } from '../store/uiStore'
import { getKind } from '../packKinds'
import type { PackProject } from '../packKinds'
import { useTransientStatus } from '../hooks/useTransientStatus'
import { StatusMessage } from '../components/shared/StatusMessage'
import { EmptyStateSettings } from '../components/shared/EmptyStateSettings'
import { WorkingDirToolbar } from '../components/shared/WorkingDirToolbar'
import { createEmptyLayout, UI_NAME_RE } from '../uiforge/types'
import { serializePanelXml } from '../uiforge/panelXml'
import ForgePanel from '../components/uiforge/ForgePanel'

interface PackSummary {
  filename: string
  pack_id: string
  pack_version: string
  content_type: string
}

const LAYOUT_RE = /^([a-z0-9_]+)\.xml$/

/** Panel ids present in a project, from its {panel_id}.xml assets. */
function panelIdsOf(project: PackProject): string[] {
  return project.assets
    .map((a) => LAYOUT_RE.exec(a.filename)?.[1])
    .filter((id): id is string => !!id)
    .sort()
}

const UiForgePage: React.FC = () => {
  const packDir = useSettingsStore((s) => s.packDir)
  const setPackDir = useSettingsStore((s) => s.setPackDir)
  const setCurrentPage = useUiStore((s) => s.setCurrentPage)
  const [packs, setPacks] = useState<PackSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [project, setProject] = useState<PackProject | null>(null)
  const [selectedPanel, setSelectedPanel] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newPackId, setNewPackId] = useState('')
  const [newPanelOpen, setNewPanelOpen] = useState(false)
  const [newPanelId, setNewPanelId] = useState('')
  const [statusMessage, showStatus] = useTransientStatus()

  const refresh = useCallback(async () => {
    if (!packDir) {
      setPacks([])
      return
    }
    const list = (await window.api.packScan(packDir)) as PackSummary[]
    setPacks(
      list
        .filter((p) => p.content_type === 'ui_panels')
        .sort((a, b) => a.pack_id.localeCompare(b.pack_id))
    )
  }, [packDir])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!packDir || !selected) {
      setProject(null)
      setSelectedPanel(null)
      return
    }
    window.api
      .packLoad(`${packDir}/${selected}`)
      .then((data) => {
        const p = data as PackProject
        setProject(p)
        setSelectedPanel((prev) => {
          const ids = panelIdsOf(p)
          return prev && ids.includes(prev) ? prev : (ids[0] ?? null)
        })
      })
      .catch(() => setProject(null))
  }, [packDir, selected])

  const panelIds = useMemo(() => (project ? panelIdsOf(project) : []), [project])
  const projectFilePath = packDir && selected ? `${packDir}/${selected}` : null
  const projectAssetsDir = packDir && project ? `${packDir}/${project.pack_id}` : null

  const handleSetDir = useCallback(async () => {
    const dir = await window.api.openDirectory()
    if (dir) setPackDir(dir)
  }, [setPackDir])

  const handleCreatePack = useCallback(async () => {
    const packId = newPackId.trim()
    if (!packDir || !packId) return
    const proj: PackProject = {
      pack_id: packId,
      pack_version: '0.1.0',
      content_type: 'ui_panels',
      priority: 100,
      covers: getKind('ui_panels').defaultCovers(),
      assets: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    const filename = `${packId}.json`
    await window.api.packSave(`${packDir}/${filename}`, proj)
    await window.api.ensureDir(`${packDir}/${packId}`)
    setCreateOpen(false)
    setNewPackId('')
    showStatus(`Created pack: ${packId}`)
    await refresh()
    setSelected(filename)
  }, [packDir, newPackId, refresh, showStatus])

  const handleDeletePack = useCallback(async () => {
    if (!packDir || !selected) return
    await window.api.packDelete(`${packDir}/${selected}`)
    setSelected(null)
    setProject(null)
    showStatus('Pack deleted')
    refresh()
  }, [packDir, selected, refresh, showStatus])

  /** Persist a project mutation (asset list / covers changes). */
  const saveProject = useCallback(
    async (updated: PackProject) => {
      if (!projectFilePath) return
      const kind = getKind('ui_panels')
      const withCovers: PackProject = {
        ...updated,
        covers: kind.reduceCoversFromMeta?.(updated) ?? updated.covers,
        updatedAt: new Date().toISOString()
      }
      await window.api.packSave(projectFilePath, withCovers)
      setProject(withCovers)
    },
    [projectFilePath]
  )

  const handleCreatePanel = useCallback(async () => {
    const panelId = newPanelId.trim()
    if (!project || !projectAssetsDir || !panelId) return
    if (!UI_NAME_RE.test(panelId)) {
      showStatus('Panel id must be lowercase letters, digits, and underscores')
      return
    }
    if (panelIds.includes(panelId)) {
      showStatus(`Panel "${panelId}" already exists`)
      return
    }
    const filename = `${panelId}.xml`
    const xml = serializePanelXml(createEmptyLayout(panelId))
    await window.api.ensureDir(projectAssetsDir)
    await window.api.writeFile(`${projectAssetsDir}/${filename}`, xml)
    await saveProject({
      ...project,
      assets: [...project.assets, { filename, sourcePath: `${projectAssetsDir}/${filename}` }]
    })
    setNewPanelOpen(false)
    setNewPanelId('')
    setSelectedPanel(panelId)
    showStatus(`Created panel: ${panelId}`)
  }, [project, projectAssetsDir, newPanelId, panelIds, saveProject, showStatus])

  const handleDeletePanel = useCallback(
    async (panelId: string) => {
      if (!project || !projectAssetsDir) return
      // Remove the layout XML and its convention-named art from disk + project.
      const artRe = new RegExp(`^${panelId}(_[a-z0-9_]+)?_(bg|normal|pressed|disabled)\\.png$`)
      const doomed = project.assets.filter(
        (a) => a.filename === `${panelId}.xml` || artRe.test(a.filename)
      )
      for (const a of doomed) {
        await window.api.packRemoveAsset(projectAssetsDir, a.filename)
      }
      await saveProject({
        ...project,
        assets: project.assets.filter((a) => !doomed.includes(a))
      })
      if (selectedPanel === panelId) setSelectedPanel(null)
      showStatus(`Deleted panel: ${panelId}`)
    },
    [project, projectAssetsDir, selectedPanel, saveProject, showStatus]
  )

  if (!packDir) {
    return (
      <EmptyStateSettings
        title="UI Layout Forge"
        description="Set a pack working directory in Settings to author ui_panels layout packs."
        onOpenSettings={() => setCurrentPage('settings')}
      />
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WorkingDirToolbar dir={packDir} onChangeDir={handleSetDir}>
        <StatusMessage message={statusMessage} />
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
          {packs.length} layout pack{packs.length !== 1 ? 's' : ''}
        </Typography>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={refresh}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </WorkingDirToolbar>

      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: packs + panels */}
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
          <Box sx={{ px: 1, py: 1 }}>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setCreateOpen(true)}
              fullWidth
            >
              New Layout Pack
            </Button>
          </Box>
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <List dense disablePadding>
              {packs.map((p) => (
                <React.Fragment key={p.filename}>
                  <ListItemButton
                    selected={selected === p.filename}
                    onClick={() => setSelected(p.filename)}
                  >
                    <ListItemText
                      primary={p.pack_id}
                      secondary={`v${p.pack_version}`}
                      slotProps={{
                        primary: { variant: 'body2', noWrap: true },
                        secondary: { variant: 'caption' }
                      }}
                    />
                  </ListItemButton>
                  {selected === p.filename && project && (
                    <Box sx={{ pl: 2 }}>
                      {panelIds.map((id) => (
                        <ListItemButton
                          key={id}
                          dense
                          selected={selectedPanel === id}
                          onClick={() => setSelectedPanel(id)}
                          sx={{ py: 0.25 }}
                        >
                          <DashboardCustomizeIcon
                            sx={{ fontSize: 14, mr: 1, color: 'text.disabled' }}
                          />
                          <ListItemText
                            primary={id}
                            slotProps={{ primary: { variant: 'caption', noWrap: true } }}
                          />
                          <Tooltip title="Delete panel">
                            <IconButton
                              size="small"
                              edge="end"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeletePanel(id)
                              }}
                            >
                              <DeleteIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        </ListItemButton>
                      ))}
                      <Button
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={() => setNewPanelOpen(true)}
                        sx={{ ml: 1, my: 0.5 }}
                      >
                        New Panel
                      </Button>
                    </Box>
                  )}
                </React.Fragment>
              ))}
            </List>
          </Box>
          {selected && (
            <Box sx={{ p: 1, borderTop: '1px solid', borderColor: 'divider' }}>
              <Button
                size="small"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={handleDeletePack}
                fullWidth
              >
                Delete Pack
              </Button>
            </Box>
          )}
        </Box>

        {/* Right: forge editor */}
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          {project && projectAssetsDir && projectFilePath && selectedPanel ? (
            <ForgePanel
              key={`${project.pack_id}/${selectedPanel}`}
              project={project}
              projectAssetsDir={projectAssetsDir}
              projectFilePath={projectFilePath}
              panelId={selectedPanel}
              onProjectChange={saveProject}
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
              <Typography sx={{ color: 'text.disabled' }}>
                {project
                  ? 'Create or select a panel to edit its layout.'
                  : 'Select a layout pack, or create a new one.'}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* New pack dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New UI layout pack</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            margin="dense"
            label="Pack id"
            helperText="e.g. hybui-extstats — becomes the .datf filename"
            value={newPackId}
            onChange={(e) => setNewPackId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreatePack()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!newPackId.trim()} onClick={handleCreatePack}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* New panel dialog */}
      <Dialog open={newPanelOpen} onClose={() => setNewPanelOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New panel</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            margin="dense"
            label="Panel id"
            helperText="Lowercase letters, digits, underscores — e.g. extstats"
            value={newPanelId}
            onChange={(e) => setNewPanelId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreatePanel()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewPanelOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!newPanelId.trim()} onClick={handleCreatePanel}>
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default UiForgePage
