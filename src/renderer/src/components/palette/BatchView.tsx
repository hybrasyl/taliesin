import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Typography,
  Button,
  IconButton,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Stack,
  LinearProgress,
  Divider,
  Paper,
  Alert
} from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { Palette } from '../../utils/paletteTypes'
import { PaletteSummary, scanPalettes, loadPalette } from '../../utils/paletteIO'
import { DEFAULT_VARIANTS } from '../../utils/variants'
import {
  runBatch,
  BatchOptions,
  BatchProgress,
  BatchResult,
  colorizedDir
} from '../../utils/batchPipeline'

interface Props {
  packDir: string
  active: boolean
  onStatus: (msg: string) => void
}

const BatchView: React.FC<Props> = ({ packDir, active, onStatus }) => {
  const [summaries, setSummaries] = useState<PaletteSummary[]>([])
  const [paletteId, setPaletteId] = useState<string>('')
  const [palette, setPalette] = useState<Palette | null>(null)
  const [sourceDir, setSourceDir] = useState<string | null>(null)
  const [sources, setSources] = useState<string[]>([])
  const [options, setOptions] = useState<BatchOptions>({
    useCalibration: true,
    autoDetect: true,
    regenerateMasters: false
  })
  const [overrideId, setOverrideId] = useState<string>('') // '' = none
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<BatchProgress | null>(null)
  const [result, setResult] = useState<BatchResult | null>(null)

  const variants = useMemo(() => palette?.variants ?? DEFAULT_VARIANTS, [palette])

  // Re-scan palettes whenever the tab becomes active so newly-created palettes
  // in the Palettes tab show up without remounting.
  useEffect(() => {
    if (!active) return
    scanPalettes(packDir)
      .then(setSummaries)
      .catch(() => setSummaries([]))
  }, [active, packDir])

  useEffect(() => {
    let cancelled = false
    if (!paletteId) {
      setPalette(null)
      return
    }
    loadPalette(packDir, paletteId)
      .then((p) => {
        if (!cancelled) setPalette(p)
      })
      .catch(() => {
        if (!cancelled) setPalette(null)
      })
    return () => {
      cancelled = true
    }
  }, [packDir, paletteId])

  const handlePickSourceDir = useCallback(async () => {
    const dir = await window.api.openDirectory()
    if (!dir) return
    setSourceDir(dir)
    try {
      const entries = await window.api.listDir(dir)
      const pngs = entries
        .filter((e) => !e.isDirectory && e.name.toLowerCase().endsWith('.png'))
        .map((e) => `${dir}/${e.name}`)
      setSources(pngs)
      if (pngs.length === 0) onStatus(`No PNGs found in ${dir}`)
    } catch (err) {
      setSources([])
      onStatus(`Listing failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [onStatus])

  const totalPairs = useMemo(
    () => sources.length * (palette?.entries.length ?? 0),
    [sources.length, palette]
  )

  const canRun = !running && !!palette && sources.length > 0

  const handleRun = useCallback(async () => {
    if (!palette) return
    setRunning(true)
    setResult(null)
    setProgress(null)
    try {
      const res = await runBatch(
        packDir,
        palette.id,
        sources,
        { ...options, overrideVariantId: overrideId || undefined },
        (p) => setProgress(p)
      )
      setResult(res)
      const okCount = res.manifest.entries.length
      const failCount = res.failures.length
      onStatus(
        failCount > 0
          ? `Batch finished: ${okCount} ok, ${failCount} failed`
          : `Batch finished: ${okCount} outputs`
      )
    } catch (err) {
      onStatus(`Batch failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }, [packDir, palette, sources, options, overrideId, onStatus])

  const progressPct = progress ? (progress.index / Math.max(1, progress.total)) * 100 : 0

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Stack spacing={3} sx={{ maxWidth: 720 }}>
        {/* Source folder */}
        <Stack direction="row" alignItems="center" spacing={2}>
          <Tooltip title="Pick source folder">
            <IconButton onClick={handlePickSourceDir} disabled={running}>
              <FolderOpenIcon />
            </IconButton>
          </Tooltip>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" noWrap>
              {sourceDir ?? 'No source folder selected'}
            </Typography>
            {sourceDir && (
              <Typography variant="caption" color="text.secondary">
                {sources.length} PNG{sources.length === 1 ? '' : 's'}
              </Typography>
            )}
          </Box>
        </Stack>

        {/* Palette */}
        <FormControl size="small" sx={{ maxWidth: 320 }}>
          <InputLabel id="batch-palette-label">Palette</InputLabel>
          <Select
            labelId="batch-palette-label"
            label="Palette"
            value={paletteId}
            onChange={(e) => setPaletteId(e.target.value)}
            disabled={running}
          >
            {summaries.length === 0 ? (
              <MenuItem disabled value="">
                No palettes available
              </MenuItem>
            ) : (
              summaries.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name} ({s.entryCount})
                </MenuItem>
              ))
            )}
          </Select>
        </FormControl>

        {/* Options */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Options
          </Typography>
          <Stack>
            <FormControlLabel
              control={
                <Checkbox
                  checked={options.useCalibration}
                  onChange={(e) =>
                    setOptions((o) => ({ ...o, useCalibration: e.target.checked }))
                  }
                  disabled={running}
                />
              }
              label="Use saved calibration when available"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={options.autoDetect}
                  onChange={(e) => setOptions((o) => ({ ...o, autoDetect: e.target.checked }))}
                  disabled={running}
                />
              }
              label="Auto-detect best variant for uncalibrated pairs"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={options.regenerateMasters}
                  onChange={(e) =>
                    setOptions((o) => ({ ...o, regenerateMasters: e.target.checked }))
                  }
                  disabled={running}
                />
              }
              label="Regenerate grayscale masters (force)"
            />
          </Stack>
          <FormControl size="small" sx={{ mt: 2, minWidth: 240 }}>
            <InputLabel id="batch-override-label">Override variant</InputLabel>
            <Select
              labelId="batch-override-label"
              label="Override variant"
              value={overrideId}
              onChange={(e) => setOverrideId(e.target.value)}
              disabled={running}
            >
              <MenuItem value="">None (use selection chain)</MenuItem>
              {variants.map((v) => (
                <MenuItem key={v.id} value={v.id}>
                  {v.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Paper>

        {/* Run + progress */}
        <Stack direction="row" spacing={2} alignItems="center">
          <Button
            variant="contained"
            startIcon={<PlayArrowIcon />}
            onClick={handleRun}
            disabled={!canRun}
          >
            Run Batch
          </Button>
          <Typography variant="caption" color="text.secondary">
            Output → {colorizedDir(packDir)}
          </Typography>
          {totalPairs > 0 && !running && !result && (
            <Typography variant="caption" color="text.secondary">
              {totalPairs} pair{totalPairs === 1 ? '' : 's'} queued
            </Typography>
          )}
        </Stack>

        {running && (
          <Box>
            <LinearProgress
              variant="determinate"
              value={progressPct}
              sx={{ height: 8, borderRadius: 1 }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              {progress
                ? `${progress.index} / ${progress.total} — ${
                    progress.status === 'rendering'
                      ? `rendering ${progress.entryId}`
                      : progress.status
                  } · ${progress.source.split('/').pop()}`
                : 'Starting…'}
            </Typography>
          </Box>
        )}

        {/* Completion summary */}
        {result && !running && (
          <>
            <Divider />
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Last run
              </Typography>
              <Typography variant="body2">
                {result.manifest.entries.length} output
                {result.manifest.entries.length === 1 ? '' : 's'} ·{' '}
                {result.failures.length} failure{result.failures.length === 1 ? '' : 's'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Manifest: {result.manifestPath}
              </Typography>
              {result.failures.length > 0 && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                    Failures
                  </Typography>
                  <Stack component="ul" sx={{ m: 0, pl: 2 }}>
                    {result.failures.slice(0, 10).map((f, i) => (
                      <Typography
                        key={i}
                        component="li"
                        variant="caption"
                        sx={{ display: 'list-item' }}
                      >
                        {f.source.split('/').pop()} × {f.entryId}: {f.error}
                      </Typography>
                    ))}
                    {result.failures.length > 10 && (
                      <Typography variant="caption" color="text.secondary">
                        … and {result.failures.length - 10} more
                      </Typography>
                    )}
                  </Stack>
                </Alert>
              )}
            </Paper>
          </>
        )}
      </Stack>
    </Box>
  )
}

export default BatchView
