import React, { useState } from 'react'
import {
  Box,
  Tabs,
  Tab,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Tooltip
} from '@mui/material'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import { UI_NAME_RE } from '../../uiforge/types'
import type { UiPanelLayout } from '../../uiforge/types'

interface VariantTabsProps {
  layout: UiPanelLayout
  activeVariant: string
  onSelect: (name: string) => void
  /** Absent → read-only tabs (no manage menu). */
  onChange?: (mutate: (layout: UiPanelLayout) => UiPanelLayout) => void
}

type DialogMode = 'add' | 'rename' | 'duplicate' | null

const VariantTabs: React.FC<VariantTabsProps> = ({ layout, activeVariant, onSelect, onChange }) => {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null)
  const [dialogMode, setDialogMode] = useState<DialogMode>(null)
  const [nameValue, setNameValue] = useState('')

  const names = layout.variants.map((v) => v.name)

  const openDialog = (mode: Exclude<DialogMode, null>) => {
    setMenuAnchor(null)
    setNameValue(mode === 'rename' ? activeVariant : '')
    setDialogMode(mode)
  }

  const confirmDialog = () => {
    const name = nameValue.trim()
    if (!onChange || !dialogMode) return
    if (!UI_NAME_RE.test(name) || names.includes(name)) return
    onChange((prev) => {
      const variants = [...prev.variants]
      const idx = variants.findIndex((v) => v.name === activeVariant)
      if (dialogMode === 'add') {
        variants.push({ name, controls: [] })
      } else if (dialogMode === 'rename' && idx >= 0) {
        variants[idx] = { ...variants[idx], name }
      } else if (dialogMode === 'duplicate' && idx >= 0) {
        // Deep-copy controls — the compact→expanded authoring path.
        variants.push({
          ...structuredClone(variants[idx]),
          name,
          // background is variant-specific by convention; keep it as a starting point
          controls: structuredClone(variants[idx].controls)
        })
      }
      return { ...prev, variants }
    })
    setDialogMode(null)
    onSelect(name)
  }

  const handleDelete = () => {
    setMenuAnchor(null)
    if (!onChange || layout.variants.length <= 1) return
    const remaining = names.filter((n) => n !== activeVariant)
    onChange((prev) => ({
      ...prev,
      variants: prev.variants.filter((v) => v.name !== activeVariant)
    }))
    onSelect(remaining[0])
  }

  const nameError =
    nameValue.trim() !== '' &&
    (!UI_NAME_RE.test(nameValue.trim()) || names.includes(nameValue.trim()))

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid',
        borderColor: 'divider'
      }}
    >
      <Tabs
        value={activeVariant}
        onChange={(_, v) => onSelect(v)}
        variant="scrollable"
        sx={{ minHeight: 36, flex: 1, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}
      >
        {layout.variants.map((v) => (
          <Tab key={v.name} value={v.name} label={v.name} />
        ))}
      </Tabs>
      {onChange && (
        <Tooltip title="Manage variants">
          <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)} sx={{ mr: 1 }}>
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={() => openDialog('add')}>Add variant…</MenuItem>
        <MenuItem onClick={() => openDialog('rename')}>Rename “{activeVariant}”…</MenuItem>
        <MenuItem onClick={() => openDialog('duplicate')}>Duplicate “{activeVariant}”…</MenuItem>
        <MenuItem onClick={handleDelete} disabled={layout.variants.length <= 1}>
          Delete “{activeVariant}”
        </MenuItem>
      </Menu>
      <Dialog open={!!dialogMode} onClose={() => setDialogMode(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {dialogMode === 'add' && 'Add variant'}
          {dialogMode === 'rename' && `Rename variant “${activeVariant}”`}
          {dialogMode === 'duplicate' && `Duplicate variant “${activeVariant}”`}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            margin="dense"
            label="Variant name"
            error={nameError}
            helperText={
              nameError
                ? 'Lowercase letters, digits, underscores; must be unique'
                : 'e.g. compact, expanded'
            }
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirmDialog()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogMode(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!nameValue.trim() || nameError}
            onClick={confirmDialog}
          >
            {dialogMode === 'rename' ? 'Rename' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default VariantTabs
