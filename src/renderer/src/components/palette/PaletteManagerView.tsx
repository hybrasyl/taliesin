import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box, Typography, Button, IconButton, Tooltip,
  List, ListItemButton, ListItemText, TextField, Divider, Stack,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import SaveIcon from '@mui/icons-material/Save'
import UndoIcon from '@mui/icons-material/Undo'
import RefreshIcon from '@mui/icons-material/Refresh'
import { useRecoilState } from 'recoil'
import { activePaletteIdState } from '../../recoil/atoms'
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard'
import UnsavedChangesDialog from '../UnsavedChangesDialog'
import { Palette, PaletteEntry } from '../../utils/paletteTypes'
import { buildLuminanceRamp } from '../../utils/duotone'
import {
  scanPalettes, loadPalette, savePalette, deletePalette,
  PaletteSummary,
} from '../../utils/paletteIO'
import PaletteEntryEditor from './PaletteEntryEditor'
import CreatePaletteDialog from './CreatePaletteDialog'

interface Props {
  packDir: string
  onStatus: (msg: string) => void
}

const PREVIEW = buildLuminanceRamp(64)

function blankEntry(index: number): PaletteEntry {
  return {
    id: `entry_${index + 1}`,
    name: `Entry ${index + 1}`,
    shadowColor: '#333333',
    highlightColor: '#CCCCCC',
    defaultDarkFactor: 0.3,
    defaultLightFactor: 0.3,
  }
}

function blankPalette(id: string, name: string): Palette {
  return {
    id,
    name,
    description: '',
    version: 1,
    lastModified: new Date().toISOString(),
    entries: [blankEntry(0)],
  }
}

