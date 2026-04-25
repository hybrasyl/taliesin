import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useRecoilValue } from 'recoil'
import {
  Accordion, AccordionDetails, AccordionSummary,
  Alert, Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, Collapse,
  Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl,
  FormControlLabel, FormGroup, IconButton, InputLabel, List, ListItem,
  ListItemButton, ListItemText, MenuItem, Paper, Select, Switch, Tab,
  Tabs, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ClearIcon from '@mui/icons-material/Clear'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import LockIcon from '@mui/icons-material/Lock'
import LockOpenIcon from '@mui/icons-material/LockOpen'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import ZoomInIcon from '@mui/icons-material/ZoomIn'
import ZoomOutIcon from '@mui/icons-material/ZoomOut'
import ZoomOutMapIcon from '@mui/icons-material/ZoomOutMap'
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk'
import GridOnIcon from '@mui/icons-material/GridOn'
import EditorHeader from '../shared/EditorHeader'
import WarpDialog   from '../shared/WarpDialog'
import ScriptAutocomplete from '../shared/ScriptAutocomplete'
import DimensionPickerDialog from '../catalog/DimensionPickerDialog'
import MapRenderCanvas, { type MapMarker, type MarkerKind } from './MapRenderCanvas'
import { mapFilesDirectoryState, clientPathState } from '../../recoil/atoms'
import {
  ALL_BOARD_TYPES, ALL_DIRECTIONS, ALL_FLAGS, ALL_SPAWN_FLAGS,
  computeMapFilename, DEFAULT_MAP,
  type CardinalDirection, type MapData, type MapFlag,
  type MapNpc, type MapReactor, type MapSign, type MapSpawn, type MapSpawnFlag, type MapSpawnGroup, type MapWarp,
} from '../../data/mapData'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  map: MapData
  initialFileName: string | null
  isArchived: boolean
  isExisting: boolean
  warnings?: string[]
  mapNames: string[]
  npcNames: string[]
  worldMapNames: string[]
  spawnGroupNames: string[]
  onSave: (data: MapData, fileName: string) => Promise<void>
  onArchive?: () => void
  onUnarchive?: () => void
  onDirtyChange: (dirty: boolean) => void
  saveRef: React.MutableRefObject<(() => Promise<void>) | null>
}

// ── NPC placement dialog ──────────────────────────────────────────────────────

interface NpcDialogProps {
  open: boolean
  tileX: number
  tileY: number
  initial: MapNpc | null
  npcNames: string[]
  onConfirm: (npc: MapNpc) => void
  onCancel: () => void
}

