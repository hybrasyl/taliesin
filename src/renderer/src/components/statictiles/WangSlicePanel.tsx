import React, { useCallback, useMemo, useState } from 'react'
import {
  Box,
  Typography,
  Button,
  TextField,
  MenuItem,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Checkbox,
  Chip
} from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import { PixelBuffer } from '../../utils/duotone'
import { pixelBufferToPngBytes } from '../../utils/imageLoader'
import { convertOrthoTile, TileScale } from '../../utils/tileConvert'
import { sliceGrid } from '../../utils/gridSlice'
import { WANG_SCHEMES, WangSchemeId, getWangScheme, describeMask } from '../../utils/wangSlicer'
import { buildWangSidecar, wangSidecarFilename, WangAssignment } from '../../utils/wangSidecar'
import {
  checkTileEligibility,
  describeIneligibility,
  type EligibilityAssets
} from '../../utils/tileEligibility'
import { staticTilesKind } from '../../packKinds/staticTiles'
import { nextSlotId } from '../../packKinds/helpers'
import type { PackProject, PackAsset } from '../../packKinds/types'

interface WangSlicePanelProps {
  source: PixelBuffer
  scale: TileScale
  packDir: string | null
  packFilename: string
  project: PackProject | null
  /** Loaded legacy tables for render-eligibility pre-flight (null = no client). */
  assets: EligibilityAssets | null
  onProjectChange: (p: PackProject) => void
  onStatus: (msg: string) => void
}

const THUMB = 3

/** Upscaled PNG data URL for a small tile preview (nearest-neighbour). */
function bufferToDataURL(buf: PixelBuffer, scale = THUMB): string {
  const c = document.createElement('canvas')
  c.width = buf.width
  c.height = buf.height
  const ctx = c.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(buf.width, buf.height)
  img.data.set(buf.data)
  ctx.putImageData(img, 0, 0)
  const c2 = document.createElement('canvas')
  c2.width = buf.width * scale
  c2.height = buf.height * scale
  const x2 = c2.getContext('2d')
  if (!x2) return ''
  x2.imageSmoothingEnabled = false
  x2.drawImage(c, 0, 0, c2.width, c2.height)
  return c2.toDataURL('image/png')
}

