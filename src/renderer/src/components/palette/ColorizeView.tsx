import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box, Typography, Button, IconButton, Tooltip, TextField,
  FormControl, InputLabel, Select, MenuItem, Stack, LinearProgress, Divider,
} from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import SaveIcon from '@mui/icons-material/Save'
import { useRecoilState } from 'recoil'
import { activePaletteIdState, activeColorizeSourceState } from '../../recoil/atoms'
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard'
import UnsavedChangesDialog from '../UnsavedChangesDialog'
import {
  Palette, PaletteEntry, DuotoneParams, EntryCalibration, CalibrationFile, SourceCalibration,
} from '../../utils/paletteTypes'
import {
  PaletteSummary, scanPalettes, loadPalette,
  loadCalibrations, saveCalibrations,
  scanFrames, framePath,
  basenameFromPath, filenameFromPath, dirnameFromPath, outputFilename,
} from '../../utils/paletteIO'
import { applyDuotone, PixelBuffer } from '../../utils/duotone'
import { DEFAULT_VARIANTS, variantToParams, autoDetectBest } from '../../utils/variants'
import { loadPixelBufferFromPath, pixelBufferToPngBytes, compositeOnTop } from '../../utils/imageLoader'
import VariantGrid from './VariantGrid'
import CustomVariantDialog from './CustomVariantDialog'
import RawPreview from './RawPreview'

interface Props {
  packDir: string
  active: boolean
  onStatus: (msg: string) => void
}

interface EntrySelection {
  variantId: string  // 'simple' | ... | 'custom'
  customParams?: DuotoneParams
}

const TILE_SIZE = 64

