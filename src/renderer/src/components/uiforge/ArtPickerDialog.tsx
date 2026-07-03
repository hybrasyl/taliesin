import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItemButton,
  ListSubheader,
  MenuItem,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material'
import {
  DataArchive,
  type DataArchiveEntry,
  type Palette,
  type RgbaFrame
} from '@eriscorp/dalib-ts'
import { getPaletteNames, loadPaletteByName, renderEntry } from '../../utils/archiveRenderer'
import { exportFrameAsPng } from '../../uiforge/artExport'

/** What the picked art becomes: a convention filename + a human label. */
export interface ArtTarget {
  filename: string
  label: string
}

interface ArtPickerDialogProps {
  open: boolean
  target: ArtTarget | null
  /** Absolute pack asset dir; every path writes a PNG here under `target.filename`. */
  projectAssetsDir: string
  onClose: () => void
  /** After the PNG lands on disk under `target.filename`. */
  onApplied: (filename: string) => void | Promise<void>
}

const LEGACY_EXTS = ['.epf', '.spf', '.mpf', '.hpf', '.efa']
const entryExt = (name: string): string => {
  const dot = name.toLowerCase().lastIndexOf('.')
  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

/** Draws one RgbaFrame at an integer point-filtered zoom into a fixed box. */
const FramePreview: React.FC<{ frame: RgbaFrame; box?: number; selected?: boolean }> = ({
  frame,
  box = 48,
  selected
}) => {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.width = frame.width
    c.height = frame.height
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height),
      0,
      0
    )
  }, [frame])
  const zoom = Math.max(1, Math.floor(box / Math.max(1, frame.width, frame.height)))
  return (
    <canvas
      ref={ref}
      style={{
        width: frame.width * zoom,
        height: frame.height * zoom,
        imageRendering: 'pixelated',
        border: selected ? '2px solid #4fc3f7' : '1px solid rgba(255,255,255,0.15)',
        background: 'repeating-conic-gradient(#2a2a30 0% 25%, #202025 0% 50%) 50% / 12px 12px'
      }}
    />
  )
}

/**
 * Attach art to a ui_panels control/background from one of three sources: a PNG
 * file, an installed .datf pack, or a legacy DA archive (setoa/cious .dat).
 * Every path ends by writing a PNG at `projectAssetsDir/target.filename`.
 */
