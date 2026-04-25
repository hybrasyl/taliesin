import React, { useState, useCallback, useEffect } from 'react'
import {
  Box, Typography, TextField, Button, IconButton, Tooltip,
  Table, TableHead, TableRow, TableCell, TableBody, CircularProgress, Divider,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import AddIcon from '@mui/icons-material/Add'
import BuildIcon from '@mui/icons-material/Build'
import SaveIcon from '@mui/icons-material/Save'

interface PackAsset {
  filename: string
  sourcePath: string
}

interface PackProject {
  pack_id: string
  pack_version: string
  content_type: string
  priority: number
  covers: Record<string, unknown>
  assets: PackAsset[]
  createdAt: string
  updatedAt: string
}

interface Props {
  pack: PackProject
  packDir: string
  packFilePath: string
  onSave: (pack: PackProject) => void
  onStatus: (msg: string) => void
}

function slotIdFromFilename(filename: string): number | null {
  const m = filename.match(/(\d{4})\.png$/i)
  return m ? parseInt(m[1], 10) : null
}

function nextSlotId(assets: PackAsset[], prefix: string): number {
  let max = 0
  for (const a of assets) {
    if (a.filename.startsWith(prefix)) {
      const id = slotIdFromFilename(a.filename)
      if (id && id > max) max = id
    }
  }
  return max + 1
}

const PackEditor: React.FC<Props> = ({ pack, packDir, packFilePath, onSave, onStatus }) => {
  const [draft, setDraft] = useState<PackProject>(pack)
  const [dirty, setDirty] = useState(false)
  const [compiling, setCompiling] = useState(false)

  useEffect(() => {
    setDraft(pack)
    setDirty(false)
  }, [pack])

  const updateField = useCallback((field: string, value: unknown) => {
    setDraft(prev => ({ ...prev, [field]: value, updatedAt: new Date().toISOString() }))
    setDirty(true)
  }, [])

  const handleSave = useCallback(async () => {
    await window.api.packSave(packFilePath, draft)
    onSave(draft)
    setDirty(false)
    onStatus('Pack saved')
  }, [draft, packFilePath, onSave, onStatus])

  const handleAddAssets = useCallback(async () => {
    const files = await window.api.openFile([
      { name: 'PNG Images', extensions: ['png'] },
    ])
    if (!files) return

    // Determine prefix based on content type
    let prefix = 'asset_'
    if (draft.content_type === 'ability_icons') prefix = 'skill_'
    if (draft.content_type === 'nation_badges') prefix = 'nation'

    const filePath = files // openFile returns single file
    const id = nextSlotId(draft.assets, prefix)
    const padded = String(id).padStart(4, '0')
    const targetFilename = draft.content_type === 'nation_badges'
      ? `nation${padded}.png`
      : `${prefix}${padded}.png`

    await window.api.packAddAsset(packDir, filePath, targetFilename)

    const newAssets = [...draft.assets, { filename: targetFilename, sourcePath: filePath }]
    setDraft(prev => ({ ...prev, assets: newAssets, updatedAt: new Date().toISOString() }))
    setDirty(true)
    onStatus(`Added ${targetFilename}`)
  }, [draft, packDir, onStatus])

  const handleRemoveAsset = useCallback(async (filename: string) => {
    await window.api.packRemoveAsset(packDir, filename)
    const newAssets = draft.assets.filter(a => a.filename !== filename)
    setDraft(prev => ({ ...prev, assets: newAssets, updatedAt: new Date().toISOString() }))
    setDirty(true)
  }, [draft, packDir])

  const handleCompile = useCallback(async () => {
    // Save first
    await window.api.packSave(packFilePath, draft)
    setDirty(false)

    const outputPath = await window.api.saveFile(
      [{ name: 'DATF Asset Pack', extensions: ['datf'] }],
      `${draft.pack_id}.datf`,
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
        covers: draft.covers,
      }
      const filenames = draft.assets.map(a => a.filename)
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
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="h6" sx={{ flex: 1 }}>{draft.pack_id}</Typography>
        <Tooltip title="Save">
          <IconButton size="small" onClick={handleSave} disabled={!dirty} sx={{ color: 'text.primary' }}>
            <SaveIcon fontSize="small" />
          </IconButton>
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
          label="Pack ID" size="small" value={draft.pack_id}
          onChange={e => updateField('pack_id', e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'))}
          sx={{ width: 200 }}
        />
        <TextField
          label="Version" size="small" value={draft.pack_version}
          onChange={e => updateField('pack_version', e.target.value)}
          sx={{ width: 120 }}
        />
        <TextField
          label="Priority" size="small" type="number" value={draft.priority}
          onChange={e => updateField('priority', parseInt(e.target.value) || 100)}
          sx={{ width: 100 }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
          Type: {draft.content_type}
        </Typography>
      </Box>

      <Divider />

      {/* Asset table */}
      <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="body2" sx={{ flex: 1 }}>{draft.assets.length} assets</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={handleAddAssets}>Add PNG</Button>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', px: 1 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 48 }}>Preview</TableCell>
              <TableCell>Filename</TableCell>
              <TableCell sx={{ width: 60 }}>Slot</TableCell>
              <TableCell sx={{ width: 40 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {draft.assets.map(asset => {
              const slotId = slotIdFromFilename(asset.filename)
              const imgSrc = `file://${packDir.replace(/\\/g, '/')}/${asset.filename}`
              return (
                <TableRow key={asset.filename}>
                  <TableCell>
                    <img
                      src={imgSrc}
                      width={32} height={32}
                      style={{ imageRendering: 'pixelated', background: '#1a1a2e' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {asset.filename}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {slotId ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => handleRemoveAsset(asset.filename)} sx={{ color: 'error.main' }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Box>
    </Box>
  )
}

export default PackEditor
