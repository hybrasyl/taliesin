import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box, Typography, Button, IconButton, Tooltip, TextField,
  FormControl, InputLabel, Select, MenuItem, Stack, LinearProgress, Divider,
} from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import SaveIcon from '@mui/icons-material/Save'
import { useRecoilState } from 'recoil'
import { activePaletteIdState, activeColorizeSourceState } from '../../recoil/atoms'
import {
  Palette, PaletteEntry, DuotoneParams, EntryCalibration, CalibrationFile,
} from '../../utils/paletteTypes'
import {
  PaletteSummary, scanPalettes, loadPalette,
  loadCalibrations, saveCalibrations,
  basenameFromPath, filenameFromPath, dirnameFromPath, outputFilename,
} from '../../utils/paletteIO'
import { applyDuotone, PixelBuffer } from '../../utils/duotone'
import { DEFAULT_VARIANTS, variantToParams, autoDetectBest } from '../../utils/variants'
import { loadPixelBufferFromPath, pixelBufferToPngBytes } from '../../utils/imageLoader'
import VariantGrid from './VariantGrid'
import CustomVariantDialog from './CustomVariantDialog'

interface Props {
  packDir: string
  onStatus: (msg: string) => void
}

interface EntrySelection {
  variantId: string  // 'simple' | ... | 'custom'
  customParams?: DuotoneParams
}

const TILE_SIZE = 64

const ColorizeView: React.FC<Props> = ({ packDir, onStatus }) => {
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

  const variants = useMemo(() => palette?.variants ?? DEFAULT_VARIANTS, [palette])
  const sourceFilename = sourcePath ? filenameFromPath(sourcePath) : null

  // Initial palette scan
  useEffect(() => {
    scanPalettes(packDir).then(setSummaries).catch(() => setSummaries([]))
  }, [packDir])

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
      return
    }
    const sel: Record<string, EntrySelection> = {}
    const calForFile = calibrations[sourceFilename] ?? {}
    for (const entry of palette.entries) {
      const cal = calForFile[entry.id]
      if (cal?.selectedVariantId) {
        sel[entry.id] = cal.selectedVariantId === 'custom'
          ? { variantId: 'custom', customParams: { darkFactor: cal.darkFactor, lightFactor: cal.lightFactor, midpointLow: cal.midpointLow, midpointHigh: cal.midpointHigh } }
          : { variantId: cal.selectedVariantId }
      }
    }
    setSelections(sel)

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
  }, [])

  const handleApplyToAll = useCallback((variantId: string) => {
    if (!palette) return
    const next: Record<string, EntrySelection> = {}
    for (const entry of palette.entries) next[entry.id] = { variantId }
    setSelections(next)
  }, [palette])

  const handleApplyAuto = useCallback(() => {
    if (!palette) return
    const next: Record<string, EntrySelection> = {}
    for (const entry of palette.entries) next[entry.id] = { variantId: autoBest[entry.id] ?? variants[0].id }
    setSelections(next)
  }, [palette, autoBest, variants])

  const handleOpenCustom = useCallback((entryId: string) => {
    setCustomDialog({ open: true, entryId })
  }, [])

  const handleApplyCustom = useCallback((params: DuotoneParams) => {
    const entryId = customDialog.entryId
    if (!entryId) return
    setSelections(prev => ({ ...prev, [entryId]: { variantId: 'custom', customParams: params } }))
  }, [customDialog.entryId])

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
        const out = applyDuotone(sourceBuf, entry, params)
        const bytes = await pixelBufferToPngBytes(out)
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

      const nextCal: CalibrationFile = { ...calibrations, [sourceFilename]: nextCalForFile }
      await saveCalibrations(packDir, palette.id, nextCal)
      setCalibrations(nextCal)
      onStatus(`Saved ${palette.entries.length} outputs`)
    } catch (err) {
      onStatus(`Save failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
      setSaveProgress(null)
    }
  }, [palette, sourceBuf, sourcePath, sourceFilename, selections, autoBest, variants, calibrations, packDir, paramsForSelection, onStatus])

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
                <Box sx={{ flex: 1, overflow: 'hidden' }}>
                  <VariantGrid
                    source={sourceBuf}
                    entry={entry}
                    variants={variants}
                    selectedId={selectedId}
                    customParams={customParams}
                    autoBestId={autoBest[entry.id] ?? null}
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
          onClose={() => setCustomDialog({ open: false, entryId: null })}
          onApply={handleApplyCustom}
        />
      )}
    </Box>
  )
}

export default ColorizeView