const WangSlicePanel: React.FC<WangSlicePanelProps> = ({
  source,
  scale,
  packDir,
  packFilename,
  project,
  assets,
  onProjectChange,
  onStatus
}) => {
  const [schemeId, setSchemeId] = useState<WangSchemeId>('corner16')
  const [terrain, setTerrain] = useState('')
  const [cellW, setCellW] = useState(32)
  const [cellH, setCellH] = useState(32)
  const [marginX, setMarginX] = useState(0)
  const [marginY, setMarginY] = useState(0)
  const [spacingX, setSpacingX] = useState(0)
  const [spacingY, setSpacingY] = useState(0)
  // cellIndex → adjacency mask (absent = untagged, skipped on commit)
  const [masks, setMasks] = useState<Record<number, number>>({})
  const [editing, setEditing] = useState<number | null>(null)
  const [committing, setCommitting] = useState(false)

  const scheme = getWangScheme(schemeId)

  const cells = useMemo(() => {
    if (cellW <= 0 || cellH <= 0) return []
    try {
      return sliceGrid(source, { cellW, cellH, marginX, marginY, spacingX, spacingY })
    } catch {
      return []
    }
  }, [source, cellW, cellH, marginX, marginY, spacingX, spacingY])

  const cols = useMemo(() => {
    if (cells.length === 0) return 0
    return Math.max(...cells.map((c) => c.col)) + 1
  }, [cells])

  const thumbs = useMemo(() => cells.map((c) => bufferToDataURL(c.buffer)), [cells])

  const taggedCount = Object.keys(masks).length

  const applyPreset = useCallback(() => {
    // Assign the scheme's canonical masks to the first N cells, row-major.
    const next: Record<number, number> = {}
    for (let i = 0; i < scheme.masks.length && i < cells.length; i++) {
      const m = scheme.masks[i]
      if (m !== null && m !== undefined) next[i] = m
    }
    setMasks(next)
  }, [scheme, cells.length])

  const clearAll = useCallback(() => setMasks({}), [])

  const setCellMask = useCallback((index: number, mask: number | null) => {
    setMasks((prev) => {
      const next = { ...prev }
      if (mask === null) delete next[index]
      else next[index] = mask
      return next
    })
  }, [])

  const commit = useCallback(async () => {
    if (!packDir || !project) return
    const entries = Object.entries(masks)
    if (entries.length === 0) {
      onStatus('Tag at least one cell before committing')
      return
    }
    setCommitting(true)
    try {
      const assetsDir = `${packDir}/${project.pack_id}`
      await window.api.ensureDir(assetsDir)
      let packAssets: PackAsset[] = [...project.assets]
      const assignments: WangAssignment[] = []
      const ineligible: string[] = []

      for (const [idxStr, mask] of entries) {
        const cell = cells[Number(idxStr)]
        if (!cell) continue
        const converted = convertOrthoTile(cell.buffer, { layer: 'floor', scale })
        const id = nextSlotId(packAssets, staticTilesKind.parseSlot, { namespace: 'floor' })
        // Wang ids are floors; a fresh pack starts at 1 (legacy range), so flag
        // any allocated id the client would ignore. Write anyway, report at end.
        const elig = checkTileEligibility(assets, 'floor', id)
        if (!elig.eligible && elig.reason) {
          ineligible.push(`${id} (${describeIneligibility(elig.reason)})`)
        }
        const filename = `floor${String(id).padStart(5, '0')}.png`
        const bytes = await pixelBufferToPngBytes(converted)
        await window.api.writeBytes(`${assetsDir}/${filename}`, bytes)
        packAssets = [...packAssets, { filename, sourcePath: '' }]
        assignments.push({ mask, tileId: id })
      }

      // Emit the informational wang sidecar next to the tiles.
      const sidecar = buildWangSidecar(scheme, assignments, terrain)
      const sidecarName = wangSidecarFilename(scheme.id, terrain)
      await window.api.writeFile(`${assetsDir}/${sidecarName}`, JSON.stringify(sidecar, null, 2))

      const updated: PackProject = {
        ...project,
        assets: packAssets,
        updatedAt: new Date().toISOString()
      }
      await window.api.packSave(`${packDir}/${packFilename}`, updated)
      onProjectChange(updated)
      const warn = ineligible.length
        ? ` — ${ineligible.length} target animated/cycled ids that won't render: ${ineligible.join(', ')}`
        : ''
      onStatus(`Committed ${assignments.length} wang tiles + ${sidecarName}${warn}`)
    } catch (e) {
      onStatus(`Wang commit failed: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setCommitting(false)
    }
  }, [
    packDir,
    project,
    assets,
    masks,
    cells,
    scale,
    scheme,
    terrain,
    packFilename,
    onProjectChange,
    onStatus
  ])

  return (
    <Stack spacing={2}>
      <Typography variant="overline" color="text.secondary">
        Wang / autotile slicing
      </Typography>

      <TextField
        select
        size="small"
        fullWidth
        label="Scheme"
        value={schemeId}
        onChange={(e) => {
          setSchemeId(e.target.value as WangSchemeId)
          setMasks({})
        }}
      >
        {Object.values(WANG_SCHEMES).map((s) => (
          <MenuItem key={s.id} value={s.id}>
            {s.label}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        size="small"
        fullWidth
        label="Terrain name (sidecar)"
        value={terrain}
        onChange={(e) => setTerrain(e.target.value)}
        placeholder={scheme.id}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
        <TextField
          size="small"
          label="Cell W"
          type="number"
          value={cellW}
          onChange={(e) => setCellW(Number(e.target.value))}
        />
        <TextField
          size="small"
          label="Cell H"
          type="number"
          value={cellH}
          onChange={(e) => setCellH(Number(e.target.value))}
        />
        <TextField
          size="small"
          label="Margin X"
          type="number"
          value={marginX}
          onChange={(e) => setMarginX(Number(e.target.value))}
        />
        <TextField
          size="small"
          label="Margin Y"
          type="number"
          value={marginY}
          onChange={(e) => setMarginY(Number(e.target.value))}
        />
        <TextField
          size="small"
          label="Spacing X"
          type="number"
          value={spacingX}
          onChange={(e) => setSpacingX(Number(e.target.value))}
        />
        <TextField
          size="small"
          label="Spacing Y"
          type="number"
          value={spacingY}
          onChange={(e) => setSpacingY(Number(e.target.value))}
        />
      </Box>

      <Stack direction="row" spacing={1}>
        <Button size="small" variant="outlined" onClick={applyPreset} disabled={cells.length === 0}>
          Apply {scheme.label} preset
        </Button>
        <Button size="small" onClick={clearAll} disabled={taggedCount === 0}>
          Clear tags
        </Button>
      </Stack>

      <Typography variant="caption" color="text.disabled">
        {cells.length} cells · {taggedCount} tagged. Click a cell to set its adjacency mask; the
        preset fills the first {scheme.tileCount} cells in canonical order. Untagged cells are
        skipped.
      </Typography>

      {cols > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, auto)`,
            gap: 0.5,
            overflow: 'auto'
          }}
        >
          {cells.map((_, i) => {
            const mask = masks[i]
            const tagged = mask !== undefined
            return (
              <Box
                key={i}
                onClick={() => setEditing(i)}
                title={tagged ? describeMask(scheme, mask) : 'untagged'}
                sx={{
                  cursor: 'pointer',
                  border: '2px solid',
                  borderColor: tagged ? 'success.main' : 'divider',
                  lineHeight: 0,
                  position: 'relative'
                }}
              >
                <img src={thumbs[i]} alt={`cell ${i}`} style={{ display: 'block' }} />
                {tagged && (
                  <Box
                    sx={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      bgcolor: 'rgba(0,0,0,0.6)',
                      color: '#fff',
                      fontSize: 9,
                      lineHeight: 1.2,
                      textAlign: 'center'
                    }}
                  >
                    {describeMask(scheme, mask)}
                  </Box>
                )}
              </Box>
            )
          })}
        </Box>
      )}

      {!assets && (
        <Typography variant="caption" color="text.secondary">
          No client loaded — animated / palette-cycled target ids can&apos;t be flagged.
        </Typography>
      )}

      <Button
        variant="contained"
        startIcon={<SaveIcon />}
        onClick={commit}
        disabled={committing || taggedCount === 0 || !project}
      >
        Commit {taggedCount} wang tiles
      </Button>

      <MaskDialog
        open={editing !== null}
        scheme={scheme}
        mask={editing !== null ? (masks[editing] ?? 0) : 0}
        onClose={() => setEditing(null)}
        onClear={() => {
          if (editing !== null) setCellMask(editing, null)
          setEditing(null)
        }}
        onSave={(m) => {
          if (editing !== null) setCellMask(editing, m)
          setEditing(null)
        }}
      />
    </Stack>
  )
}

interface MaskDialogProps {
  open: boolean
  scheme: ReturnType<typeof getWangScheme>
  mask: number
  onClose: () => void
  onClear: () => void
  onSave: (mask: number) => void
}

const MaskDialog: React.FC<MaskDialogProps> = ({
  open,
  scheme,
  mask,
  onClose,
  onClear,
  onSave
}) => {
  const [draft, setDraft] = useState(mask)
  // resync when a different cell opens
  React.useEffect(() => setDraft(mask), [mask, open])

  const toggle = (bit: number) => setDraft((d) => (d & bit ? d & ~bit : d | bit))

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Adjacency mask</DialogTitle>
      <DialogContent>
        <Stack sx={{ pt: 1 }}>
          {scheme.bits.map((b) => (
            <FormControlLabel
              key={b.name}
              control={
                <Checkbox checked={(draft & b.value) !== 0} onChange={() => toggle(b.value)} />
              }
              label={`${b.name} connects`}
            />
          ))}
          <Chip
            size="small"
            label={describeMask(scheme, draft)}
            sx={{ mt: 1, alignSelf: 'flex-start' }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="error" onClick={onClear}>
          Untag
        </Button>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => onSave(draft)}>
          Set
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default WangSlicePanel