function NpcDialog({ open, tileX, tileY, initial, npcNames, onConfirm, onCancel }: NpcDialogProps) {
  const [name, setName]               = useState(initial?.name ?? '')
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '')
  const [direction, setDirection]     = useState<CardinalDirection>(initial?.direction ?? 'South')

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '')
      setDisplayName(initial?.displayName ?? '')
      setDirection(initial?.direction ?? 'South')
    }
  }, [open, initial])

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>
        {initial ? 'Edit NPC' : 'Place NPC'}
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>({tileX}, {tileY})</Typography>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Autocomplete
            options={npcNames} freeSolo value={name}
            onInputChange={(_, v) => setName(v)}
            renderInput={params => (
              <TextField {...params} label="NPC Name" size="small" required
                helperText="Must match an NPC definition in the library" />
            )}
          />
          <TextField label="Display Name" size="small" fullWidth
            value={displayName} onChange={e => setDisplayName(e.target.value)}
            helperText="Optional — overrides the NPC's default display name" />
          <FormControl size="small" fullWidth>
            <InputLabel>Facing Direction</InputLabel>
            <Select label="Facing Direction" value={direction}
              onChange={e => setDirection(e.target.value as CardinalDirection)}>
              {ALL_DIRECTIONS.map(d => <MenuItem key={d} value={d}>{d}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained"
          onClick={() => onConfirm({ name: name.trim(), displayName: displayName.trim() || undefined, direction, x: tileX, y: tileY })}
          disabled={!name.trim()}>
          {initial ? 'Save' : 'Place'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Sign placement dialog ─────────────────────────────────────────────────────

interface SignDialogProps {
  open: boolean
  tileX: number
  tileY: number
  initial: MapSign | null
  onConfirm: (sign: MapSign) => void
  onCancel: () => void
}

function SignDialog({ open, tileX, tileY, initial, onConfirm, onCancel }: SignDialogProps) {
  const [type,           setType]           = useState(initial?.type ?? 'Signpost')
  const [boardKey,       setBoardKey]       = useState(initial?.boardKey ?? '')
  const [name,           setName]           = useState(initial?.name ?? '')
  const [description,    setDescription]    = useState(initial?.description ?? '')
  const [message,        setMessage]        = useState(initial?.message ?? '')
  const [script,         setScript]         = useState(initial?.script ?? '')
  const [onEntry,        setOnEntry]        = useState(String(initial?.effect?.onEntry ?? ''))
  const [onEntrySpeed,   setOnEntrySpeed]   = useState(String(initial?.effect?.onEntrySpeed ?? ''))

  useEffect(() => {
    if (open) {
      setType(initial?.type ?? 'Signpost')
      setBoardKey(initial?.boardKey ?? '')
      setName(initial?.name ?? '')
      setDescription(initial?.description ?? '')
      setMessage(initial?.message ?? '')
      setScript(initial?.script ?? '')
      setOnEntry(String(initial?.effect?.onEntry ?? ''))
      setOnEntrySpeed(String(initial?.effect?.onEntrySpeed ?? ''))
    }
  }, [open, initial])

  const isBoard = type.toLowerCase() === 'messageboard'

  const buildEffect = () => {
    if (!onEntry.trim()) return undefined
    const e: import('../../data/mapData').MapSignEffect = { onEntry: parseInt(onEntry, 10) }
    if (onEntrySpeed.trim()) e.onEntrySpeed = parseInt(onEntrySpeed, 10)
    return e
  }

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>
        {initial ? 'Edit Sign' : 'Place Sign'}
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>({tileX}, {tileY})</Typography>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <FormControl size="small" fullWidth>
            <InputLabel>Sign Type</InputLabel>
            <Select label="Sign Type" value={type} onChange={e => setType(e.target.value)}>
              {ALL_BOARD_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </Select>
          </FormControl>
          {isBoard && (
            <TextField label="Board Key" size="small" fullWidth value={boardKey} onChange={e => setBoardKey(e.target.value)} helperText="Unique key identifying this board" />
          )}
          <TextField label="Name"        size="small" fullWidth value={name}        onChange={e => setName(e.target.value)} />
          <TextField label="Description" size="small" fullWidth value={description} onChange={e => setDescription(e.target.value)} />
          <TextField label="Message" size="small" fullWidth multiline rows={3} value={message} onChange={e => setMessage(e.target.value)} helperText="Text displayed when a player reads the sign" />
          <ScriptAutocomplete label="Script" value={script} onChange={setScript} helperText="Optional — Lua script executed when a player interacts" />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <TextField label="On Entry Effect" size="small" type="number" value={onEntry} onChange={e => setOnEntry(e.target.value)} helperText="Animation ID on player entry" />
            <TextField label="Entry Speed" size="small" type="number" value={onEntrySpeed} onChange={e => setOnEntrySpeed(e.target.value)} helperText="Default 100" />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" onClick={() => onConfirm({
          type, x: tileX, y: tileY,
          boardKey: boardKey.trim() || undefined,
          name: name.trim() || undefined,
          description: description.trim() || undefined,
          message: message.trim() || undefined,
          script: script.trim() || undefined,
          effect: buildEffect(),
        })}>
          {initial ? 'Save' : 'Place'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Reactor placement dialog ──────────────────────────────────────────────────

interface ReactorDialogProps {
  open: boolean
  tileX: number
  tileY: number
  initial: MapReactor | null
  onConfirm: (reactor: MapReactor) => void
  onCancel: () => void
}

function ReactorDialog({ open, tileX, tileY, initial, onConfirm, onCancel }: ReactorDialogProps) {
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [script,      setScript]      = useState(initial?.script ?? '')

  useEffect(() => {
    if (open) {
      setDisplayName(initial?.displayName ?? '')
      setDescription(initial?.description ?? '')
      setScript(initial?.script ?? '')
    }
  }, [open, initial])

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>
        {initial ? 'Edit Reactor' : 'Place Reactor'}
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>({tileX}, {tileY})</Typography>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField label="Display Name" size="small" fullWidth
            value={displayName} onChange={e => setDisplayName(e.target.value)}
            helperText="Name shown to players who examine the tile" />
          <TextField label="Description" size="small" fullWidth
            value={description} onChange={e => setDescription(e.target.value)} />
          <ScriptAutocomplete label="Script" value={script} onChange={setScript} helperText="Lua script executed when a player steps on the tile" />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained"
          onClick={() => onConfirm({
            x: tileX, y: tileY,
            displayName: displayName.trim() || undefined,
            description: description.trim() || undefined,
            script: script.trim() || undefined,
          })}
          disabled={!script.trim()}>
          {initial ? 'Save' : 'Place'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Music ID field with play/stop preview ────────────────────────────────────

export function MusicIdField({
  value, onChange, clientPath,
}: {
  value: number | undefined
  onChange: (v: number | undefined) => void
  clientPath: string | null
}) {
  const [text, setText] = useState(value != null ? String(value) : '')
  const [availableIds, setAvailableIds] = useState<Set<number>>(new Set())
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  useEffect(() => {
    setText(value != null ? String(value) : '')
  }, [value])

  // Probe which {id}.mus files exist in the client's music directory.
  useEffect(() => {
    let cancelled = false
    if (!clientPath) { setAvailableIds(new Set()); return }
    window.api.musicClientScan(clientPath).then(entries => {
      if (cancelled) return
      const ids = new Set<number>()
      for (const e of entries) {
        const m = e.filename.match(/^(\d+)\.mus$/i)
        if (m) ids.add(parseInt(m[1], 10))
      }
      setAvailableIds(ids)
    }).catch(() => { if (!cancelled) setAvailableIds(new Set()) })
    return () => { cancelled = true }
  }, [clientPath])

  // Stop + revoke on unmount or when the selected music ID changes.
  const stop = useCallback(() => {
    audioRef.current?.pause()
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null }
    setPlaying(false)
  }, [])
  useEffect(() => stop, [stop])
  useEffect(() => { stop() }, [value, stop])

  const handleTextChange = (raw: string) => {
    setText(raw)
    if (raw === '') { onChange(undefined); return }
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n)) return
    const clamped = Math.max(1, Math.min(256, n))
    onChange(clamped)
  }

  const handleClear = () => { setText(''); onChange(undefined) }

  const fileExists = value != null && availableIds.has(value)
  const playDisabled = !fileExists || !clientPath

  const handleTogglePlay = useCallback(async () => {
    if (playing) { stop(); return }
    if (value == null || !clientPath) return
    setError(null)
    try {
      const sep = clientPath.includes('\\') ? '\\' : '/'
      const path = `${clientPath}${sep}music${sep}${value}.mus`
      const buf = await window.api.readFile(path)
      const blob = new Blob([new Uint8Array(buf)], { type: 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = url
      if (!audioRef.current) audioRef.current = new Audio()
      audioRef.current.src = url
      audioRef.current.onended = () => setPlaying(false)
      audioRef.current.onerror = () => { setPlaying(false); setError('Playback failed') }
      await audioRef.current.play()
      setPlaying(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to play music')
      setPlaying(false)
    }
  }, [playing, value, clientPath, stop])

  const playTooltip = !clientPath
    ? 'Set a client path in Settings to preview music'
    : value == null ? 'Set a Music Id to preview'
    : !fileExists  ? `${value}.mus not found in client/music`
    : playing ? 'Stop preview' : 'Preview music'

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
      <TextField
        label="Music Id" size="small" type="number"
        sx={{ width: 100 }}
        value={text}
        placeholder="None"
        inputProps={{ min: 1, max: 256 }}
        onChange={e => handleTextChange(e.target.value)}
        error={!!error}
        helperText={error ?? undefined}
      />
      <Tooltip title="Clear (no music)">
        <span>
          <IconButton size="small" onClick={handleClear} disabled={value == null}>
            <ClearIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={playTooltip}>
        <span>
          <IconButton size="small" onClick={handleTogglePlay} disabled={playDisabled}
            color={playing ? 'secondary' : 'default'}>
            {playing ? <StopIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  )
}

// ── Tab 1: Properties + Flags + SpawnGroup ───────────────────────────────────

function MapFieldsTab({
  data, spawnGroupNames, onChange,
}: {
  data: MapData
  spawnGroupNames: string[]
  onChange: (patch: Partial<MapData> | ((prev: MapData) => MapData)) => void
}) {
  const mapDirectory = useRecoilValue(mapFilesDirectoryState)
  const clientPath   = useRecoilValue(clientPathState)

  const set = <K extends keyof MapData>(key: K, value: MapData[K]) => onChange({ [key]: value } as Partial<MapData>)

  const toggleFlag = (flag: MapFlag, checked: boolean) =>
    onChange(prev => ({ ...prev, flags: checked ? [...prev.flags, flag] : prev.flags.filter(f => f !== flag) }))

  // Map ID lock — editable only after intentional unlock
  const [idEditable, setIdEditable] = useState(false)

  // Dimension picker state
  const [dimPickerOpen, setDimPickerOpen] = useState(false)
  const [dimBuffer,     setDimBuffer]     = useState<Uint8Array | null>(null)
  const [loadingDim,    setLoadingDim]    = useState(false)

  const dimBinName = data.id >= 30000
    ? `hyb${String(data.id).padStart(5, '0')}.map`
    : `lod${String(data.id).padStart(5, '0')}.map`

  const handleOpenDimPicker = async () => {
    if (!mapDirectory || !data.id) return
    setLoadingDim(true)
    try {
      const raw = await window.api.readFile(`${mapDirectory}/${dimBinName}`)
      setDimBuffer(new Uint8Array(raw))
      setDimPickerOpen(true)
    } catch {
      // binary not found — dimensions already shown from loaded XML
    } finally {
      setLoadingDim(false)
    }
  }

  // SpawnGroup helpers
  const sgNameHint = `Spn_${data.name.replace(/\s+/g, '')}`

  const setSg = (patch: Partial<MapSpawnGroup>) =>
    onChange(prev => ({ ...prev, spawnGroup: { ...(prev.spawnGroup ?? { name: '', baseLevel: 1, spawns: [] }), ...patch } }))

  const addSpawnGroup = () =>
    onChange(prev => ({ ...prev, spawnGroup: { name: sgNameHint, baseLevel: 1, spawns: [{ import: '', flags: ['Active'] as MapSpawnFlag[] }] } }))

  const removeSpawnGroup = () =>
    onChange(prev => ({ ...prev, spawnGroup: undefined }))

  const addSpawn = () =>
    onChange(prev => ({ ...prev, spawnGroup: { ...prev.spawnGroup!, spawns: [...prev.spawnGroup!.spawns, { import: '', flags: ['Active'] as MapSpawnFlag[] }] } }))

  const updateSpawn = (i: number, s: MapSpawn) =>
    onChange(prev => ({ ...prev, spawnGroup: { ...prev.spawnGroup!, spawns: prev.spawnGroup!.spawns.map((x, idx) => idx === i ? s : x) } }))

  const removeSpawn = (i: number) =>
    onChange(prev => ({ ...prev, spawnGroup: { ...prev.spawnGroup!, spawns: prev.spawnGroup!.spawns.filter((_, idx) => idx !== i) } }))

  const toggleSpawnFlag = (i: number, flag: MapSpawnFlag) => {
    const spawn = data.spawnGroup!.spawns[i]
    const next = spawn.flags.includes(flag) ? spawn.flags.filter(f => f !== flag) : [...spawn.flags, flag]
    updateSpawn(i, { ...spawn, flags: next })
  }

  return (
    <Box sx={{ overflow: 'auto', flex: 1 }}>

      {/* Properties */}
      <Paper variant="outlined" sx={{ mb: 1, p: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Properties</Typography>

        {/* Row 1: Name + Map ID (locked by default) */}
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'flex-start' }}>
          <TextField label="Name" size="small" sx={{ flex: 1 }}
            value={data.name} onChange={e => set('name', e.target.value)} />
          <TextField label="Map Id" size="small" type="number" sx={{ width: 110 }}
            value={data.id} disabled={!idEditable}
            onChange={e => set('id', parseInt(e.target.value, 10) || 0)} />
          <Tooltip title={idEditable ? 'Lock Map ID' : 'Unlock to edit Map ID'}>
            <IconButton size="small" sx={{ mt: 0.5 }} onClick={() => setIdEditable(v => !v)}
              color={idEditable ? 'warning' : 'default'}>
              {idEditable ? <LockOpenIcon fontSize="small" /> : <LockIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>

        {/* Row 2: Dimension picker + Music ID + Enabled + Casting */}
        <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <Tooltip title={
            !mapDirectory ? 'Configure a map directory in Settings to use the picker'
            : !data.id    ? 'Set a Map ID first'
            : `Load dimensions from ${dimBinName}`
          }>
            <span>
              <Button variant="outlined" size="small"
                onClick={handleOpenDimPicker}
                disabled={!mapDirectory || !data.id || loadingDim}
                startIcon={loadingDim ? <CircularProgress size={14} /> : undefined}
                sx={{ minWidth: 110, fontFamily: 'monospace', flexShrink: 0 }}>
                {data.x > 0 && data.y > 0 ? `${data.x} × ${data.y}` : 'Set dims…'}
              </Button>
            </span>
          </Tooltip>
          <MusicIdField
            value={data.music}
            onChange={v => set('music', v)}
            clientPath={clientPath}
          />
          <FormControlLabel
            control={<Switch size="small" checked={data.isEnabled}    onChange={e => set('isEnabled',    e.target.checked)} />}
            label="Map Enabled" />
          <FormControlLabel
            control={<Switch size="small" checked={data.allowCasting} onChange={e => set('allowCasting', e.target.checked)} />}
            label="Casting" />
          <FormControlLabel
            control={<Switch size="small" checked={data.dynamicLighting} onChange={e => set('dynamicLighting', e.target.checked)} />}
            label="Dynamic Lighting" />
        </Box>

        {/* Description — direct child element only (not reactor/sign descriptions) */}
        <TextField label="Description" size="small" fullWidth multiline rows={2}
          value={data.description ?? ''}
          onChange={e => set('description', e.target.value || undefined)} />
      </Paper>

      {/* Flags — accordion so they don't take up constant vertical space */}
      <Accordion disableGutters variant="outlined" sx={{ mb: 1, '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}
          sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5, alignItems: 'center' } }}>
          <Typography variant="subtitle2" sx={{ flex: 1 }}>Flags</Typography>
          {data.flags.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
              {data.flags.join(', ')}
            </Typography>
          )}
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0, pb: 1 }}>
          <FormGroup row sx={{ gap: 0.5 }}>
            {ALL_FLAGS.map(f => (
              <FormControlLabel key={f}
                control={<Checkbox size="small" checked={data.flags.includes(f)}
                  onChange={e => toggleFlag(f, e.target.checked)} />}
                label={<Typography variant="body2">{f}</Typography>} />
            ))}
          </FormGroup>
        </AccordionDetails>
      </Accordion>

      {/* SpawnGroup — accordion; Add button seeds one spawn entry immediately */}
      <Accordion disableGutters variant="outlined" sx={{ '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}
          sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5, alignItems: 'center' } }}>
          <Typography variant="subtitle2" sx={{ flex: 1 }}>
            Spawn Group{data.spawnGroup?.name ? `: ${data.spawnGroup.name}` : ''}
          </Typography>
          {!data.spawnGroup && (
            <Button size="small" startIcon={<AddIcon />}
              onClick={e => { e.stopPropagation(); addSpawnGroup() }}
              sx={{ mr: 1 }}>
              Add
            </Button>
          )}
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 1 }}>
          {!data.spawnGroup ? (
            <Typography variant="body2" color="text.secondary">No spawn group configured.</Typography>
          ) : (
            <>
              {/* Group-level fields */}
              <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5 }}>
                <TextField label="Group Name" size="small" sx={{ flex: 1 }}
                  value={data.spawnGroup.name}
                  onChange={e => setSg({ name: e.target.value })}
                  placeholder={sgNameHint} />
                <TextField label="Base Level" size="small" type="number" sx={{ width: 100 }}
                  value={data.spawnGroup.baseLevel}
                  onChange={e => setSg({ baseLevel: Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1)) })}
                  inputProps={{ min: 1, max: 99 }}
                  helperText="1 – 99" />
              </Box>

              {/* Spawn entries — each as a self-contained card */}
              {data.spawnGroup.spawns.map((spawn, i) => (
                <Paper key={i} variant="outlined" sx={{ p: 1, mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                    <Autocomplete
                      freeSolo options={spawnGroupNames} value={spawn.import} size="small"
                      onInputChange={(_, v) => updateSpawn(i, { ...spawn, import: v })}
                      sx={{ flex: 1 }}
                      renderInput={params => <TextField {...params} label="Import" size="small" />}
                    />
                    <IconButton size="small" onClick={() => removeSpawn(i)}>
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {ALL_SPAWN_FLAGS.map(flag => (
                      <Chip key={flag} label={flag} size="small" clickable
                        color={spawn.flags.includes(flag) ? 'primary' : 'default'}
                        onClick={() => toggleSpawnFlag(i, flag)} />
                    ))}
                  </Box>
                </Paper>
              ))}

              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                <Button size="small" startIcon={<AddIcon />} onClick={addSpawn}>Add Spawn</Button>
                <Button size="small" color="error" onClick={removeSpawnGroup}>Remove Group</Button>
              </Box>
            </>
          )}
        </AccordionDetails>
      </Accordion>

      <Box sx={{ pb: 4 }} />

      {/* Dimension picker dialog */}
      {dimBuffer && (
        <DimensionPickerDialog
          open={dimPickerOpen}
          filename={dimBinName}
          fileBuffer={dimBuffer}
          clientPath={clientPath}
          onConfirm={(w, h) => { onChange({ x: w, y: h }); setDimPickerOpen(false) }}
          onCancel={() => setDimPickerOpen(false)}
        />
      )}
    </Box>
  )
}

