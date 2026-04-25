import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Tooltip,
  List,
  ListItemButton,
  ListItemText,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import { useRecoilValue } from 'recoil'
import { activeLibraryState } from '../recoil/atoms'
import type { PrefabSummary, Prefab } from '../utils/prefabTypes'

const PrefabCatalogPage: React.FC = () => {
  const activeLibrary = useRecoilValue(activeLibraryState)

  const [prefabs, setPrefabs] = useState<PrefabSummary[]>([])
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [loadedPrefab, setLoadedPrefab] = useState<Prefab | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameName, setRenameName] = useState('')
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)

  const refresh = useCallback(async () => {
    if (!activeLibrary) {
      setPrefabs([])
      return
    }
    const list = await window.api.prefabList(activeLibrary)
    setPrefabs(list.sort((a, b) => a.name.localeCompare(b.name)))
  }, [activeLibrary])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Load selected prefab
  useEffect(() => {
    if (!activeLibrary || !selected) {
      setLoadedPrefab(null)
      return
    }
    window.api
      .prefabLoad(activeLibrary, selected)
      .then((data) => setLoadedPrefab(data as Prefab))
      .catch(() => setLoadedPrefab(null))
  }, [activeLibrary, selected])

  // Render preview
  useEffect(() => {
    const canvas = previewCanvasRef.current
    if (!canvas || !loadedPrefab) return
    const { width: W, height: H, tiles } = loadedPrefab
    const ppt = Math.min(Math.floor(400 / Math.max(W, H)), 20)
    canvas.width = W * ppt
    canvas.height = H * ppt
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = tiles[y * W + x]
        if (!t) continue
        if (t.background > 0) {
          const h = (t.background * 137) % 360
          ctx.fillStyle = `hsl(${h}, 40%, 30%)`
          ctx.fillRect(x * ppt, y * ppt, ppt, ppt)
        }
        if (t.leftForeground > 0) {
          const h = (t.leftForeground * 97) % 360
          ctx.fillStyle = `hsla(${h}, 50%, 45%, 0.7)`
          ctx.fillRect(x * ppt, y * ppt, ppt / 2, ppt)
        }
        if (t.rightForeground > 0) {
          const h = (t.rightForeground * 97) % 360
          ctx.fillStyle = `hsla(${h}, 50%, 45%, 0.7)`
          ctx.fillRect(x * ppt + ppt / 2, y * ppt, ppt / 2, ppt)
        }
      }
    }

    if (ppt >= 4) {
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'
      ctx.lineWidth = 0.5
      for (let x = 0; x <= W; x++) {
        ctx.beginPath()
        ctx.moveTo(x * ppt, 0)
        ctx.lineTo(x * ppt, H * ppt)
        ctx.stroke()
      }
      for (let y = 0; y <= H; y++) {
        ctx.beginPath()
        ctx.moveTo(0, y * ppt)
        ctx.lineTo(W * ppt, y * ppt)
        ctx.stroke()
      }
    }
  }, [loadedPrefab])

  const handleDelete = useCallback(async () => {
    if (!activeLibrary || !selected) return
    await window.api.prefabDelete(activeLibrary, selected)
    setSelected(null)
    setLoadedPrefab(null)
    refresh()
  }, [activeLibrary, selected, refresh])

  const handleRename = useCallback(async () => {
    if (!activeLibrary || !selected || !loadedPrefab || !renameName.trim()) return
    const newFilename = renameName.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') + '.json'
    const updated = {
      ...loadedPrefab,
      name: renameName.trim(),
      updatedAt: new Date().toISOString()
    }
    await window.api.prefabSave(activeLibrary, newFilename, updated)
    if (newFilename !== selected) {
      await window.api.prefabDelete(activeLibrary, selected)
    }
    setRenameOpen(false)
    setSelected(newFilename)
    refresh()
  }, [activeLibrary, selected, loadedPrefab, renameName, refresh])

  const filtered = filter.trim()
    ? prefabs.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : prefabs

  const selectedSummary = prefabs.find((p) => p.filename === selected)

  if (!activeLibrary) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography variant="h5" gutterBottom sx={{ color: 'text.button', fontWeight: 'bold' }}>
          Prefab Catalog
        </Typography>
        <Typography color="text.secondary">No library selected. Set one in Settings.</Typography>
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
        <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
          {filtered.length} / {prefabs.length} prefabs
        </Typography>
        <TextField
          size="small"
          placeholder="Filter..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          sx={{ width: 260 }}
        />
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={refresh}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: list */}
        <Box
          sx={{
            width: 300,
            flexShrink: 0,
            overflow: 'auto',
            borderRight: '1px solid',
            borderColor: 'divider'
          }}
        >
          <List dense disablePadding>
            {filtered.map((p) => (
              <ListItemButton
                key={p.filename}
                selected={selected === p.filename}
                onClick={() => setSelected(p.filename)}
              >
                <ListItemText
                  primary={p.name}
                  secondary={`${p.width}×${p.height}`}
                  primaryTypographyProps={{ noWrap: true }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </ListItemButton>
            ))}
          </List>
        </Box>

        {/* Right: detail */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {!loadedPrefab ? (
            <Box sx={{ p: 3 }}>
              <Typography color="text.disabled">Select a prefab to view details.</Typography>
            </Box>
          ) : (
            <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography variant="h6">{loadedPrefab.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {loadedPrefab.width}×{loadedPrefab.height} tiles · {selectedSummary?.filename}
                </Typography>
              </Box>

              <canvas
                ref={previewCanvasRef}
                style={{ imageRendering: 'pixelated', maxWidth: '100%', alignSelf: 'flex-start' }}
              />

              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Created:{' '}
                  {loadedPrefab.createdAt ? new Date(loadedPrefab.createdAt).toLocaleString() : '—'}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Updated:{' '}
                  {loadedPrefab.updatedAt ? new Date(loadedPrefab.updatedAt).toLocaleString() : '—'}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  startIcon={<EditIcon />}
                  onClick={() => {
                    setRenameName(loadedPrefab.name)
                    setRenameOpen(true)
                  }}
                >
                  Rename
                </Button>
                <Button
                  size="small"
                  startIcon={<DeleteIcon />}
                  color="error"
                  onClick={handleDelete}
                >
                  Delete
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Rename Prefab</DialogTitle>
        <DialogContent>
          <TextField
            label="New Name"
            size="small"
            fullWidth
            autoFocus
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename()
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleRename} disabled={!renameName.trim()}>
            Rename
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default PrefabCatalogPage
