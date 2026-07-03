import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItemButton,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material'
import { ControlFile, DataArchive, type DataArchiveEntry, type Palette } from '@eriscorp/dalib-ts'
import { getPaletteNames, loadPaletteByName, renderEntry } from '../../utils/archiveRenderer'
import { exportFrameAsPng } from '../../uiforge/artExport'
import { controlFileToLayout, sanitizeName } from '../../uiforge/prefabImport'
import { UI_CONTROL_KINDS, UI_NAME_RE, type UiControlKind } from '../../uiforge/types'
import { serializePanelXml } from '../../uiforge/panelXml'
import { useSettingsStore } from '../../store/settingsStore'

interface PrefabImportDialogProps {
  open: boolean
  /** Absolute pack asset dir; the XML and every PNG are written here. */
  projectAssetsDir: string
  /** Panel ids already in the project (import must not collide). */
  existingPanelIds: string[]
  onClose: () => void
  /** After the XML + art land on disk. `filenames` are all new pack assets. */
  onImported: (panelId: string, filenames: string[]) => void | Promise<void>
}

const IMAGE_EXTS = ['.epf', '.spf', '.mpf', '.hpf', '.efa']
const entryExt = (name: string): string => {
  const dot = name.toLowerCase().lastIndexOf('.')
  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}
const baseName = (name: string): string => {
  const slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'))
  const stem = slash >= 0 ? name.slice(slash + 1) : name
  const dot = stem.lastIndexOf('.')
  return (dot >= 0 ? stem.slice(0, dot) : stem).toLowerCase()
}

/**
 * Draft a ui_panels layout from a legacy control `.txt` prefab
 * (setoa.dat / cious.dat). The user picks an archive and a control file, reviews
 * the heuristic kind assignments and warnings, then confirms: each control image
 * is extracted to a convention-named PNG and the layout XML is written, ready to
 * open on the canvas. Importer contract: uiforge/prefabImport.ts.
 */