const ArtPickerDialog: React.FC<ArtPickerDialogProps> = ({
  open,
  target,
  projectAssetsDir,
  onClose,
  onApplied
}) => {
  const [tab, setTab] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Tab 0 — PNG file
  const [pngPath, setPngPath] = useState<string | null>(null)

  // Tab 1 — installed packs
  const [packEntries, setPackEntries] = useState<PackImageEntry[] | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<PackImageEntry | null>(null)
  const [packPreviewUrl, setPackPreviewUrl] = useState<string | null>(null)

  // Tab 2 — legacy .dat
  const [datPath, setDatPath] = useState<string | null>(null)
  const [archive, setArchive] = useState<DataArchive | null>(null)
  const [paletteNames, setPaletteNames] = useState<string[]>([])
  const [paletteName, setPaletteName] = useState<string>('')
  const [datEntry, setDatEntry] = useState<DataArchiveEntry | null>(null)
  const [frames, setFrames] = useState<RgbaFrame[]>([])
  const [frameIndex, setFrameIndex] = useState(0)
  const [scale, setScale] = useState(1)

  const dest = target ? `${projectAssetsDir}/${target.filename}` : null

  // Reset transient state when (re)opened.
  useEffect(() => {
    if (!open) return
    setTab(0)
    setError(null)
    setBusy(false)
    setPngPath(null)
    setSelectedEntry(null)
    setPackPreviewUrl(null)
    setDatPath(null)
    setArchive(null)
    setPaletteNames([])
    setPaletteName('')
    setDatEntry(null)
    setFrames([])
    setFrameIndex(0)
    setScale(1)
  }, [open])

  // ── Tab 0: PNG file ────────────────────────────────────────────────────────
  const choosePng = useCallback(async () => {
    const p = await window.api.openFile([{ name: 'PNG Image', extensions: ['png'] }])
    if (p) setPngPath(p)
  }, [])

  const applyPng = useCallback(async () => {
    if (!pngPath || !target) return
    setBusy(true)
    setError(null)
    try {
      await window.api.packAddAsset(projectAssetsDir, pngPath, target.filename)
      await onApplied(target.filename)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to copy PNG')
    } finally {
      setBusy(false)
    }
  }, [pngPath, target, projectAssetsDir, onApplied, onClose])

  // ── Tab 1: installed packs ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open || tab !== 1 || packEntries) return
    let cancelled = false
    ;(async () => {
      try {
        await window.api.packReload()
        const list = await window.api.packListImageEntries()
        if (!cancelled) setPackEntries(list)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'failed to list packs')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, tab, packEntries])

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, PackImageEntry[]>()
    for (const e of packEntries ?? []) {
      if (!groups.has(e.packFileName)) groups.set(e.packFileName, [])
      groups.get(e.packFileName)!.push(e)
    }
    return groups
  }, [packEntries])

  // Preview the selected pack entry.
  useEffect(() => {
    let url: string | null = null
    let cancelled = false
    setPackPreviewUrl(null)
    if (!selectedEntry) return
    ;(async () => {
      const bytes = await window.api.packReadEntry(selectedEntry.packFile, selectedEntry.entryPath)
      if (cancelled || !bytes) return
      url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }))
      setPackPreviewUrl(url)
    })()
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [selectedEntry])

  const applyPackEntry = useCallback(async () => {
    if (!selectedEntry || !target || !dest) return
    setBusy(true)
    setError(null)
    try {
      const bytes = await window.api.packReadEntry(selectedEntry.packFile, selectedEntry.entryPath)
      if (!bytes) throw new Error('entry could not be read')
      await window.api.writeBytes(dest, bytes)
      await onApplied(target.filename)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to import pack entry')
    } finally {
      setBusy(false)
    }
  }, [selectedEntry, target, dest, onApplied, onClose])

  // ── Tab 2: legacy .dat ─────────────────────────────────────────────────────
  const chooseDat = useCallback(async () => {
    const p = await window.api.openFile([{ name: 'DA Archive', extensions: ['dat'] }])
    if (!p) return
    setBusy(true)
    setError(null)
    try {
      const buf = await window.api.readFile(p)
      const arc = DataArchive.fromBuffer(new Uint8Array(buf))
      const pals = getPaletteNames(arc)
      setDatPath(p)
      setArchive(arc)
      setPaletteNames(pals)
      setPaletteName(pals[0] ?? '')
      setDatEntry(null)
      setFrames([])
      setFrameIndex(0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to open archive')
    } finally {
      setBusy(false)
    }
  }, [])

  const datImageEntries = useMemo(
    () => (archive?.entries ?? []).filter((e) => LEGACY_EXTS.includes(entryExt(e.entryName))),
    [archive]
  )

  // Render the selected entry with the chosen palette.
  useEffect(() => {
    if (!datEntry) {
      setFrames([])
      return
    }
    let palette: Palette | null = null
    if (archive && paletteName) palette = loadPaletteByName(archive, paletteName)
    try {
      const rendered = renderEntry(datEntry, palette)
      setFrames(rendered?.frames ?? [])
      setFrameIndex(0)
      if (!rendered) setError('this entry needs a palette — pick one above')
      else setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to render entry')
      setFrames([])
    }
  }, [datEntry, archive, paletteName])

  const applyLegacy = useCallback(async () => {
    if (!frames.length || !target || !dest) return
    setBusy(true)
    setError(null)
    try {
      await exportFrameAsPng(frames, frameIndex, scale, dest)
      await onApplied(target.filename)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to export frame')
    } finally {
      setBusy(false)
    }
  }, [frames, frameIndex, scale, target, dest, onApplied, onClose])

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Attach art
        {target && (
          <Typography variant="body2" sx={{ color: 'text.disabled' }}>
            {target.label} → {target.filename}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers sx={{ minHeight: 360 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label="PNG file" />
          <Tab label="Installed packs" />
          <Tab label="Legacy .dat" />
        </Tabs>

        {error && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Tab 0 — PNG file */}
        {tab === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Button variant="outlined" onClick={choosePng} sx={{ alignSelf: 'flex-start' }}>
              Choose PNG…
            </Button>
            {pngPath && (
              <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                {pngPath}
              </Typography>
            )}
          </Box>
        )}

        {/* Tab 1 — installed packs */}
        {tab === 1 && (
          <Box sx={{ display: 'flex', gap: 2, height: 320 }}>
            <Box sx={{ flex: 1, overflow: 'auto', border: '1px solid', borderColor: 'divider' }}>
              {!packEntries ? (
                <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
                  <CircularProgress size={24} />
                </Box>
              ) : packEntries.length === 0 ? (
                <Typography variant="body2" sx={{ p: 2, color: 'text.disabled' }}>
                  No installed packs found. Set the Brigid assets / client path in Settings.
                </Typography>
              ) : (
                <List dense disablePadding>
                  {[...groupedEntries].map(([packName, entries]) => (
                    <React.Fragment key={packName}>
                      <ListSubheader sx={{ bgcolor: 'background.paper' }}>{packName}</ListSubheader>
                      {entries.map((e) => (
                        <ListItemButton
                          key={`${e.packFile}:${e.entryPath}`}
                          selected={
                            selectedEntry?.packFile === e.packFile &&
                            selectedEntry?.entryPath === e.entryPath
                          }
                          onClick={() => setSelectedEntry(e)}
                        >
                          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {e.entryPath}
                          </Typography>
                        </ListItemButton>
                      ))}
                    </React.Fragment>
                  ))}
                </List>
              )}
            </Box>
            <Box
              sx={{
                width: 160,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid',
                borderColor: 'divider'
              }}
            >
              {packPreviewUrl ? (
                <img
                  src={packPreviewUrl}
                  alt="preview"
                  style={{ maxWidth: '100%', maxHeight: '100%', imageRendering: 'pixelated' }}
                />
              ) : (
                <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                  Select an entry
                </Typography>
              )}
            </Box>
          </Box>
        )}

        {/* Tab 2 — legacy .dat */}
        {tab === 2 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <Button variant="outlined" onClick={chooseDat}>
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
                >
                  {paletteNames.map((n) => (
                    <MenuItem key={n} value={n}>
                      {n}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              {datPath && (
                <Typography
                  variant="caption"
                  sx={{ color: 'text.disabled', wordBreak: 'break-all' }}
                >
                  {datPath.split(/[\\/]/).pop()}
                </Typography>
              )}
            </Box>

            {archive && (
              <Box sx={{ display: 'flex', gap: 2, height: 240 }}>
                <Box
                  sx={{ width: 200, overflow: 'auto', border: '1px solid', borderColor: 'divider' }}
                >
                  <List dense disablePadding>
                    {datImageEntries.map((e) => (
                      <ListItemButton
                        key={e.entryName}
                        selected={datEntry?.entryName === e.entryName}
                        onClick={() => setDatEntry(e)}
                      >
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {e.entryName}
                        </Typography>
                      </ListItemButton>
                    ))}
                  </List>
                </Box>
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box
                    sx={{
                      flex: 1,
                      overflow: 'auto',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 1,
                      alignContent: 'flex-start'
                    }}
                  >
                    {frames.map((f, i) => (
                      <Box key={i} onClick={() => setFrameIndex(i)} sx={{ cursor: 'pointer' }}>
                        <FramePreview frame={f} selected={i === frameIndex} />
                      </Box>
                    ))}
                  </Box>
                  {frames.length > 0 && (
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <Typography variant="caption">Export scale</Typography>
                      <ToggleButtonGroup
                        exclusive
                        size="small"
                        value={scale}
                        onChange={(_, v) => v && setScale(v)}
                      >
                        <ToggleButton value={1}>1×</ToggleButton>
                        <ToggleButton value={2}>2×</ToggleButton>
                        <ToggleButton value={4}>4×</ToggleButton>
                      </ToggleButtonGroup>
                      <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                        frame {frameIndex + 1}/{frames.length}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
        {tab === 0 && (
          <Button variant="contained" onClick={applyPng} disabled={!pngPath || busy}>
            Use PNG
          </Button>
        )}
        {tab === 1 && (
          <Button variant="contained" onClick={applyPackEntry} disabled={!selectedEntry || busy}>
            Use selected
          </Button>
        )}
        {tab === 2 && (
          <Button variant="contained" onClick={applyLegacy} disabled={!frames.length || busy}>
            Export &amp; use
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

export default ArtPickerDialog
