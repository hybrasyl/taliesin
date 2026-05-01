import React, { useState, useCallback, useEffect, useMemo } from 'react'
import {
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Tooltip,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  CircularProgress,
  Divider,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import AddIcon from '@mui/icons-material/Add'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
import BuildIcon from '@mui/icons-material/Build'
import SaveIcon from '@mui/icons-material/Save'
import { getKind } from '../../packKinds'
import type { PackProject } from '../../packKinds'

interface Props {
  pack: PackProject
  packDir: string
  packFilePath: string
  onSave: (pack: PackProject) => void
  onStatus: (msg: string) => void
}

const PackEditor: React.FC<Props> = ({ pack, packDir, packFilePath, onSave, onStatus }) => {
  const [draft, setDraft] = useState<PackProject>(pack)
  const [dirty, setDirty] = useState(false)
  const [compiling, setCompiling] = useState(false)
  const [addMenuAnchor, setAddMenuAnchor] = useState<null | HTMLElement>(null)
  const [customNsDialogOpen, setCustomNsDialogOpen] = useState(false)
  const [customNsValue, setCustomNsValue] = useState('')

  useEffect(() => {
    setDraft(pack)
    setDirty(false)
  }, [pack])

  const kind = getKind(draft.content_type)
  const namespaceList = useMemo(() => kind.namespaces?.(draft.assets) ?? [], [kind, draft.assets])
  const hasMenu = namespaceList.length > 0 || !!kind.customNamespacePrompt

  const updateField = useCallback((field: keyof PackProject, value: unknown) => {
    setDraft((prev) => ({ ...prev, [field]: value, updatedAt: new Date().toISOString() }))
    setDirty(true)
  }, [])

  const handleSave = useCallback(async () => {
    await window.api.packSave(packFilePath, draft)
    onSave(draft)
    setDirty(false)
    onStatus('Pack saved')
  }, [draft, packFilePath, onSave, onStatus])

  const addAssetInNamespace = useCallback(
    async (namespace: string | undefined) => {
      const filePath = (await window.api.openFile([
        { name: 'PNG Images', extensions: ['png'] }
      ])) as string | null
      if (!filePath) return

      const target = kind.nextAssetPath({
        ctx: namespace ? { namespace } : undefined,
        existingAssets: draft.assets
      })
      await window.api.packAddAsset(packDir, filePath, target.zipPath)

      const newAssets = [...draft.assets, { filename: target.zipPath, sourcePath: filePath }]
      setDraft((prev) => ({ ...prev, assets: newAssets, updatedAt: new Date().toISOString() }))
      setDirty(true)
      onStatus(`Added ${target.zipPath}`)
    },
    [draft.assets, kind, packDir, onStatus]
  )

  const handleAddClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (hasMenu) {
        setAddMenuAnchor(e.currentTarget)
      } else {
        addAssetInNamespace(undefined)
      }
    },
    [hasMenu, addAssetInNamespace]
  )

  const handleMenuPick = useCallback(
    (namespace: string) => {
      setAddMenuAnchor(null)
      addAssetInNamespace(namespace)
    },
    [addAssetInNamespace]
  )

  const handleOpenCustomNs = useCallback(() => {
    setAddMenuAnchor(null)
    setCustomNsValue('')
    setCustomNsDialogOpen(true)
  }, [])

  const handleConfirmCustomNs = useCallback(() => {
    const trimmed = customNsValue.trim()
    if (!trimmed) return
    setCustomNsDialogOpen(false)
    addAssetInNamespace(trimmed)
  }, [customNsValue, addAssetInNamespace])

  const handleRemoveAsset = useCallback(
    async (filename: string) => {
      await window.api.packRemoveAsset(packDir, filename)
      const newAssets = draft.assets.filter((a) => a.filename !== filename)
      setDraft((prev) => ({ ...prev, assets: newAssets, updatedAt: new Date().toISOString() }))
      setDirty(true)
    },
    [draft, packDir]
  )

  const handleCompile = useCallback(async () => {
    await window.api.packSave(packFilePath, draft)
    setDirty(false)

    const outputPath = await window.api.saveFile(
      [{ name: 'DATF Asset Pack', extensions: ['datf'] }],
      `${draft.pack_id}.datf`
    )
    if (!outputPath) return

    setCompiling(true)
    try {
      const manifest = {
        schema_version: 1,
        pack_id: draft.pack_id,
        pack_version: draft.pack_version,
        content_type: draft.content_type,
        priority: draft.priority,
        covers: draft.covers
      }
      const filenames = draft.assets.map((a) => a.filename)
      await window.api.packCompile(packDir, manifest, filenames, outputPath)
      onStatus(`Compiled ${draft.pack_id}.datf (${filenames.length} assets)`)
    } catch (err) {
      onStatus(`Compile failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setCompiling(false)
    }
  }, [draft, packDir, packFilePath, onStatus])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderBottom: '1px solid',
          borderColor: 'divider'
        }}
      >
        <Typography variant="h6" sx={{ flex: 1 }}>
          {draft.pack_id}
        </Typography>
        <Tooltip title="Save">
          <span>
            <IconButton
              size="small"
              onClick={handleSave}
              disabled={!dirty}
              sx={{ color: 'text.primary' }}
              aria-label="save"
            >
              <SaveIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Button
          size="small"
          variant="contained"
          startIcon={compiling ? <CircularProgress size={14} color="inherit" /> : <BuildIcon />}
          onClick={handleCompile}
          disabled={compiling || draft.assets.length === 0}
        >
          {compiling ? 'Compiling...' : 'Compile .datf'}
        </Button>
      </Box>

      {/* Manifest fields */}
      <Box sx={{ p: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField
          label="Pack ID"
          size="small"
          value={draft.pack_id}
          onChange={(e) =>
            updateField('pack_id', e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'))
          }
          sx={{ width: 200 }}
        />
        <TextField
          label="Version"
          size="small"
          value={draft.pack_version}
          onChange={(e) => updateField('pack_version', e.target.value)}
          sx={{ width: 120 }}
        />
        <TextField
          label="Priority"
          size="small"
          type="number"
          value={draft.priority}
          onChange={(e) => updateField('priority', parseInt(e.target.value) || 100)}
          sx={{ width: 100 }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
          Type: {draft.content_type}
        </Typography>
      </Box>

      <Divider />

      {/* Asset table */}
      <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="body2" sx={{ flex: 1 }}>
          {draft.assets.length} assets
        </Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          endIcon={hasMenu ? <ArrowDropDownIcon /> : undefined}
          onClick={handleAddClick}
        >
          Add PNG
        </Button>
        <Menu
          anchorEl={addMenuAnchor}
          open={!!addMenuAnchor}
          onClose={() => setAddMenuAnchor(null)}
        >
          {namespaceList.map((ns) => (
            <MenuItem key={ns} onClick={() => handleMenuPick(ns)}>
              {ns}
            </MenuItem>
          ))}
          {kind.customNamespacePrompt && (
            <MenuItem onClick={handleOpenCustomNs}>{kind.customNamespacePrompt.menuLabel}</MenuItem>
          )}
        </Menu>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', px: 1 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 48 }}>Preview</TableCell>
              <TableCell>Filename</TableCell>
              <TableCell sx={{ width: 100 }}>Slot</TableCell>
              <TableCell sx={{ width: 40 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {draft.assets.map((asset) => {
              const slot = kind.parseSlot(asset.filename)
              const imgSrc = `file://${packDir.replace(/\\/g, '/')}/${asset.filename}`
              return (
                <TableRow key={asset.filename}>
                  <TableCell>
                    <img
                      src={imgSrc}
                      width={32}
                      height={32}
                      style={{ imageRendering: 'pixelated', background: '#1a1a2e' }}
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                    >
                      {asset.filename}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {slot ? `${slot.namespace} ${slot.id}` : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => handleRemoveAsset(asset.filename)}
                      sx={{ color: 'error.main' }}
                      aria-label={`delete ${asset.filename}`}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Box>

      {/* Custom-namespace dialog (opt-in via kind.customNamespacePrompt) */}
      {kind.customNamespacePrompt && (
        <Dialog
          open={customNsDialogOpen}
          onClose={() => setCustomNsDialogOpen(false)}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle>{kind.customNamespacePrompt.dialogTitle}</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="Source filename"
              value={customNsValue}
              onChange={(e) => setCustomNsValue(e.target.value)}
              helperText={kind.customNamespacePrompt.dialogHelp}
              sx={{ mt: 1 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleConfirmCustomNs()
                }
              }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCustomNsDialogOpen(false)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleConfirmCustomNs}
              disabled={!customNsValue.trim()}
            >
              Continue
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  )
}

export default PackEditor