const PaletteManagerView: React.FC<Props> = ({ packDir, onStatus }) => {
  const [summaries, setSummaries] = useState<PaletteSummary[]>([])
  const [activeId, setActiveId] = useRecoilState(activePaletteIdState)
  const [draft, setDraft] = useState<Palette | null>(null)
  const [original, setOriginal] = useState<Palette | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const {
    markDirty, markClean, saveRef, guard,
    dialogOpen, handleDialogSave, handleDialogDiscard, handleDialogCancel,
  } = useUnsavedGuard('Palette')

  const refresh = useCallback(async () => {
    const list = await scanPalettes(packDir)
    setSummaries(list)
  }, [packDir])

  useEffect(() => { refresh() }, [refresh])

  // Load the active palette when selection changes
  useEffect(() => {
    let cancelled = false
    if (!activeId) { setDraft(null); setOriginal(null); return }
    loadPalette(packDir, activeId)
      .then(p => {
        if (cancelled) return
        setDraft(p)
        setOriginal(p)
        markClean()
      })
      .catch(() => {
        if (cancelled) return
        setDraft(null)
        setOriginal(null)
      })
    return () => { cancelled = true }
  }, [packDir, activeId, markClean])

  const dirty = draft !== null && original !== null && JSON.stringify(draft) !== JSON.stringify(original)
  useEffect(() => { if (dirty) markDirty() }, [dirty, markDirty])

  const update = useCallback((patch: Partial<Palette>) => {
    setDraft(prev => prev ? { ...prev, ...patch } : prev)
  }, [])

  const updateEntry = useCallback((idx: number, next: PaletteEntry) => {
    setDraft(prev => {
      if (!prev) return prev
      const entries = prev.entries.slice()
      entries[idx] = next
      return { ...prev, entries }
    })
  }, [])

  const addEntry = useCallback(() => {
    setDraft(prev => {
      if (!prev) return prev
      return { ...prev, entries: [...prev.entries, blankEntry(prev.entries.length)] }
    })
  }, [])

  const deleteEntry = useCallback((idx: number) => {
    setDraft(prev => {
      if (!prev) return prev
      const entries = prev.entries.slice()
      entries.splice(idx, 1)
      return { ...prev, entries }
    })
  }, [])

  const handleSave = useCallback(async () => {
    if (!draft) return
    const toSave = { ...draft, lastModified: new Date().toISOString() }
    await savePalette(packDir, toSave)
    setOriginal(toSave)
    setDraft(toSave)
    markClean()
    onStatus(`Saved ${toSave.id}`)
    refresh()
  }, [draft, packDir, markClean, onStatus, refresh])

  saveRef.current = handleSave

  const handleRevert = useCallback(() => {
    if (!original) return
    setDraft(original)
    markClean()
  }, [original, markClean])

  const handleDelete = useCallback(async () => {
    if (!activeId) return
    await deletePalette(packDir, activeId)
    setActiveId(null)
    setDraft(null)
    setOriginal(null)
    markClean()
    onStatus(`Deleted ${activeId}`)
    refresh()
  }, [activeId, packDir, setActiveId, markClean, onStatus, refresh])

  const handleCreate = useCallback(async (id: string, name: string) => {
    const p = blankPalette(id, name)
    await savePalette(packDir, p)
    onStatus(`Created ${id}`)
    setCreateOpen(false)
    await refresh()
    setActiveId(id)
  }, [packDir, onStatus, refresh, setActiveId])

  const existingIds = useMemo(() => summaries.map(s => s.id), [summaries])

  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left: palette list */}
      <Box sx={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ px: 1, py: 1, display: 'flex', gap: 1 }}>
          <Button size="small" variant="outlined" fullWidth startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>New Palette</Button>
          <Tooltip title="Refresh"><IconButton size="small" onClick={refresh}><RefreshIcon fontSize="small" /></IconButton></Tooltip>
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <List dense disablePadding>
            {summaries.map(s => (
              <ListItemButton
                key={s.id}
                selected={activeId === s.id}
                onClick={() => guard(() => setActiveId(s.id))}
              >
                <ListItemText
                  primary={s.name}
                  secondary={`${s.entryCount} entr${s.entryCount === 1 ? 'y' : 'ies'}`}
                  primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Box>

      {/* Right: editor */}
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {!draft ? (
          <Box sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Typography color="text.disabled">Select a palette to edit, or create a new one.</Typography>
          </Box>
        ) : (
          <>
            <Box sx={{ px: 2, py: 1.5, display: 'flex', gap: 2, alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
              <TextField
                label="Name"
                size="small"
                value={draft.name}
                onChange={e => update({ name: e.target.value })}
                sx={{ width: 220 }}
              />
              <TextField
                label="Description"
                size="small"
                value={draft.description ?? ''}
                onChange={e => update({ description: e.target.value })}
                sx={{ flex: 1 }}
              />
              <Stack direction="row" spacing={1}>
                <Button variant="contained" size="small" startIcon={<SaveIcon />} onClick={handleSave} disabled={!dirty}>Save</Button>
                <Button variant="outlined" size="small" startIcon={<UndoIcon />} onClick={handleRevert} disabled={!dirty}>Revert</Button>
                <Tooltip title="Delete palette">
                  <IconButton size="small" color="error" onClick={handleDelete}><DeleteIcon fontSize="small" /></IconButton>
                </Tooltip>
              </Stack>
            </Box>

            <Box sx={{ flex: 1, overflow: 'auto' }}>
              {draft.entries.map((entry, idx) => (
                <PaletteEntryEditor
                  key={idx}
                  entry={entry}
                  preview={PREVIEW}
                  onChange={next => updateEntry(idx, next)}
                  onDelete={() => deleteEntry(idx)}
                />
              ))}
              <Divider />
              <Box sx={{ p: 1.5 }}>
                <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addEntry}>Add Entry</Button>
              </Box>
            </Box>
          </>
        )}
      </Box>

      <CreatePaletteDialog
        open={createOpen}
        existingIds={existingIds}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />

      <UnsavedChangesDialog
        open={dialogOpen}
        onSave={handleDialogSave}
        onDiscard={handleDialogDiscard}
        onCancel={handleDialogCancel}
      />
    </Box>
  )
}

export default PaletteManagerView