const ColorizeView: React.FC<Props> = ({ packDir, active, onStatus }) => {
  const [summaries, setSummaries] = useState<PaletteSummary[]>([])
  const [paletteId, setPaletteId] = useRecoilState(activePaletteIdState)
  const [palette, setPalette] = useState<Palette | null>(null)
  const [sourcePath, setSourcePath] = useRecoilState(activeColorizeSourceState)
  const [sourceBuf, setSourceBuf] = useState<PixelBuffer | null>(null)
  const [selections, setSelections] = useState<Record<string, EntrySelection>>({})
  const [autoBest, setAutoBest] = useState<Record<string, string>>({})
  const [calibrations, setCalibrations] = useState<CalibrationFile>({})
  const [customDialog, setCustomDialog] = useState<{ open: boolean; entryId: string | null }>({ open: false, entryId: null })
  const [saving, setSaving] = useState(false)
  const [saveProgress, setSaveProgress] = useState<{ current: number; total: number } | null>(null)
  const [frameOptions, setFrameOptions] = useState<string[]>([])
  const [frameName, setFrameName] = useState<string | null>(null)
  const [frameBuf, setFrameBuf] = useState<PixelBuffer | null>(null)
  const [dirty, setDirty] = useState(false)

  const {
    markDirty, markClean, saveRef,
    dialogOpen: unsavedDialogOpen,
    handleDialogSave: handleUnsavedSave,
    handleDialogDiscard: handleUnsavedDiscard,
    handleDialogCancel: handleUnsavedCancel,
  } = useUnsavedGuard('Colorize')

  useEffect(() => {
    if (dirty) markDirty()
    else markClean()
  }, [dirty, markDirty, markClean])

  const variants = useMemo(() => palette?.variants ?? DEFAULT_VARIANTS, [palette])
  const sourceFilename = sourcePath ? filenameFromPath(sourcePath) : null

  // Re-scan palettes + frames whenever the tab becomes active so newly-created
  // palettes in the Palettes tab show up in the dropdown without remounting.
  useEffect(() => {
    if (!active) return
    scanPalettes(packDir).then(setSummaries).catch(() => setSummaries([]))
    scanFrames(packDir)
      .then(list => {
        setFrameOptions(list)
        if (list.length === 0) onStatus(`No PNGs found in ${packDir}/_frames`)
      })
      .catch(err => {
        setFrameOptions([])
        onStatus(`Frame scan failed: ${err instanceof Error ? err.message : String(err)}`)
      })
  }, [active, packDir, onStatus])

  // Load frame PixelBuffer when frame name changes
  useEffect(() => {
    let cancelled = false
    if (!frameName) { setFrameBuf(null); return }
    loadPixelBufferFromPath(framePath(packDir, frameName))
      .then(buf => { if (!cancelled) setFrameBuf(buf) })
      .catch(err => {
        if (cancelled) return
        setFrameBuf(null)
        onStatus(`Frame load failed: ${err instanceof Error ? err.message : String(err)}`)
      })
    return () => { cancelled = true }
  }, [packDir, frameName, onStatus])

  // Load palette + calibrations when paletteId changes
  useEffect(() => {
    let cancelled = false
    if (!paletteId) { setPalette(null); setCalibrations({}); return }
    Promise.all([
      loadPalette(packDir, paletteId),
      loadCalibrations(packDir, paletteId),
    ]).then(([p, cal]) => {
      if (cancelled) return
      setPalette(p)
      setCalibrations(cal)
    }).catch(() => {
      if (cancelled) return
      setPalette(null)
      setCalibrations({})
    })
    return () => { cancelled = true }
  }, [packDir, paletteId])

  // Decode source PNG → PixelBuffer when path changes
  useEffect(() => {
    let cancelled = false
    if (!sourcePath) { setSourceBuf(null); return }
    loadPixelBufferFromPath(sourcePath)
      .then(buf => { if (!cancelled) setSourceBuf(buf) })
      .catch(err => {
        if (cancelled) return
        setSourceBuf(null)
        onStatus(`Source decode failed: ${err instanceof Error ? err.message : String(err)}`)
      })
    return () => { cancelled = true }
  }, [sourcePath, onStatus])

  // When palette + source are both ready: hydrate selections from calibration, run auto-detect
  useEffect(() => {
    if (!palette || !sourceBuf || !sourceFilename) {
      setSelections({})
      setAutoBest({})
      setFrameName(null)
      return
    }
    // Tolerate old-shape calibration files: { [src]: { [entryId]: ... } } without a wrapping `entries` key.
    const raw = calibrations[sourceFilename] as unknown
    const isNewShape = !!raw && typeof raw === 'object' && 'entries' in (raw as object)
    const sourceCal = isNewShape ? (raw as SourceCalibration) : null
    const entriesMap: Record<string, EntryCalibration> = sourceCal
      ? sourceCal.entries
      : (raw as Record<string, EntryCalibration> | undefined) ?? {}
    setFrameName(sourceCal?.frame ?? null)

    const sel: Record<string, EntrySelection> = {}
    for (const entry of palette.entries) {
      const cal = entriesMap[entry.id]
      if (cal?.selectedVariantId) {
        sel[entry.id] = cal.selectedVariantId === 'custom'
          ? { variantId: 'custom', customParams: { darkFactor: cal.darkFactor, lightFactor: cal.lightFactor, midpointLow: cal.midpointLow, midpointHigh: cal.midpointHigh } }
          : { variantId: cal.selectedVariantId }
      }
    }
    setSelections(sel)
    setDirty(false)

    const auto: Record<string, string> = {}
    for (const entry of palette.entries) {
      auto[entry.id] = autoDetectBest(sourceBuf, entry, variants).bestVariantId
    }
    setAutoBest(auto)
  }, [palette, sourceBuf, sourceFilename, calibrations, variants])

  const handlePickSource = useCallback(async () => {
    const path = await window.api.openFile([{ name: 'PNG Images', extensions: ['png'] }])
    if (path) setSourcePath(path)
  }, [setSourcePath])

  const handleSelectVariant = useCallback((entryId: string, variantId: string) => {
    setSelections(prev => ({ ...prev, [entryId]: { variantId } }))
    setDirty(true)
  }, [])

  const handleApplyToAll = useCallback((variantId: string) => {
    if (!palette) return
    const next: Record<string, EntrySelection> = {}
    for (const entry of palette.entries) next[entry.id] = { variantId }
    setSelections(next)
    setDirty(true)
  }, [palette])

  const handleApplyAuto = useCallback(() => {
    if (!palette) return
    const next: Record<string, EntrySelection> = {}
    for (const entry of palette.entries) next[entry.id] = { variantId: autoBest[entry.id] ?? variants[0].id }
    setSelections(next)
    setDirty(true)
  }, [palette, autoBest, variants])

  const handleOpenCustom = useCallback((entryId: string) => {
    setCustomDialog({ open: true, entryId })
  }, [])

  const handleApplyCustom = useCallback((params: DuotoneParams) => {
    const entryId = customDialog.entryId
    if (!entryId) return
    setSelections(prev => ({ ...prev, [entryId]: { variantId: 'custom', customParams: params } }))
    setDirty(true)
  }, [customDialog.entryId])

  const handleFrameChange = useCallback((next: string | null) => {
    setFrameName(next)
    setDirty(true)
  }, [])

  const paramsForSelection = useCallback((sel: EntrySelection | undefined, entry: PaletteEntry): DuotoneParams => {
    if (!sel) {
      const v = variants.find(v => v.id === (autoBest[entry.id] ?? variants[0].id)) ?? variants[0]
      return variantToParams(v)
    }
    if (sel.variantId === 'custom' && sel.customParams) return sel.customParams
    const v = variants.find(v => v.id === sel.variantId) ?? variants[0]
    return variantToParams(v)
  }, [variants, autoBest])

  const handleSave = useCallback(async () => {
    if (!palette || !sourceBuf || !sourcePath || !sourceFilename) return
    setSaving(true)
    const outputDir = dirnameFromPath(sourcePath)
    const baseName = basenameFromPath(sourcePath)
    const total = palette.entries.length
    setSaveProgress({ current: 0, total })

    const nextCalForFile: Record<string, EntryCalibration> = {}
    const nowMinute = new Date()
    nowMinute.setSeconds(0, 0)
    const ts = nowMinute.toISOString()

    try {
      for (let i = 0; i < palette.entries.length; i++) {
        const entry = palette.entries[i]
        const sel = selections[entry.id] ?? { variantId: autoBest[entry.id] ?? variants[0].id }
        const params = paramsForSelection(sel, entry)
        const duotoned = applyDuotone(sourceBuf, entry, params)
        const composed = frameBuf ? compositeOnTop(duotoned, frameBuf) : duotoned
        const bytes = await pixelBufferToPngBytes(composed)
        const filename = outputFilename(baseName, palette.id, entry.id)
        await window.api.writeBytes(`${outputDir}/${filename}`, bytes)

        const isAuto = sel.variantId === (autoBest[entry.id] ?? null)
        nextCalForFile[entry.id] = {
          darkFactor: params.darkFactor,
          lightFactor: params.lightFactor,
          midpointLow: params.midpointLow,
          midpointHigh: params.midpointHigh,
          clampBlack: params.clampBlack,
          clampWhite: params.clampWhite,
          selectedVariantId: sel.variantId,
          autoDetected: isAuto,
          lastCalibrated: ts,
        }
        setSaveProgress({ current: i + 1, total })
      }

      const nextSourceCal: SourceCalibration = {
        entries: nextCalForFile,
        ...(frameName ? { frame: frameName } : {}),
      }
      const nextCal: CalibrationFile = { ...calibrations, [sourceFilename]: nextSourceCal }
      await saveCalibrations(packDir, palette.id, nextCal)
      setCalibrations(nextCal)
      setDirty(false)
      onStatus(`Saved ${palette.entries.length} outputs`)
    } catch (err) {
      onStatus(`Save failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
      setSaveProgress(null)
    }
  }, [palette, sourceBuf, sourcePath, sourceFilename, selections, autoBest, variants, calibrations, packDir, paramsForSelection, frameBuf, frameName, onStatus])

  saveRef.current = handleSave

  const customEntry = customDialog.entryId && palette ? palette.entries.find(e => e.id === customDialog.entryId) : null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <Box sx={{ px: 2, py: 1.5, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Tooltip title="Pick source PNG">
          <IconButton size="small" onClick={handlePickSource}><FolderOpenIcon fontSize="small" /></IconButton>
        </Tooltip>
        <TextField
          label="Source"
          size="small"
          value={sourcePath ?? ''}
          InputProps={{ readOnly: true }}
          sx={{ minWidth: 320, flex: 1 }}
        />

        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Palette</InputLabel>
          <Select
            label="Palette"
            value={paletteId ?? ''}
            onChange={e => setPaletteId(e.target.value || null)}
          >
            {summaries.map(s => (
              <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 160 }} disabled={frameOptions.length === 0}>
          <InputLabel>Frame</InputLabel>
          <Select
            label="Frame"
            value={frameName ?? ''}
            onChange={e => handleFrameChange(e.target.value ? String(e.target.value) : null)}
          >
            <MenuItem value=""><em>None</em></MenuItem>
            {frameOptions.map(name => (
              <MenuItem key={name} value={name}>{name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Apply to all</InputLabel>
          <Select
            label="Apply to all"
            value=""
            onChange={e => {
              const v = String(e.target.value)
              if (v === '__auto__') handleApplyAuto()
              else if (v) handleApplyToAll(v)
            }}
            disabled={!palette || !sourceBuf}
          >
            <MenuItem value="__auto__">Use Auto</MenuItem>
            {variants.map(v => (
              <MenuItem key={v.id} value={v.id}>{v.label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box sx={{ flex: 1 }} />

        <Button
          variant="contained"
          size="small"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={!palette || !sourceBuf || saving}
        >
          Save Outputs
        </Button>
      </Box>

      {saving && saveProgress && (
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Writing {saveProgress.current} / {saveProgress.total}
          </Typography>
          <LinearProgress variant="determinate" value={(saveProgress.current / saveProgress.total) * 100} />
        </Box>
      )}

      {/* Body */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 1 }}>
        {!paletteId && (
          <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
            <Typography color="text.disabled">Select a palette to begin.</Typography>
          </Box>
        )}
        {paletteId && !sourcePath && (
          <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
            <Typography color="text.disabled">Pick a source PNG to colorize.</Typography>
          </Box>
        )}
        {palette && sourceBuf && palette.entries.map((entry, idx) => {
          const sel = selections[entry.id]
          const selectedId = sel?.variantId ?? null
          const customParams = sel?.variantId === 'custom' ? sel.customParams ?? null : null
          return (
            <Box key={entry.id}>
              {idx > 0 && <Divider sx={{ my: 1 }} />}
              <Stack direction="row" spacing={2} alignItems="center" sx={{ py: 1 }}>
                <Box sx={{ width: 100, flexShrink: 0 }}>
                  <Typography variant="body2">{entry.name}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {selectedId ?? 'unset'}
                  </Typography>
                </Box>
                <Box sx={{ flexShrink: 0, textAlign: 'center' }}>
                  <RawPreview source={sourceBuf} frame={frameBuf} size={TILE_SIZE} />
                  <Typography variant="caption" sx={{ display: 'block', mt: 0.25, fontSize: '0.6rem', color: 'text.disabled' }}>
                    Original
                  </Typography>
                </Box>
                <Box sx={{ flex: 1, overflow: 'hidden' }}>
                  <VariantGrid
                    source={sourceBuf}
                    entry={entry}
                    variants={variants}
                    selectedId={selectedId}
                    customParams={customParams}
                    autoBestId={autoBest[entry.id] ?? null}
                    frame={frameBuf}
                    tileSize={TILE_SIZE}
                    onSelectVariant={id => handleSelectVariant(entry.id, id)}
                    onOpenCustom={() => handleOpenCustom(entry.id)}
                  />
                </Box>
              </Stack>
            </Box>
          )
        })}
      </Box>

      {customEntry && (
        <CustomVariantDialog
          open={customDialog.open}
          initial={selections[customEntry.id]?.customParams ?? null}
          source={sourceBuf}
          entry={customEntry}
          frame={frameBuf}
          onClose={() => setCustomDialog({ open: false, entryId: null })}
          onApply={handleApplyCustom}
        />
      )}

      <UnsavedChangesDialog
        open={unsavedDialogOpen}
        label="Colorize"
        onSave={handleUnsavedSave}
        onDiscard={handleUnsavedDiscard}
        onCancel={handleUnsavedCancel}
      />
    </Box>
  )
}

export default ColorizeView
