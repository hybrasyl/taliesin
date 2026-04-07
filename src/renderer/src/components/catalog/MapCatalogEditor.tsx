import React, { useEffect, useState } from 'react'
import {
  Box, Typography, TextField, Button, Chip, Divider, Tooltip
} from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import FileUploadIcon from '@mui/icons-material/FileUpload'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import { CatalogEntry, CatalogMeta } from '../../hooks/useCatalog'
import { useWorldIndex } from '../../hooks/useWorldIndex'
import MapCanvas from './MapCanvas'
import DimensionPickerDialog from './DimensionPickerDialog'

interface Props {
  entry: CatalogEntry
  draft: CatalogMeta
  dirty: boolean
  dirPath: string
  clientPath: string | null
  onUpdateDraft: (changes: Partial<CatalogMeta>) => void
  onSave: (overrides?: Partial<import('../../hooks/useCatalog').CatalogMeta>) => Promise<void>
  onExport: () => void
}

const MapCatalogEditor: React.FC<Props> = ({
  entry,
  draft,
  dirty,
  dirPath,
  clientPath,
  onUpdateDraft,
  onSave,
  onExport,
}) => {
  const [fileBuffer, setFileBuffer] = useState<Uint8Array | null>(null)
  const [saving, setSaving] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const { index } = useWorldIndex()

  // Load the map file when the entry changes; auto-open dimension picker if no dimensions stored
  useEffect(() => {
    setFileBuffer(null)
    setPickerOpen(false)
    const filePath = `${dirPath}/${entry.filename}`.replace(/\\/g, '/')
    window.api.readFile(filePath).then((buf) => {
      const uint8 = new Uint8Array(buf)
      setFileBuffer(uint8)
      // Auto-open picker if dimensions not yet known
      if (entry.width == null && entry.height == null) {
        setPickerOpen(true)
      }
    }).catch(() => setFileBuffer(null))
  }, [dirPath, entry.filename])

  // Derive XML presence from the world index — lookup by map Id, not filename.
  // This works regardless of what the XML file is named (e.g. "Abel.xml" vs "lod0.xml").
  const indexedMap = index?.mapDetails?.find(m => m.id === entry.mapNumber)
    ?? null
  const ignoredMap = index?.ignoredMapDetails?.find(m => m.id === entry.mapNumber)
    ?? null
  const xmlExists: 'active' | 'ignored' | null =
    indexedMap ? 'active' : ignoredMap ? 'ignored' : null

  const handleSave = async () => {
    setSaving(true)
    try { await onSave() } finally { setSaving(false) }
  }

  const handlePickerConfirm = async (width: number, height: number) => {
    setPickerOpen(false)
    await onSave({ width, height })
  }

  const canExport = draft.width != null && draft.height != null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <Box sx={{ px: 2, pt: 2, pb: 1, flexShrink: 0 }}>
        {/* Title row */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Typography variant="h6" sx={{ color: 'text.button', fontWeight: 'bold', flex: 1 }}>
            lod{entry.mapNumber}
          </Typography>
          {entry.variant && (
            <Chip label={entry.variant} size="small" variant="outlined" />
          )}
          <Typography variant="caption" color="text.secondary">
            {entry.sizeBytes.toLocaleString()} bytes
          </Typography>
        </Box>

        {/* Dimensions + Name row */}
        <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5, alignItems: 'center' }}>
          <Tooltip title={draft.width != null ? 'Change dimensions' : 'Set map dimensions'}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setPickerOpen(true)}
              sx={{ minWidth: 130, fontFamily: 'monospace', justifyContent: 'center', flexShrink: 0 }}
            >
              {draft.width != null && draft.height != null
                ? `${draft.width} × ${draft.height}`
                : 'Set dimensions…'}
            </Button>
          </Tooltip>
          <TextField
            label="Name"
            size="small"
            fullWidth
            value={draft.name ?? ''}
            onChange={(e) => onUpdateDraft({ name: e.target.value })}
            inputProps={{ spellCheck: false }}
          />
        </Box>

        {/* Notes */}
        <TextField
          label="Notes"
          size="small"
          fullWidth
          multiline
          minRows={2}
          maxRows={4}
          value={draft.notes ?? ''}
          onChange={(e) => onUpdateDraft({ notes: e.target.value })}
          sx={{ mb: 1.5 }}
        />

        {/* Action buttons */}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button
            variant="contained"
            size="small"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={!dirty || saving}
          >
            Save
          </Button>
          <Tooltip title={canExport ? 'Export to XML library' : 'Set dimensions before exporting'}>
            <span>
              <Button
                variant="outlined"
                size="small"
                startIcon={<FileUploadIcon />}
                onClick={onExport}
                disabled={!canExport}
              >
                {xmlExists === 'active' ? 'Re-export' : xmlExists === 'ignored' ? 'Export (ignored)' : 'Export'}
              </Button>
            </span>
          </Tooltip>
          {xmlExists === 'active' && (
            <Tooltip title={indexedMap?.name ? `"${indexedMap.name}" is active in maps/` : 'Map is active in XML library'}>
              <Chip
                size="small"
                icon={<CheckCircleOutlineIcon />}
                label="In XML library"
                color="success"
                variant="outlined"
              />
            </Tooltip>
          )}
          {xmlExists === 'ignored' && (
            <Tooltip title={ignoredMap?.name ? `"${ignoredMap.name}" is in maps/.ignore/` : 'Map is in maps/.ignore/'}>
              <Chip
                size="small"
                icon={<VisibilityOffIcon />}
                label="In .ignore"
                color="warning"
                variant="outlined"
              />
            </Tooltip>
          )}
        </Box>
      </Box>

      <Divider />

      {/* ── Map canvas ──────────────────────────────────────────────────── */}
      <MapCanvas
        fileBuffer={fileBuffer}
        width={draft.width ?? null}
        height={draft.height ?? null}
        clientPath={clientPath}
      />

      {/* ── Dimension picker ─────────────────────────────────────────────── */}
      {pickerOpen && fileBuffer && (
        <DimensionPickerDialog
          open={pickerOpen}
          filename={entry.filename}
          fileBuffer={fileBuffer}
          clientPath={clientPath}
          onConfirm={handlePickerConfirm}
          onCancel={() => setPickerOpen(false)}
        />
      )}
    </Box>
  )
}

export default MapCatalogEditor