const PrefabImportDialog: React.FC<PrefabImportDialogProps> = ({
  open,
  projectAssetsDir,
  existingPanelIds,
  onClose,
  onImported
}) => {
  const clientPath = useSettingsStore((s) => s.clientPath)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [datPath, setDatPath] = useState<string | null>(null)
  const [archive, setArchive] = useState<DataArchive | null>(null)
  const [controlFiles, setControlFiles] = useState<Map<string, ControlFile> | null>(null)
  const [cfName, setCfName] = useState<string | null>(null)
  const [paletteNames, setPaletteNames] = useState<string[]>([])
  const [paletteName, setPaletteName] = useState<string>('')

  const [panelId, setPanelId] = useState('')
  const [kindOverrides, setKindOverrides] = useState<Record<string, UiControlKind>>({})

  // Reset when (re)opened.
  useEffect(() => {
    if (!open) return
    setBusy(false)
    setError(null)
    setDatPath(null)
    setArchive(null)
    setControlFiles(null)
    setCfName(null)
    setPaletteNames([])
    setPaletteName('')
    setPanelId('')
    setKindOverrides({})
  }, [open])

  const chooseDat = useCallback(async () => {
    const p = await window.api.openFile(
      [{ name: 'DA Archive', extensions: ['dat'] }],
      clientPath ?? undefined
    )
    if (!p) return
    setBusy(true)
    setError(null)
    try {
      const buf = await window.api.readFile(p)
      const arc = DataArchive.fromBuffer(new Uint8Array(buf))
      const cfs = ControlFile.fromArchive(arc)
      if (cfs.size === 0) throw new Error('no control (.txt) files found in this archive')
      const pals = getPaletteNames(arc)
      setDatPath(p)
      setArchive(arc)
      setControlFiles(cfs)
      setPaletteNames(pals)
      setPaletteName(pals[0] ?? '')
      setCfName(null)
      setPanelId('')
      setKindOverrides({})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to open archive')
    } finally {
      setBusy(false)
    }
  }, [clientPath])

  const cfNames = useMemo(
    () => (controlFiles ? [...controlFiles.keys()].sort() : []),
    [controlFiles]
  )
  const selectedCf = cfName ? controlFiles?.get(cfName) : undefined

  // Draft layout preview from the selected control file + panel id.
  const preview = useMemo(() => {
    if (!selectedCf || !panelId) return null
    try {
      return controlFileToLayout(selectedCf, panelId)
    } catch {
      return null
    }
  }, [selectedCf, panelId])

  const selectCf = useCallback((name: string) => {
    setCfName(name)
    setPanelId(sanitizeName(name))
    setKindOverrides({})
    setError(null)
  }, [])

  const panelIdError = useMemo(() => {
    if (!panelId) return null
    if (!UI_NAME_RE.test(panelId)) return 'lowercase letters, digits, underscores only'
    if (existingPanelIds.includes(panelId)) return `panel "${panelId}" already exists`
    return null
  }, [panelId, existingPanelIds])

  // Resolve a legacy image resource name to an archive image entry.
  const resolveImageEntry = useCallback(
    (imageName: string): DataArchiveEntry | undefined => {
      const target = baseName(imageName)
      const entries = archive?.entries ?? []
      return entries.find(
        (e) => IMAGE_EXTS.includes(entryExt(e.entryName)) && baseName(e.entryName) === target
      )
    },
    [archive]
  )

  const confirm = useCallback(async () => {
    if (!preview || !archive || panelIdError) return
    setBusy(true)
    setError(null)
    const artWarnings: string[] = []
    try {
      const palette: Palette | null =
        paletteName && archive ? loadPaletteByName(archive, paletteName) : null

      // Extract each control image to its convention-named PNG (art is optional
      // — a failed job is warned, never fatal).
      const written: string[] = []
      for (const job of preview.artJobs) {
        const entry = resolveImageEntry(job.imageName)
        if (!entry) {
          artWarnings.push(`image "${job.imageName}" not found in archive — ${job.label} skipped`)
          continue
        }
        try {
          const rendered = renderEntry(entry, palette)
          const frames = rendered?.frames ?? []
          if (!frames[job.frameIndex]) {
            artWarnings.push(`frame ${job.frameIndex} missing for ${job.label} — skipped`)
            continue
          }
          await exportFrameAsPng(
            frames,
            job.frameIndex,
            1,
            `${projectAssetsDir}/${job.destFilename}`
          )
          written.push(job.destFilename)
        } catch {
          artWarnings.push(`could not render ${job.label} — skipped`)
        }
      }

      // Apply kind overrides, then serialize + write the layout XML.
      const layout = {
        ...preview.layout,
        variants: preview.layout.variants.map((v) => ({
          ...v,
          controls: v.controls.map((c) =>
            kindOverrides[c.name] ? { ...c, kind: kindOverrides[c.name] } : c
          )
        }))
      }
      const xmlFilename = `${panelId}.xml`
      await window.api.ensureDir(projectAssetsDir)
      await window.api.writeFile(`${projectAssetsDir}/${xmlFilename}`, serializePanelXml(layout))

      await onImported(panelId, [xmlFilename, ...written])
      onClose()
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : 'import failed'}${
          artWarnings.length ? `; ${artWarnings.join('; ')}` : ''
        }`
      )
    } finally {
      setBusy(false)
    }
  }, [
    preview,
    archive,
    panelId,
    panelIdError,
    paletteName,
    kindOverrides,
    projectAssetsDir,
    resolveImageEntry,
    onImported,
    onClose
  ])

  const warnings = preview?.warnings ?? []

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>Import legacy prefab</DialogTitle>
      <DialogContent dividers sx={{ minHeight: 420 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
          <Button variant="outlined" onClick={chooseDat} disabled={busy}>
            Choose .dat…
          </Button>
          {paletteNames.length > 0 && (
            <TextField
              select
              size="small"
              label="Palette"
              value={paletteName}
              onChange={(e) => setPaletteName(e.target.value)}
              sx={{ minWidth: 160 }}
              helperText="for art extraction"
            >
              {paletteNames.map((n) => (
                <MenuItem key={n} value={n}>
                  {n}
                </MenuItem>
              ))}
            </TextField>
          )}
          {datPath && (
            <Typography variant="caption" sx={{ color: 'text.disabled', wordBreak: 'break-all' }}>
              {datPath.split(/[\\/]/).pop()}
            </Typography>
          )}
        </Box>

        {controlFiles && (
          <Box sx={{ display: 'flex', gap: 2 }}>
            {/* Control-file picker */}
            <Box
              sx={{
                width: 200,
                flexShrink: 0,
                height: 320,
                overflow: 'auto',
                border: '1px solid',
                borderColor: 'divider'
              }}
            >
              <List dense disablePadding>
                {cfNames.map((n) => (
                  <ListItemButton key={n} selected={cfName === n} onClick={() => selectCf(n)}>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {n}
                    </Typography>
                  </ListItemButton>
                ))}
              </List>
            </Box>

            {/* Review */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {!selectedCf ? (
                <Typography variant="body2" sx={{ color: 'text.disabled', p: 2 }}>
                  Select a control file to preview the drafted layout.
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <TextField
                    size="small"
                    label="Panel id"
                    value={panelId}
                    onChange={(e) => setPanelId(e.target.value)}
                    error={!!panelIdError}
                    helperText={panelIdError ?? 'becomes the layout XML filename'}
                  />

                  {warnings.length > 0 && (
                    <Alert severity="warning" sx={{ py: 0 }}>
                      {warnings.map((w, i) => (
                        <Typography key={i} variant="caption" component="div">
                          {w}
                        </Typography>
                      ))}
                    </Alert>
                  )}

                  <Box sx={{ maxHeight: 220, overflow: 'auto' }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell>Control</TableCell>
                          <TableCell>Kind</TableCell>
                          <TableCell>Rect (x,y,w,h)</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {preview?.layout.variants[0].controls.map((c) => (
                          <TableRow key={c.name}>
                            <TableCell sx={{ fontFamily: 'monospace' }}>{c.name}</TableCell>
                            <TableCell>
                              <TextField
                                select
                                size="small"
                                variant="standard"
                                value={kindOverrides[c.name] ?? c.kind}
                                onChange={(e) =>
                                  setKindOverrides((prev) => ({
                                    ...prev,
                                    [c.name]: e.target.value as UiControlKind
                                  }))
                                }
                                sx={{ minWidth: 110 }}
                              >
                                {UI_CONTROL_KINDS.map((k) => (
                                  <MenuItem key={k} value={k}>
                                    {k}
                                  </MenuItem>
                                ))}
                              </TextField>
                            </TableCell>
                            <TableCell sx={{ fontFamily: 'monospace' }}>
                              {`${c.rect.x},${c.rect.y},${c.rect.w},${c.rect.h}`}
                            </TableCell>
                          </TableRow>
                        ))}
                        {preview?.layout.variants[0].controls.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={3}>
                              <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                                no controls detected
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Box>

                  <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                    {preview?.artJobs.length ?? 0} art job
                    {(preview?.artJobs.length ?? 0) !== 1 ? 's' : ''} · anchor{' '}
                    {preview ? `${preview.layout.anchor.w}×${preview.layout.anchor.h}` : ''}.
                    Bindings aren&apos;t inferred — add them on the canvas after import.
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
        <Button variant="contained" onClick={confirm} disabled={!preview || !!panelIdError || busy}>
          Import
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default PrefabImportDialog
