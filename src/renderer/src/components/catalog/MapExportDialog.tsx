import React, { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  ToggleButtonGroup,
  ToggleButton,
  CircularProgress,
  Alert
} from '@mui/material'
import { CatalogEntry, xmlPrefix, worldName, buildMapXmlStub } from '../../hooks/useCatalog'

interface Props {
  open: boolean
  entry: CatalogEntry
  dirPath: string
  activeLibrary: string | null
  onClose: () => void
  onExported: (filename: string, note: string) => void
}

type Prefix = 'lod' | 'hyb'

function normalizeSlash(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/$/, '')
}

/** Strip the last path segment (xml → world). */
function parentDir(p: string): string {
  const s = normalizeSlash(p)
  return s.slice(0, s.lastIndexOf('/'))
}

const MapExportDialog: React.FC<Props> = ({
  open,
  entry,
  dirPath,
  activeLibrary,
  onClose,
  onExported
}) => {
  const autoPrefix = xmlPrefix(entry.mapNumber)
  const [prefix, setPrefix] = useState<Prefix>(autoPrefix)
  const [mapNumberStr, setMapNumberStr] = useState(String(entry.mapNumber))
  const [checking, setChecking] = useState(false)
  const [mapDupe, setMapDupe] = useState(false)
  const [xmlDupe, setXmlDupe] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mapNumber = parseInt(mapNumberStr, 10)
  const validNumber = !isNaN(mapNumber) && mapNumber > 0

  // Destination paths — activeLibrary = world/xml/, so:
  //   mapfiles → ../mapfiles/  (world/mapfiles/)
  //   xml      → maps/         (world/xml/maps/)
  const mapfilePath =
    activeLibrary && validNumber
      ? `${parentDir(normalizeSlash(activeLibrary))}/mapfiles/lod${mapNumber}.map`
      : null
  const xmlFilename = validNumber ? `${prefix}${mapNumber}.xml` : null
  const xmlPath =
    activeLibrary && xmlFilename ? `${normalizeSlash(activeLibrary)}/maps/${xmlFilename}` : null

  // Check for duplicates whenever number or library changes
  const checkDupes = useCallback(async () => {
    if (!mapfilePath || !xmlPath) {
      setMapDupe(false)
      setXmlDupe(false)
      return
    }
    setChecking(true)
    try {
      const [m, x] = await Promise.all([window.api.exists(mapfilePath), window.api.exists(xmlPath)])
      setMapDupe(m)
      setXmlDupe(x)
    } finally {
      setChecking(false)
    }
  }, [mapfilePath, xmlPath])

  useEffect(() => {
    if (!open) return
    setPrefix(autoPrefix)
    setMapNumberStr(String(entry.mapNumber))
    setError(null)
  }, [open, entry.mapNumber, autoPrefix])

  useEffect(() => {
    const t = setTimeout(checkDupes, 300)
    return () => clearTimeout(t)
  }, [checkDupes])

  const handleExport = async () => {
    if (!activeLibrary || !mapfilePath || !xmlPath || !validNumber) return
    setExporting(true)
    setError(null)
    try {
      const srcPath = `${normalizeSlash(dirPath)}/${entry.filename}`

      // Copy binary .map file
      await window.api.copyFile(srcPath, mapfilePath)

      // Write XML stub
      const stub = buildMapXmlStub(mapNumber, entry.name, entry.width!, entry.height!)
      await window.api.writeFile(xmlPath, stub)

      // Build note
      const wn = worldName(activeLibrary)
      const date = new Date().toLocaleDateString()
      const note = `Exported to ${wn} as lod${mapNumber}.map — ${date}`

      onExported(entry.filename, note)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const hasDupe = mapDupe || xmlDupe
  const canExport = validNumber && !!activeLibrary && !exporting

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Export Map to Library</DialogTitle>
      <DialogContent
        sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}
      >
        {!activeLibrary && (
          <Alert severity="warning">No active library selected. Set one in Settings.</Alert>
        )}

        {/* Prefix selection */}
        <Box>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
            XML prefix
          </Typography>
          <ToggleButtonGroup
            value={prefix}
            exclusive
            size="small"
            onChange={(_, v) => {
              if (v) setPrefix(v as Prefix)
            }}
          >
            <ToggleButton value="lod">lod (DA classic, 0–29999)</ToggleButton>
            <ToggleButton value="hyb">hyb (Hybrasyl, 30000–39999)</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Map number */}
        <TextField
          label="Map number"
          size="small"
          value={mapNumberStr}
          onChange={(e) => {
            setMapNumberStr(e.target.value)
            setError(null)
          }}
          inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
          sx={{ width: 160 }}
          error={!validNumber && mapNumberStr !== ''}
          helperText={
            !validNumber && mapNumberStr !== '' ? 'Must be a positive integer' : undefined
          }
        />

        {/* Destination preview */}
        {validNumber && activeLibrary && (
          <Box
            sx={{
              bgcolor: 'background.default',
              borderRadius: 1,
              p: 1.5,
              border: '1px solid',
              borderColor: 'divider'
            }}
          >
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
              Destination
            </Typography>
            <DestRow label="Map file" path={mapfilePath!} isDupe={mapDupe} checking={checking} />
            <DestRow label="XML stub" path={xmlPath!} isDupe={xmlDupe} checking={checking} />
          </Box>
        )}

        {hasDupe && (
          <Alert severity="warning">
            {mapDupe && xmlDupe
              ? 'Both the map file and XML already exist and will be overwritten.'
              : mapDupe
                ? 'A map file with this number already exists and will be overwritten.'
                : 'An XML file with this number already exists and will be overwritten.'}
          </Alert>
        )}

        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={exporting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleExport}
          disabled={!canExport}
          startIcon={exporting ? <CircularProgress size={14} /> : undefined}
        >
          {hasDupe ? 'Overwrite & Export' : 'Export'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// Small helper row for destination paths
function DestRow({
  label,
  path,
  isDupe,
  checking
}: {
  label: string
  path: string
  isDupe: boolean
  checking: boolean
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.25 }}>
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 56 }}>
        {label}
      </Typography>
      <Typography variant="caption" sx={{ wordBreak: 'break-all', flex: 1 }}>
        {path}
      </Typography>
      {checking ? (
        <CircularProgress size={10} />
      ) : isDupe ? (
        <Typography variant="caption" color="warning.main">
          exists
        </Typography>
      ) : null}
    </Box>
  )
}

export default MapExportDialog
