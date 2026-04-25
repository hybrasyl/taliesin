import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Tooltip,
  List,
  ListItemButton,
  ListItemText,
  Divider,
  Button
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import DeleteIcon from '@mui/icons-material/Delete'
import type { PrefabSummary, Prefab } from '../../utils/prefabTypes'

interface Props {
  libraryPath: string | null
  onStampPrefab: (prefab: Prefab) => void
  onStatus: (msg: string) => void
}

const PrefabSidebar: React.FC<Props> = ({ libraryPath, onStampPrefab, onStatus }) => {
  const [prefabs, setPrefabs] = useState<PrefabSummary[]>([])
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [loadedPrefab, setLoadedPrefab] = useState<Prefab | null>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)

  // Load prefab list
  const refresh = useCallback(async () => {
    if (!libraryPath) {
      setPrefabs([])
      return
    }
    const list = await window.api.prefabList(libraryPath)
    setPrefabs(list.sort((a, b) => a.name.localeCompare(b.name)))
  }, [libraryPath])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Load selected prefab
  useEffect(() => {
    if (!libraryPath || !selected) {
      setLoadedPrefab(null)
      return
    }
    window.api
      .prefabLoad(libraryPath, selected)
      .then((data) => setLoadedPrefab(data as Prefab))
      .catch(() => setLoadedPrefab(null))
  }, [libraryPath, selected])

  // Render preview
  useEffect(() => {
    const canvas = previewCanvasRef.current
    if (!canvas || !loadedPrefab) return
    const { width: W, height: H, tiles } = loadedPrefab
    const ppt = Math.min(Math.floor(240 / Math.max(W, H)), 16)
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

    // Grid
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
    if (!libraryPath || !selected) return
    await window.api.prefabDelete(libraryPath, selected)
    setSelected(null)
    setLoadedPrefab(null)
    onStatus('Prefab deleted')
    refresh()
  }, [libraryPath, selected, onStatus, refresh])

  const handleStamp = useCallback(() => {
    if (loadedPrefab) onStampPrefab(loadedPrefab)
  }, [loadedPrefab, onStampPrefab])

  const filtered = filter.trim()
    ? prefabs.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : prefabs

  if (!libraryPath) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="caption" color="text.disabled">
          Set a library in Settings to use prefabs.
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box sx={{ px: 1, pt: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 'bold', flex: 1 }}>
          Prefabs
        </Typography>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={refresh}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Search */}
      <Box sx={{ px: 1, py: 0.5 }}>
        <TextField
          size="small"
          placeholder="Filter..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          fullWidth
        />
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
        {filtered.length} prefab{filtered.length !== 1 ? 's' : ''}
      </Typography>

      {/* List */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
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
                primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                secondaryTypographyProps={{ variant: 'caption' }}
              />
            </ListItemButton>
          ))}
        </List>
      </Box>

      {/* Preview + actions */}
      {loadedPrefab && (
        <>
          <Divider />
          <Box
            sx={{ p: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}
          >
            <canvas
              ref={previewCanvasRef}
              style={{ imageRendering: 'pixelated', maxWidth: '100%' }}
            />
            <Typography variant="caption" color="text.secondary">
              {loadedPrefab.width}×{loadedPrefab.height} · {loadedPrefab.name}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button size="small" variant="contained" onClick={handleStamp}>
                Stamp (P)
              </Button>
              <Tooltip title="Delete prefab">
                <IconButton size="small" onClick={handleDelete} sx={{ color: 'error.main' }}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </>
      )}
    </Box>
  )
}

export default PrefabSidebar
