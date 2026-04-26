import React, { useCallback, useMemo, useState } from 'react'
import {
  Box,
  Button,
  ButtonGroup,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import SaveIcon from '@mui/icons-material/Save'
import AddIcon from '@mui/icons-material/Add'
import { FntFile } from '@eriscorp/dalib-ts'
import { useUnsavedGuard } from '../hooks/useUnsavedGuard'
import UnsavedChangesDialog from '../components/UnsavedChangesDialog'
import FontGlyphGrid from '../components/font/FontGlyphGrid'
import FontBlockView from '../components/font/FontBlockView'
import FontPixelEditor from '../components/font/FontPixelEditor'
import AddGlyphDialog from '../components/font/AddGlyphDialog'

const GLYPH_WIDTH = 8
const GLYPH_HEIGHT = 12
const GLYPH_BYTES = GLYPH_HEIGHT // 1 byte per row at 8px wide

type ViewMode = 'grid' | 'block'

const START_CODEPOINT_OPTIONS: { label: string; value: number }[] = [
  { label: "0x21 (DA default — '!')", value: 0x21 },
  { label: "0x20 (' ')", value: 0x20 },
  { label: "0x41 ('A')", value: 0x41 },
  { label: '0x00', value: 0x00 }
]

function deepCopyGlyphs(glyphs: Uint8Array[]): Uint8Array[] {
  return glyphs.map((g) => new Uint8Array(g))
}

function encodeFnt8x12(glyphs: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(glyphs.length * GLYPH_BYTES)
  glyphs.forEach((g, i) => out.set(g, i * GLYPH_BYTES))
  return out
}

const FontEditorPage: React.FC = () => {
  const [path, setPath] = useState<string | null>(null)
  const [glyphs, setGlyphs] = useState<Uint8Array[]>([])
  const [originalGlyphs, setOriginalGlyphs] = useState<Uint8Array[]>([])
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [startCodepoint, setStartCodepoint] = useState<number>(0x21)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  const {
    markDirty,
    markClean,
    saveRef,
    guard,
    dialogOpen,
    handleDialogSave,
    handleDialogDiscard,
    handleDialogCancel
  } = useUnsavedGuard('Font')

  const showStatus = useCallback((msg: string) => {
    setStatusMessage(msg)
    setTimeout(() => setStatusMessage(null), 2500)
  }, [])

  const loadFromPath = useCallback(
    async (filePath: string) => {
      try {
        const buf = await window.api.readFile(filePath)
        const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
        const fnt = FntFile.fromBuffer(bytes, GLYPH_WIDTH, GLYPH_HEIGHT)
        const loaded: Uint8Array[] = []
        for (let i = 0; i < fnt.glyphCount; i++) {
          loaded.push(new Uint8Array(fnt.getGlyphData(i)))
        }
        setPath(filePath)
        setGlyphs(loaded)
        setOriginalGlyphs(deepCopyGlyphs(loaded))
        setSelectedIndex(loaded.length > 0 ? 0 : null)
        setError(null)
        markClean()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to read .fnt')
      }
    },
    [markClean]
  )

  const handleOpen = useCallback(() => {
    guard(async () => {
      const picked = await window.api.openFile([{ name: 'FNT', extensions: ['fnt'] }])
      if (picked) await loadFromPath(picked)
    })
  }, [guard, loadFromPath])

  const handleSave = useCallback(async () => {
    if (!path) return
    try {
      const encoded = encodeFnt8x12(glyphs)
      await window.api.writeBytes(path, encoded)
      setOriginalGlyphs(deepCopyGlyphs(glyphs))
      markClean()
      showStatus('Saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save .fnt')
    }
  }, [glyphs, markClean, path, showStatus])

  saveRef.current = handleSave

  const handlePixelToggle = useCallback(
    (x: number, y: number) => {
      if (selectedIndex === null) return
      setGlyphs((prev) => {
        const next = prev.slice()
        const g = new Uint8Array(next[selectedIndex])
        g[y] = g[y] ^ (1 << (7 - x))
        next[selectedIndex] = g
        return next
      })
      markDirty()
    },
    [markDirty, selectedIndex]
  )

  const handleAppend = useCallback(() => {
    setGlyphs((prev) => [...prev, new Uint8Array(GLYPH_BYTES)])
    setOriginalGlyphs((prev) => [...prev, new Uint8Array(GLYPH_BYTES)])
    setSelectedIndex(glyphs.length)
    markDirty()
  }, [glyphs.length, markDirty])

  const handlePadToCodepoint = useCallback(
    (targetCp: number) => {
      const currentEndCp = startCodepoint + glyphs.length
      const need = targetCp - currentEndCp + 1
      if (need <= 0) return
      const additions: Uint8Array[] = []
      for (let i = 0; i < need; i++) additions.push(new Uint8Array(GLYPH_BYTES))
      setGlyphs((prev) => [...prev, ...additions])
      setOriginalGlyphs((prev) => [...prev, ...additions.map((g) => new Uint8Array(g))])
      setSelectedIndex(glyphs.length + need - 1)
      markDirty()
    },
    [glyphs.length, markDirty, startCodepoint]
  )

  const handleReset = useCallback(() => {
    if (selectedIndex === null) return
    if (selectedIndex >= originalGlyphs.length) return
    setGlyphs((prev) => {
      const next = prev.slice()
      next[selectedIndex] = new Uint8Array(originalGlyphs[selectedIndex])
      return next
    })
    markDirty()
  }, [markDirty, originalGlyphs, selectedIndex])

  const handleClear = useCallback(() => {
    if (selectedIndex === null) return
    setGlyphs((prev) => {
      const next = prev.slice()
      next[selectedIndex] = new Uint8Array(GLYPH_BYTES)
      return next
    })
    markDirty()
  }, [markDirty, selectedIndex])

  const selectedGlyph = selectedIndex !== null ? glyphs[selectedIndex] ?? null : null
  const selectedCodepoint = selectedIndex !== null ? startCodepoint + selectedIndex : null
  const resetDisabled = useMemo(() => {
    if (selectedIndex === null || selectedIndex >= originalGlyphs.length) return true
    const a = glyphs[selectedIndex]
    const b = originalGlyphs[selectedIndex]
    if (!a || !b) return true
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
    return true
  }, [glyphs, originalGlyphs, selectedIndex])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{
          px: 2,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderBottom: '1px solid',
          borderColor: 'divider'
        }}
      >
        <Typography variant="h6" sx={{ mr: 1 }}>
          Font Editor
        </Typography>
        <Tooltip title="Open .fnt">
          <IconButton size="small" onClick={handleOpen}>
            <FolderOpenIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1 }}>
          {path ?? 'No file loaded'}
        </Typography>
        {statusMessage && (
          <Typography variant="caption" sx={{ color: 'success.light', fontWeight: 'bold' }}>
            {statusMessage}
          </Typography>
        )}
        {error && (
          <Typography variant="caption" color="error" sx={{ mr: 1 }}>
            {error}
          </Typography>
        )}
        <Button
          size="small"
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={!path}
        >
          Save
        </Button>
      </Box>

      {path && (
        <Box
          sx={{
            px: 2,
            py: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            borderBottom: '1px solid',
            borderColor: 'divider'
          }}
        >
          <Tooltip title="Add a glyph (pick a Unicode block, see what's missing)">
            <span>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() => setAddDialogOpen(true)}
              >
                Add glyph…
              </Button>
            </span>
          </Tooltip>
          <Divider orientation="vertical" flexItem />
          <ButtonGroup size="small" variant="outlined">
            <Button
              variant={viewMode === 'grid' ? 'contained' : 'outlined'}
              onClick={() => setViewMode('grid')}
            >
              Grid
            </Button>
            <Button
              variant={viewMode === 'block' ? 'contained' : 'outlined'}
              onClick={() => setViewMode('block')}
            >
              By Block
            </Button>
          </ButtonGroup>
          <TextField
            size="small"
            select
            label="Start codepoint"
            value={startCodepoint}
            onChange={(e) => setStartCodepoint(parseInt(e.target.value, 10))}
            sx={{ minWidth: 220 }}
          >
            {START_CODEPOINT_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>
          <Typography variant="caption" color="text.secondary">
            {glyphs.length} glyph{glyphs.length === 1 ? '' : 's'}
          </Typography>
        </Box>
      )}

      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            borderRight: '1px solid',
            borderColor: 'divider'
          }}
        >
          {!path ? (
            <Stack sx={{ p: 4, alignItems: 'center', gap: 2 }}>
              <Typography color="text.secondary">No font loaded.</Typography>
              <Button variant="outlined" startIcon={<FolderOpenIcon />} onClick={handleOpen}>
                Open .fnt
              </Button>
            </Stack>
          ) : viewMode === 'grid' ? (
            <FontGlyphGrid
              glyphs={glyphs}
              startCodepoint={startCodepoint}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              onAppend={() => setAddDialogOpen(true)}
            />
          ) : (
            <FontBlockView
              glyphs={glyphs}
              startCodepoint={startCodepoint}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              onPadToCodepoint={handlePadToCodepoint}
            />
          )}
        </Box>
        <Box sx={{ width: 380, overflow: 'auto' }}>
          <FontPixelEditor
            glyph={selectedGlyph}
            index={selectedIndex}
            codepoint={selectedCodepoint}
            onPixelToggle={handlePixelToggle}
            onReset={handleReset}
            onClear={handleClear}
            resetDisabled={resetDisabled}
          />
        </Box>
      </Box>

      <UnsavedChangesDialog
        open={dialogOpen}
        label="Font"
        onSave={handleDialogSave}
        onDiscard={handleDialogDiscard}
        onCancel={handleDialogCancel}
      />

      <AddGlyphDialog
        open={addDialogOpen}
        startCodepoint={startCodepoint}
        glyphCount={glyphs.length}
        onClose={() => setAddDialogOpen(false)}
        onAppendBlank={handleAppend}
        onPadToCodepoint={handlePadToCodepoint}
      />
    </Box>
  )
}

export default FontEditorPage