// ── Tab 2: Placement canvas ───────────────────────────────────────────────────

type PlaceMode  = 'none' | 'warp-map' | 'warp-worldmap' | 'npc' | 'sign' | 'reactor'
type SelMarker  = { kind: MarkerKind; index: number } | null

type DialogState =
  | { kind: 'npc';     tileX: number; tileY: number; editIndex?: number }
  | { kind: 'warp';    tileX: number; tileY: number; editIndex?: number; defaultType?: 'map' | 'worldmap' }
  | { kind: 'sign';    tileX: number; tileY: number; editIndex?: number }
  | { kind: 'reactor'; tileX: number; tileY: number; editIndex?: number }
  | null

const ZOOM_LEVELS = [0.25, 0.4, 0.6, 0.85, 1.2, 1.8]

function MapPlacementTab({
  data, mapNames, npcNames, worldMapNames, onChange,
}: {
  data: MapData
  mapNames: string[]
  npcNames: string[]
  worldMapNames: string[]
  onChange: (patch: Partial<MapData> | ((prev: MapData) => MapData)) => void
}) {
  // Access rendering assets from atoms — same as CatalogPage
  const clientPath   = useRecoilValue(clientPathState)
  const mapDirectory = useRecoilValue(mapFilesDirectoryState)

  const [zoomIdx,         setZoomIdx]         = useState(1)
  const [placeMode,       setPlaceMode]       = useState<PlaceMode>('none')
  const [selected,        setSelected]        = useState<SelMarker>(null)
  const [dialogState,     setDialogState]     = useState<DialogState>(null)
  const [showPassability, setShowPassability] = useState(false)
  const [showGrid,        setShowGrid]        = useState(false)
  const [hoverCoord,      setHoverCoord]      = useState<{ tx: number; ty: number } | null>(null)

  const zoom = ZOOM_LEVELS[zoomIdx]

  // Build flat marker list for MapRenderCanvas
  const markers: MapMarker[] = [
    ...data.warps   .map((w, i): MapMarker => ({ kind: 'warp',    index: i, x: w.x, y: w.y })),
    ...data.npcs    .map((n, i): MapMarker => ({ kind: 'npc',     index: i, x: n.x, y: n.y })),
    ...data.signs   .map((s, i): MapMarker => ({ kind: 'sign',    index: i, x: s.x, y: s.y })),
    ...data.reactors.map((r, i): MapMarker => ({ kind: 'reactor', index: i, x: r.x, y: r.y })),
  ]

  const handleTileClick = (tx: number, ty: number) => {
    if (placeMode === 'none') return
    if (placeMode === 'warp-map')      { setDialogState({ kind: 'warp', tileX: tx, tileY: ty, defaultType: 'map' });      setPlaceMode('none'); return }
    if (placeMode === 'warp-worldmap') { setDialogState({ kind: 'warp', tileX: tx, tileY: ty, defaultType: 'worldmap' }); setPlaceMode('none'); return }
    setDialogState({ kind: placeMode, tileX: tx, tileY: ty })
    setPlaceMode('none')
  }

  const openEdit = (kind: MarkerKind, index: number) => {
    const item = kind === 'warp' ? data.warps[index]
      : kind === 'npc'     ? data.npcs[index]
      : kind === 'sign'    ? data.signs[index]
      : data.reactors[index]
    if (!item) return
    setDialogState({ kind, tileX: item.x, tileY: item.y, editIndex: index })
  }

  const removeItem = (kind: MarkerKind, index: number) => {
    if (kind === 'warp')         onChange(prev => ({ ...prev, warps:    prev.warps   .filter((_, i) => i !== index) }))
    else if (kind === 'npc')     onChange(prev => ({ ...prev, npcs:     prev.npcs    .filter((_, i) => i !== index) }))
    else if (kind === 'sign')    onChange(prev => ({ ...prev, signs:    prev.signs   .filter((_, i) => i !== index) }))
    else if (kind === 'reactor') onChange(prev => ({ ...prev, reactors: prev.reactors.filter((_, i) => i !== index) }))
    if (selected?.kind === kind && selected.index === index) setSelected(null)
  }

  const confirmNpc = (npc: MapNpc) => {
    const ds = dialogState; if (!ds || ds.kind !== 'npc') return
    if (ds.editIndex !== undefined) {
      onChange(prev => ({ ...prev, npcs: prev.npcs.map((n, i) => i === ds.editIndex ? npc : n) }))
      setSelected({ kind: 'npc', index: ds.editIndex })
    } else {
      onChange(prev => { const next = { ...prev, npcs: [...prev.npcs, npc] }; setSelected({ kind: 'npc', index: next.npcs.length - 1 }); return next })
    }
    setDialogState(null)
  }

  const confirmWarp = (warp: MapWarp) => {
    const ds = dialogState; if (!ds || ds.kind !== 'warp') return
    if (ds.editIndex !== undefined) {
      onChange(prev => ({ ...prev, warps: prev.warps.map((w, i) => i === ds.editIndex ? warp : w) }))
      setSelected({ kind: 'warp', index: ds.editIndex })
    } else {
      onChange(prev => { const next = { ...prev, warps: [...prev.warps, warp] }; setSelected({ kind: 'warp', index: next.warps.length - 1 }); return next })
    }
    setDialogState(null)
  }

  const confirmSign = (sign: MapSign) => {
    const ds = dialogState; if (!ds || ds.kind !== 'sign') return
    if (ds.editIndex !== undefined) {
      onChange(prev => ({ ...prev, signs: prev.signs.map((s, i) => i === ds.editIndex ? sign : s) }))
      setSelected({ kind: 'sign', index: ds.editIndex })
    } else {
      onChange(prev => { const next = { ...prev, signs: [...prev.signs, sign] }; setSelected({ kind: 'sign', index: next.signs.length - 1 }); return next })
    }
    setDialogState(null)
  }

  const confirmReactor = (reactor: MapReactor) => {
    const ds = dialogState; if (!ds || ds.kind !== 'reactor') return
    if (ds.editIndex !== undefined) {
      onChange(prev => ({ ...prev, reactors: prev.reactors.map((r, i) => i === ds.editIndex ? reactor : r) }))
      setSelected({ kind: 'reactor', index: ds.editIndex })
    } else {
      onChange(prev => { const next = { ...prev, reactors: [...prev.reactors, reactor] }; setSelected({ kind: 'reactor', index: next.reactors.length - 1 }); return next })
    }
    setDialogState(null)
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', gap: 1 }}>
      {/* Toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
        <Typography variant="caption" color="text.secondary">{data.x}×{data.y}</Typography>
        {!clientPath && (
          <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
            (schematic — set Client path in Settings for full render)
          </Typography>
        )}
        <Divider orientation="vertical" flexItem />
        <Tooltip title="Zoom out"><span>
          <IconButton size="small" onClick={() => setZoomIdx(i => Math.max(0, i - 1))} disabled={zoomIdx === 0}>
            <ZoomOutIcon fontSize="small" />
          </IconButton>
        </span></Tooltip>
        <Typography variant="caption" sx={{ minWidth: 38, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </Typography>
        <Tooltip title="Zoom in"><span>
          <IconButton size="small" onClick={() => setZoomIdx(i => Math.min(ZOOM_LEVELS.length - 1, i + 1))} disabled={zoomIdx === ZOOM_LEVELS.length - 1}>
            <ZoomInIcon fontSize="small" />
          </IconButton>
        </span></Tooltip>
        <Tooltip title="Fit (reset zoom)">
          <IconButton size="small" onClick={() => setZoomIdx(1)}><ZoomOutMapIcon fontSize="small" /></IconButton>
        </Tooltip>
        <Divider orientation="vertical" flexItem />
        <Tooltip title={showGrid ? 'Hide grid' : 'Show grid'}>
          <IconButton size="small" onClick={() => setShowGrid(v => !v)} color={showGrid ? 'info' : 'default'}>
            <GridOnIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={showPassability ? 'Hide passability overlay' : 'Show passability overlay (requires DA client path)'}>
          <IconButton size="small" onClick={() => setShowPassability(v => !v)} color={showPassability ? 'warning' : 'default'}>
            <DirectionsWalkIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Divider orientation="vertical" flexItem />
        <Typography variant="caption" color="text.secondary">Place:</Typography>
        {([
          { mode: 'warp-map',      label: 'Map Warp' },
          { mode: 'warp-worldmap', label: 'World Warp' },
          { mode: 'npc',           label: 'NPC' },
          { mode: 'sign',          label: 'Sign' },
          { mode: 'reactor',       label: 'Reactor' },
        ] as { mode: PlaceMode; label: string }[]).map(({ mode, label }) => (
          <Chip key={mode} label={label} size="small" clickable
            color={placeMode === mode ? 'primary' : 'default'}
            onClick={() => setPlaceMode(p => p === mode ? 'none' : mode)}
          />
        ))}
        {placeMode !== 'none' && (
          <Typography variant="caption" color="primary" sx={{ fontStyle: 'italic' }}>Click map to place</Typography>
        )}
        <Box sx={{ ml: 'auto' }}>
          <Typography variant="caption" color="text.secondary"
            sx={{ fontFamily: 'monospace', minWidth: 72, display: 'inline-block', textAlign: 'right' }}>
            {hoverCoord ? `(${hoverCoord.tx}, ${hoverCoord.ty})` : ''}
          </Typography>
        </Box>
      </Box>
      <Divider />

      {/* Main area: canvas + items panel */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', gap: 1 }}>
        {/* Rendered map canvas */}
        <MapRenderCanvas
          mapId={data.id}
          mapWidth={data.x}
          mapHeight={data.y}
          mapDirectory={mapDirectory}
          clientPath={clientPath}
          zoom={zoom}
          markers={markers}
          selectedMarker={selected}
          placeMode={placeMode !== 'none'}
          showPassability={showPassability}
          showGrid={showGrid}
          onTileClick={handleTileClick}
          onMarkerClick={(kind, index) => setSelected(s => s?.kind === kind && s.index === index ? null : { kind, index })}
          onHoverTile={setHoverCoord}
          sx={{ flex: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}
        />

        {/* Items panel */}
        <Box sx={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: 1 }}>
          {/* Legend */}
          <Paper variant="outlined" sx={{ p: 1, flexShrink: 0 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
              {[
                { color: '#2196f3', label: 'Map Warp' },
                { color: '#03a9f4', label: 'World Warp' },
                { color: '#4caf50', label: 'NPC' },
                { color: '#ffc107', label: 'Sign' },
                { color: '#9c27b0', label: 'Reactor' },
              ].map(({ color, label }) => (
                <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
                  <Typography variant="caption" noWrap>{label}</Typography>
                </Box>
              ))}
            </Box>
          </Paper>

          {/* Items list */}
          <Box sx={{ flex: 1, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <ItemsGroup label="Map Warps" color="#2196f3"
              count={data.warps.filter(w => w.targetType === 'map').length}
              onAdd={() => setPlaceMode('warp-map')}
              items={data.warps.flatMap((w, i) => w.targetType !== 'map' ? [] : [{
                key: i, label: `(${w.x},${w.y}) → ${w.mapTargetName || '?'}`,
                selected: selected?.kind === 'warp' && selected.index === i,
                onSelect: () => setSelected(s => s?.kind === 'warp' && s.index === i ? null : { kind: 'warp', index: i }),
                onEdit: () => openEdit('warp', i), onRemove: () => removeItem('warp', i),
              }])} />
            <Divider />
            <ItemsGroup label="World Warps" color="#03a9f4"
              count={data.warps.filter(w => w.targetType === 'worldmap').length}
              onAdd={() => setPlaceMode('warp-worldmap')}
              items={data.warps.flatMap((w, i) => w.targetType !== 'worldmap' ? [] : [{
                key: i, label: `(${w.x},${w.y}) → ${w.worldMapTarget || '?'}`,
                selected: selected?.kind === 'warp' && selected.index === i,
                onSelect: () => setSelected(s => s?.kind === 'warp' && s.index === i ? null : { kind: 'warp', index: i }),
                onEdit: () => openEdit('warp', i), onRemove: () => removeItem('warp', i),
              }])} />
            <Divider />
            <ItemsGroup label="NPCs" color="#4caf50" count={data.npcs.length}
              onAdd={() => setPlaceMode('npc')}
              items={data.npcs.map((n, i) => ({
                key: i, label: `(${n.x},${n.y}) ${n.name || '?'}`,
                selected: selected?.kind === 'npc' && selected.index === i,
                onSelect: () => setSelected(s => s?.kind === 'npc' && s.index === i ? null : { kind: 'npc', index: i }),
                onEdit: () => openEdit('npc', i), onRemove: () => removeItem('npc', i),
              }))} />
            <Divider />
            <ItemsGroup label="Signs" color="#ffc107" count={data.signs.length}
              onAdd={() => setPlaceMode('sign')}
              items={data.signs.map((s, i) => ({
                key: i, label: `(${s.x},${s.y}) [${s.type}]${s.name ? ` ${s.name}` : ''}`,
                selected: selected?.kind === 'sign' && selected.index === i,
                onSelect: () => setSelected(s2 => s2?.kind === 'sign' && s2.index === i ? null : { kind: 'sign', index: i }),
                onEdit: () => openEdit('sign', i), onRemove: () => removeItem('sign', i),
              }))} />
            <Divider />
            <ItemsGroup label="Reactors" color="#9c27b0" count={data.reactors.length}
              onAdd={() => setPlaceMode('reactor')}
              items={data.reactors.map((r, i) => ({
                key: i, label: `(${r.x},${r.y})${r.displayName ? ` ${r.displayName}` : r.script ? ` [${r.script}]` : ''}`,
                selected: selected?.kind === 'reactor' && selected.index === i,
                onSelect: () => setSelected(s => s?.kind === 'reactor' && s.index === i ? null : { kind: 'reactor', index: i }),
                onEdit: () => openEdit('reactor', i), onRemove: () => removeItem('reactor', i),
              }))} />
          </Box>
        </Box>
      </Box>

      {/* Dialogs */}
      {dialogState?.kind === 'npc' && (
        <NpcDialog open tileX={dialogState.tileX} tileY={dialogState.tileY}
          initial={dialogState.editIndex !== undefined ? data.npcs[dialogState.editIndex] ?? null : null}
          npcNames={npcNames} onConfirm={confirmNpc} onCancel={() => setDialogState(null)} />
      )}
      {dialogState?.kind === 'warp' && (
        <WarpDialog open tileX={dialogState.tileX} tileY={dialogState.tileY}
          initial={dialogState.editIndex !== undefined ? data.warps[dialogState.editIndex] ?? null : null}
          defaultType={dialogState.defaultType}
          mapNames={mapNames} worldMapNames={worldMapNames}
          onConfirm={confirmWarp} onCancel={() => setDialogState(null)} />
      )}
      {dialogState?.kind === 'sign' && (
        <SignDialog open tileX={dialogState.tileX} tileY={dialogState.tileY}
          initial={dialogState.editIndex !== undefined ? data.signs[dialogState.editIndex] ?? null : null}
          onConfirm={confirmSign} onCancel={() => setDialogState(null)} />
      )}
      {dialogState?.kind === 'reactor' && (
        <ReactorDialog open tileX={dialogState.tileX} tileY={dialogState.tileY}
          initial={dialogState.editIndex !== undefined ? data.reactors[dialogState.editIndex] ?? null : null}
          onConfirm={confirmReactor} onCancel={() => setDialogState(null)} />
      )}
    </Box>
  )
}

// ── Items group (right panel list) ────────────────────────────────────────────

interface ItemRow { key: number; label: string; selected: boolean; onSelect: () => void; onEdit: () => void; onRemove: () => void }

function ItemsGroup({ label, color, count, items, onAdd }: { label: string; color: string; count: number; items: ItemRow[]; onAdd: () => void }) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <Box sx={{ px: 1.5, py: 0.75, display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', bgcolor: 'action.hover' }}
        onClick={() => setOpen(v => !v)}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
        <Typography variant="caption" sx={{ flex: 1, fontWeight: 600 }}>{label}</Typography>
        <Chip label={count} size="small" sx={{ height: 16, fontSize: 10 }} />
        <Tooltip title={`Place ${label.slice(0, -1)}`}>
          <IconButton size="small" onClick={e => { e.stopPropagation(); onAdd() }} sx={{ p: 0.25 }}>
            <AddIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
        {open ? <ExpandLessIcon sx={{ fontSize: 14 }} /> : <ExpandMoreIcon sx={{ fontSize: 14 }} />}
      </Box>
      <Collapse in={open}>
        {items.length === 0 ? (
          <Typography variant="caption" color="text.disabled" sx={{ px: 2, py: 0.5, display: 'block' }}>None placed</Typography>
        ) : (
          <List dense disablePadding>
            {items.map(item => (
              <ListItem key={item.key} disablePadding
                secondaryAction={
                  <Box sx={{ display: 'flex' }}>
                    <IconButton size="small" onClick={item.onEdit}   sx={{ p: 0.25 }}><EditIcon   sx={{ fontSize: 13 }} /></IconButton>
                    <IconButton size="small" onClick={item.onRemove} sx={{ p: 0.25 }}><DeleteIcon sx={{ fontSize: 13 }} /></IconButton>
                  </Box>
                }>
                <ListItemButton selected={item.selected} onClick={item.onSelect} sx={{ py: 0.25, pr: 7 }}>
                  <ListItemText primary={item.label} primaryTypographyProps={{ variant: 'caption', noWrap: true, fontFamily: 'monospace' }} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Collapse>
    </>
  )
}

// ── Main export: MapEditorPanel ───────────────────────────────────────────────

export default function MapEditorPanel({
  map, initialFileName, isArchived, isExisting, warnings = [],
  mapNames, npcNames, worldMapNames, spawnGroupNames,
  onSave, onArchive, onUnarchive, onDirtyChange, saveRef,
}: Props) {
  const [data, setData]       = useState<MapData>(() => ({ ...DEFAULT_MAP, ...map }))
  const [fileName, setFileName] = useState(initialFileName ?? computeMapFilename(map.id))
  const [tab, setTab]         = useState(0)
  const isDirtyRef            = useRef(false)

  const computedFileName = computeMapFilename(data.id)

  useEffect(() => {
    setData({ ...DEFAULT_MAP, ...map })
    setFileName(initialFileName ?? computeMapFilename(map.id))
    isDirtyRef.current = false
  }, [map, initialFileName])

  const markDirty = useCallback(() => {
    if (!isDirtyRef.current) { isDirtyRef.current = true; onDirtyChange(true) }
  }, [onDirtyChange])

  const handleChange = useCallback(
    (patch: Partial<MapData> | ((prev: MapData) => MapData)) => {
      setData(prev => typeof patch === 'function' ? patch(prev) : { ...prev, ...patch })
      markDirty()
    },
    [markDirty],
  )

  const handleSave = useCallback(async () => {
    await onSave(data, fileName)
    isDirtyRef.current = false
    onDirtyChange(false)
  }, [data, fileName, onSave, onDirtyChange])

  saveRef.current = handleSave

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <EditorHeader
        title={data.name || '(unnamed map)'}
        entityLabel="map"
        fileName={fileName}
        initialFileName={initialFileName}
        computedFileName={computedFileName}
        isExisting={isExisting}
        isArchived={isArchived}
        onFileNameChange={setFileName}
        onRegenerate={() => setFileName(computedFileName)}
        onSave={handleSave}
        onArchive={onArchive}
        onUnarchive={onUnarchive}
      />

      {warnings.map((w, i) => <Alert key={i} severity="warning" sx={{ mb: 1 }}>{w}</Alert>)}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ flexShrink: 0, mb: 1 }}>
        <Tab label="Properties" />
        <Tab label="Placement" />
      </Tabs>

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 0 && <MapFieldsTab data={data} spawnGroupNames={spawnGroupNames} onChange={handleChange} />}
        {tab === 1 && (
          <MapPlacementTab
            data={data}
            mapNames={mapNames}
            npcNames={npcNames}
            worldMapNames={worldMapNames}
            onChange={handleChange}
          />
        )}
      </Box>
    </Box>
  )
}
