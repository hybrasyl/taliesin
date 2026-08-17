import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import TagIcon from '@mui/icons-material/Tag'
import { staticTilesKind } from '../../packKinds/staticTiles'
import type { PackProject } from '../../packKinds/types'
import { isCommittableWallId, WALL_ID_MAX } from '../../utils/wallIdAllocator'

interface CommittedTilesProps {
  packDir: string
  packFilename: string
  project: PackProject
  onProjectChange: (p: PackProject) => void
  onEdit: (namespace: 'floor' | 'wall', id: number) => void
  onStatus: (msg: string) => void
}

interface Slot {
  filename: string
  namespace: 'floor' | 'wall'
  id: number
}

/**
 * Gallery of the tiles already committed to the loaded pack. Click a tile to
 * re-target it (the commit panel switches to that id/namespace so importing new
 * art overwrites it); the trash button removes it from the pack, and the number
 * button moves it to a different id.
 *
 * Renumbering matters because for `static_tiles` the filename IS the tile id.
 * A run committed to the wrong number used to mean deleting every tile and
 * converting the art again; now it is a rename of the file and one line of the
 * project.
 */
const CommittedTiles: React.FC<CommittedTilesProps> = ({
  packDir,
  packFilename,
  project,
  onProjectChange,
  onEdit,
  onStatus
}) => {
  const slots = useMemo<Slot[]>(() => {
    const out: Slot[] = []
    for (const a of project.assets) {
      const slot = staticTilesKind.parseSlot?.(a.filename)
      if (slot && (slot.namespace === 'floor' || slot.namespace === 'wall')) {
        out.push({ filename: a.filename, namespace: slot.namespace, id: slot.id })
      }
    }
    return out.sort((a, b) =>
      a.namespace === b.namespace ? a.id - b.id : a.namespace.localeCompare(b.namespace)
    )
  }, [project.assets])

  const assetsDir = `${packDir}/${project.pack_id}`
  const [urls, setUrls] = useState<Record<string, string>>({})

  // Load PNG thumbnails as object URLs; revoke on change/unmount.
  useEffect(() => {
    let live = true
    const created: string[] = []
    ;(async () => {
      const next: Record<string, string> = {}
      for (const s of slots) {
        try {
          const bytes = await window.api.readFile(`${assetsDir}/${s.filename}`)
          const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }))
          created.push(url)
          next[s.filename] = url
        } catch {
          /* skip unreadable */
        }
      }
      if (live) setUrls(next)
      else created.forEach((u) => URL.revokeObjectURL(u))
    })()
    return () => {
      live = false
      created.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [assetsDir, slots])

  const remove = async (s: Slot): Promise<void> => {
    try {
      await window.api.packRemoveAsset(assetsDir, s.filename)
      const updated: PackProject = {
        ...project,
        assets: project.assets.filter((a) => a.filename !== s.filename),
        updatedAt: new Date().toISOString()
      }
      await window.api.packSave(`${packDir}/${packFilename}`, updated)
      onProjectChange(updated)
      onStatus(`Removed ${s.filename}`)
    } catch (e) {
      onStatus(`Remove failed: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  // The tile being renumbered, and the number typed for it.
  const [renaming, setRenaming] = useState<Slot | null>(null)
  const [newIdText, setNewIdText] = useState('')

  const newId = Number.parseInt(newIdText, 10)
  const takenIds = useMemo(
    () => new Set(slots.filter((s) => s.namespace === renaming?.namespace).map((s) => s.id)),
    [slots, renaming]
  )
  const renameError = ((): string | null => {
    if (!renaming) return null
    if (!Number.isInteger(newId) || newId <= 0) return 'Enter a tile number'
    if (newId === renaming.id) return null
    if (takenIds.has(newId)) return `${renaming.namespace} ${newId} is already in this pack`
    if (renaming.namespace === 'wall' && !isCommittableWallId(newId)) {
      return newId > WALL_ID_MAX
        ? `Above ${WALL_ID_MAX}, which crashes map load`
        : 'A sentinel the client never renders'
    }
    return null
  })()

  const commitRename = useCallback(async (): Promise<void> => {
    if (!renaming || renameError) return
    const from = renaming.filename
    const to = `${renaming.namespace}${String(newId).padStart(5, '0')}.png`
    setRenaming(null)
    if (from === to) return
    try {
      // The file moves first. If the project were written first and the move
      // then failed, the pack would name art that is not there.
      await window.api.packRenameAsset(assetsDir, from, to)
      const updated: PackProject = {
        ...project,
        assets: project.assets.map((a) => (a.filename === from ? { ...a, filename: to } : a)),
        updatedAt: new Date().toISOString()
      }
      await window.api.packSave(`${packDir}/${packFilename}`, updated)
      onProjectChange(updated)
      onStatus(`Renumbered ${from} to ${to}`)
    } catch (e) {
      onStatus(`Renumber failed: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }, [
    renaming,
    renameError,
    newId,
    assetsDir,
    project,
    packDir,
    packFilename,
    onProjectChange,
    onStatus
  ])

  if (slots.length === 0) {
    return (
      <Typography variant="caption" color="text.disabled">
        No committed tiles yet.
      </Typography>
    )
  }

  return (
    <Box>
      <Typography variant="overline" color="text.secondary">
        Committed tiles ({slots.length})
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {slots.map((s) => (
          <Box
            key={s.filename}
            sx={{
              position: 'relative',
              border: '1px solid',
              borderColor: 'divider',
              '&:hover .rm, &:hover .renumber': { opacity: 1 }
            }}
          >
            <Tooltip title={`${s.namespace} ${s.id} — click to replace`}>
              <Box
                onClick={() => onEdit(s.namespace, s.id)}
                sx={{ cursor: 'pointer', lineHeight: 0, width: 48, height: 48 }}
              >
                {urls[s.filename] ? (
                  <img
                    src={urls[s.filename]}
                    alt={s.filename}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      imageRendering: 'pixelated',
                      display: 'block'
                    }}
                  />
                ) : (
                  <Box sx={{ width: '100%', height: '100%', bgcolor: 'action.hover' }} />
                )}
              </Box>
            </Tooltip>
            <Box
              sx={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                bgcolor: 'rgba(0,0,0,0.6)',
                color: '#fff',
                fontSize: 8,
                lineHeight: 1.2,
                textAlign: 'center'
              }}
            >
              {s.namespace[0]}
              {s.id}
            </Box>
            <IconButton
              className="rm"
              size="small"
              onClick={() => remove(s)}
              sx={{
                position: 'absolute',
                top: -6,
                right: -6,
                p: 0.2,
                opacity: 0,
                bgcolor: 'error.main',
                color: '#fff',
                '&:hover': { bgcolor: 'error.dark' }
              }}
            >
              <DeleteIcon sx={{ fontSize: 12 }} />
            </IconButton>
            <Tooltip title="Change tile number">
              <IconButton
                className="renumber"
                size="small"
                aria-label={`renumber ${s.filename}`}
                onClick={() => {
                  setRenaming(s)
                  setNewIdText(String(s.id))
                }}
                sx={{
                  position: 'absolute',
                  top: -6,
                  left: -6,
                  p: 0.2,
                  opacity: 0,
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  '&:hover': { bgcolor: 'primary.dark' }
                }}
              >
                <TagIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </Tooltip>
          </Box>
        ))}
      </Box>

      <Dialog open={renaming !== null} onClose={() => setRenaming(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Change tile number</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            type="number"
            label={`${renaming?.namespace ?? ''} tile number`}
            value={newIdText}
            onChange={(e) => setNewIdText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !renameError) commitRename()
            }}
            error={renameError !== null}
            helperText={renameError ?? `Currently ${renaming?.filename ?? ''}`}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenaming(null)}>Cancel</Button>
          <Button variant="contained" disabled={renameError !== null} onClick={commitRename}>
            Renumber
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default CommittedTiles
