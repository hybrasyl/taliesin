import React, { useEffect, useMemo, useState } from 'react'
import { Box, Typography, IconButton, Tooltip } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import { staticTilesKind } from '../../packKinds/staticTiles'
import type { PackProject } from '../../packKinds/types'

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
 * art overwrites it); the trash button removes it from the pack.
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
              '&:hover .rm': { opacity: 1 }
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
          </Box>
        ))}
      </Box>
    </Box>
  )
}

export default CommittedTiles
