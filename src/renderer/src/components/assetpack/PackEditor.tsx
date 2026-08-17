import React, { useState, useCallback, useEffect, useMemo } from 'react'
import {
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Tooltip,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  CircularProgress,
  Divider,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  Chip,
  Alert
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import AddIcon from '@mui/icons-material/Add'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
import BuildIcon from '@mui/icons-material/Build'
import SaveIcon from '@mui/icons-material/Save'
import TagIcon from '@mui/icons-material/Tag'
import SyncIcon from '@mui/icons-material/Sync'
import { getKind } from '../../packKinds'
import { useUiStore } from '../../store/uiStore'
import type { PackAsset, PackProject } from '../../packKinds'
import { loadPixelBufferFromPath } from '../../utils/imageLoader'
import { brigidAssetsDir, fileIn, packWorkingDir } from '../../utils/pickerDefaults'
import { scanDyeUsage } from '../../packKinds/itemIconsDye'
import AssetThumbnail from './AssetThumbnail'
import { clearPackCaches } from '../../utils/packCaches'

interface Props {
  pack: PackProject
  packDir: string
  packFilePath: string
  onSave: (pack: PackProject) => void
  onStatus: (msg: string) => void
}

// Apply kind.reduceCoversFromMeta if defined; otherwise return draft
// unchanged. Used at save and compile time so per-asset metadata feeds the
// covers blob the client actually reads.
function withReducedCovers(draft: PackProject): PackProject {
  const kind = getKind(draft.content_type)
  const reduced = kind.reduceCoversFromMeta?.(draft)
  return reduced ? { ...draft, covers: reduced } : draft
}

interface RenderRowsArgs {
  assets: PackAsset[]
  kind: ReturnType<typeof getKind>
  metaFieldEntries: [
    string,
    NonNullable<ReturnType<NonNullable<ReturnType<typeof getKind>['assetMetaFields']>>>[string]
  ][]
  packDir: string
  meta: Record<string, Record<string, unknown>>
  onMetaFieldChange: (filename: string, fieldKey: string, value: unknown) => void
  onRemoveAsset: (filename: string) => void
  onRenameAsset: (filename: string) => void
  /** Named by the project but absent from the pack folder. */
  missing: ReadonlySet<string>
}

// Render the asset table body. For kinds that declare a namespaces() method,
// rows are grouped under namespace headings (skill / spell for ability_icons,
// per-source-file for ui_sprite_overrides). Other kinds render flat.
function renderRows(args: RenderRowsArgs): React.ReactElement[] {
  const {
    assets,
    kind,
    metaFieldEntries,
    packDir,
    meta,
    onMetaFieldChange,
    onRemoveAsset,
    onRenameAsset,
    missing
  } = args
  const colSpan = 4 + metaFieldEntries.length

  const renderOne = (asset: PackAsset): React.ReactElement => {
    const slot = kind.parseSlot(asset.filename)
    const assetMeta = meta[asset.filename] ?? {}
    const isMissing = missing.has(asset.filename)
    return (
      <TableRow key={asset.filename}>
        <TableCell>
          <AssetThumbnail packDir={packDir} filename={asset.filename} missing={isMissing} />
        </TableCell>
        <TableCell>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
            {asset.filename}
          </Typography>
          {isMissing && (
            <Typography variant="caption" sx={{ color: 'error.main', display: 'block' }}>
              not in the pack folder
            </Typography>
          )}
        </TableCell>
        <TableCell>
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary'
            }}
          >
            {slot ? `${slot.namespace} ${slot.id}` : '—'}
          </Typography>
        </TableCell>
        {metaFieldEntries.map(([key, def]) => (
          <TableCell key={key}>
            {def.kind === 'boolean' && (
              <Tooltip title={def.help ?? ''}>
                <Checkbox
                  size="small"
                  checked={assetMeta[key] === true}
                  onChange={(e) => onMetaFieldChange(asset.filename, key, e.target.checked)}
                  slotProps={{ input: { 'aria-label': `${def.label} for ${asset.filename}` } }}
                />
              </Tooltip>
            )}
          </TableCell>
        ))}
        <TableCell sx={{ whiteSpace: 'nowrap' }}>
          <Tooltip title="Rename">
            <IconButton
              size="small"
              onClick={() => onRenameAsset(asset.filename)}
              aria-label={`rename ${asset.filename}`}
            >
              <TagIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <IconButton
            size="small"
            onClick={() => onRemoveAsset(asset.filename)}
            sx={{ color: 'error.main' }}
            aria-label={`delete ${asset.filename}`}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </TableCell>
      </TableRow>
    )
  }

  // Kinds without namespaces (nation_badges, legend_mark_icons, item_icons)
  // render a flat list.
  if (!kind.namespaces) {
    return assets.map(renderOne)
  }

  // Group by namespace via kind.parseSlot, preserving insertion order, then
  // sorting each group by id for predictability.
  const groups = new Map<string, PackAsset[]>()
  const orphans: PackAsset[] = []
  for (const asset of assets) {
    const slot = kind.parseSlot(asset.filename)
    if (!slot) {
      orphans.push(asset)
      continue
    }
    if (!groups.has(slot.namespace)) groups.set(slot.namespace, [])
    groups.get(slot.namespace)!.push(asset)
  }
  for (const list of groups.values()) {
    list.sort((a, b) => {
      const ai = kind.parseSlot(a.filename)?.id ?? 0
      const bi = kind.parseSlot(b.filename)?.id ?? 0
      return ai - bi
    })
  }

  const rows: React.ReactElement[] = []
  // Sort groups by namespace name for stable ordering, but keep skill before
  // spell etc. for ability_icons by using the kind's declared order when
  // available.
  const declaredOrder = kind.namespaces?.(assets) ?? []
  const orderedNs = [
    ...declaredOrder.filter((n) => groups.has(n)),
    ...[...groups.keys()].filter((n) => !declaredOrder.includes(n)).sort()
  ]

  for (const ns of orderedNs) {
    const list = groups.get(ns)!
    rows.push(
      <TableRow key={`__group__${ns}`} sx={{ '& > td': { backgroundColor: 'action.hover' } }}>
        <TableCell colSpan={colSpan}>
          <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
            {ns}
          </Typography>{' '}
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary'
            }}
          >
            ({list.length})
          </Typography>
        </TableCell>
      </TableRow>
    )
    for (const asset of list) rows.push(renderOne(asset))
  }
  if (orphans.length > 0) {
    rows.push(
      <TableRow key="__group__orphans" sx={{ '& > td': { backgroundColor: 'action.hover' } }}>
        <TableCell colSpan={colSpan}>
          <Typography
            variant="caption"
            sx={{
              color: 'warning.main',
              fontWeight: 'bold'
            }}
          >
            unparseable filenames
          </Typography>
        </TableCell>
      </TableRow>
    )
    for (const asset of orphans) rows.push(renderOne(asset))
  }
  return rows
}

const PackEditor: React.FC<Props> = ({ pack, packDir, packFilePath, onSave, onStatus }) => {
  const [draft, setDraft] = useState<PackProject>(pack)
  const [dirty, setDirty] = useState(false)
  const [compiling, setCompiling] = useState(false)
  const [addMenuAnchor, setAddMenuAnchor] = useState<null | HTMLElement>(null)
  const [customNsDialogOpen, setCustomNsDialogOpen] = useState(false)
  const [customNsValue, setCustomNsValue] = useState('')
  /** Files under the pack directory, as last read from disk. Null until read. */
  const [onDisk, setOnDisk] = useState<Set<string> | null>(null)
  /** The asset being renamed, and the name typed for it. */
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')

  useEffect(() => {
    setDraft(pack)
    setDirty(false)
  }, [pack])

  /**
   * Read the pack directory.
   *
   * The project file was the only thing the editor ever looked at, so a file
   * added, renamed or deleted on disk was invisible: the list kept naming files
   * that were not there (and drew a blank thumbnail for each), and never named
   * the ones that were. Refresh rescanned the *pack list*, not the pack.
   */
  const rescan = useCallback(async (): Promise<Set<string>> => {
    const found = new Set<string>()
    const walk = async (dir: string, prefix: string): Promise<void> => {
      // Defensive about the shape, not just the throw: a missing directory
      // rejects, but a mocked or absent `window.api` resolves undefined, and a
      // pack editor must not blow up because a folder could not be read.
      let entries: { name: string; isDirectory: boolean }[] = []
      try {
        entries = (await window.api.listDir(dir)) ?? []
      } catch {
        return
      }
      if (!Array.isArray(entries)) return
      for (const e of entries) {
        // ui_sprite_overrides nests one level, so a name may carry a slash.
        if (e.isDirectory) await walk(`${dir}/${e.name}`, `${prefix}${e.name}/`)
        else found.add(`${prefix}${e.name}`)
      }
    }
    await walk(packDir, '')
    setOnDisk(found)
    return found
  }, [packDir])

  useEffect(() => {
    void rescan()
  }, [rescan, draft.assets])

  /** Named by the project but not on disk — a blank row with nothing behind it. */
  const missingFiles = useMemo(
    () =>
      onDisk ? draft.assets.filter((a) => !onDisk.has(a.filename)).map((a) => a.filename) : [],
    [onDisk, draft.assets]
  )

  /** On disk but not in the project — art the pack would not ship. */
  const untrackedFiles = useMemo(() => {
    if (!onDisk) return []
    const named = new Set(draft.assets.map((a) => a.filename))
    return [...onDisk].filter((f) => !named.has(f) && !f.startsWith('.')).sort()
  }, [onDisk, draft.assets])

  /**
   * Whether the `.datf` is behind the project.
   *
   * `updatedAt` moves on every edit the editor makes, including adopting a file
   * found on disk, so a change made outside Taliesin still shows up here once
   * the folder is rescanned. A pack that has never been compiled is not
   * "behind" — it has nothing to be behind — so it says that instead.
   */
  const compileState = useMemo<'never' | 'stale' | 'current'>(() => {
    if (!draft.compiledAt) return 'never'
    return dirty || draft.updatedAt > draft.compiledAt ? 'stale' : 'current'
  }, [draft.compiledAt, draft.updatedAt, dirty])

  const adoptUntracked = useCallback(() => {
    if (untrackedFiles.length === 0) return
    setDraft((prev) => ({
      ...prev,
      assets: [...prev.assets, ...untrackedFiles.map((filename) => ({ filename, sourcePath: '' }))],
      updatedAt: new Date().toISOString()
    }))
    setDirty(true)
    onStatus(`Added ${untrackedFiles.length} file(s) found in the pack folder`)
  }, [untrackedFiles, onStatus])

  const dropMissing = useCallback(() => {
    if (missingFiles.length === 0) return
    const gone = new Set(missingFiles)
    setDraft((prev) => ({
      ...prev,
      assets: prev.assets.filter((a) => !gone.has(a.filename)),
      updatedAt: new Date().toISOString()
    }))
    setDirty(true)
    onStatus(`Removed ${gone.size} entry(s) whose file is not in the pack folder`)
  }, [missingFiles, onStatus])

  const kind = getKind(draft.content_type)
  const namespaceList = useMemo(() => kind.namespaces?.(draft.assets) ?? [], [kind, draft.assets])
  const hasMenu = namespaceList.length > 0 || !!kind.customNamespacePrompt
  const setCurrentPage = useUiStore((s) => s.setCurrentPage)
  // "Add PNG" for single-format (image) kinds; generic "Add file" for multi-format (audio) kinds
  const addLabel = useMemo(() => {
    const exts = kind.fileExtensions ?? ['png']
    return exts.length === 1 ? `Add ${exts[0].toUpperCase()}` : 'Add file'
  }, [kind])
  const metaFields = useMemo(() => kind.assetMetaFields?.() ?? {}, [kind])
  const metaFieldEntries = Object.entries(metaFields)

  const updateField = useCallback((field: keyof PackProject, value: unknown) => {
    setDraft((prev) => ({ ...prev, [field]: value, updatedAt: new Date().toISOString() }))
    setDirty(true)
  }, [])

  const handleSave = useCallback(async () => {
    const reduced = withReducedCovers(draft)
    await window.api.packSave(packFilePath, reduced)
    setDraft(reduced)
    onSave(reduced)
    setDirty(false)
    onStatus('Pack saved')
  }, [draft, packFilePath, onSave, onStatus])

  const addAssetInNamespace = useCallback(
    async (namespace: string | undefined) => {
      const extensions = kind.fileExtensions ?? ['png']
      // The pack working directory, not this pack's own folder: source art is
      // staged beside the pack projects, and what is already in the folder is
      // what the user is adding to.
      const filePath = (await window.api.openFile(
        [{ name: kind.label, extensions }],
        packWorkingDir()
      )) as string | null
      if (!filePath) return

      // Image kinds decode the picked PNG once (dimension validation + the
      // kind-specific dye scan). Non-image kinds (audio) have no dimension rule,
      // so the decode is skipped entirely and the file is copied through as-is.
      let buf: Awaited<ReturnType<typeof loadPixelBufferFromPath>> | null = null
      if (kind.dimension) {
        try {
          buf = await loadPixelBufferFromPath(filePath)
        } catch (e) {
          onStatus(`Failed to read image: ${e instanceof Error ? e.message : 'unknown error'}`)
          return
        }
        const dimError = kind.dimension.validate(buf.width, buf.height)
        if (dimError) {
          onStatus(`Rejected: ${dimError}`)
          return
        }
      }

      const sourceExtension = filePath.split('.').pop()?.toLowerCase()
      const target = kind.nextAssetPath({
        ctx: namespace ? { namespace } : undefined,
        existingAssets: draft.assets,
        sourceExtension
      })
      await window.api.packAddAsset(packDir, filePath, target.zipPath)

      const newAssets = [...draft.assets, { filename: target.zipPath, sourcePath: filePath }]
      setDraft((prev) => ({ ...prev, assets: newAssets, updatedAt: new Date().toISOString() }))
      setDirty(true)

      // Item-icon dye heuristic: warn (non-blocking) on near-purple pixels
      // outside the canonical palette. Skipped when the asset is flagged
      // noDye (the kind decides via assetMetaFields).
      let suffix = ''
      if (buf && draft.content_type === 'item_icons') {
        const report = scanDyeUsage(buf)
        if (report.nonDyeablePurplePixels > 0) {
          suffix = ` (warning: ${report.nonDyeablePurplePixels} near-purple pixels not in canonical palette — mark No dye if intentional)`
        }
      }
      onStatus(`Added ${target.zipPath}${suffix}`)
    },
    [draft.assets, draft.content_type, kind, packDir, onStatus]
  )

  /**
   * A static_tiles pack has one correct door, and this is not it (HTOO-416).
   *
   * The generic add writes `wall{n}.png` where n is one past the highest id in
   * *this pack*, starting at 1. A pack's own contents say nothing about where
   * the legacy tiles end, so that is never a correct wall id — and
   * `isRenderedTileIndex` never renders 0 to 12, so the first twelve walls added
   * this way are silently dead art that compiles and is ignored by the client.
   *
   * The Static Tile Manager asks everything this path skips: the conversion
   * through `convertCell`, the angled face, the mintable window, a deliberate
   * replace, the walkability preference, and the eligibility pre-flight. So the
   * fix is to send the user there rather than to reimplement the questions here.
   */
  const redirectToManager = kind.type === 'static_tiles'

  const handleAddClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (redirectToManager) {
        setCurrentPage('statictiles')
        onStatus('Static tiles are added in the Static Tile Manager, which asks for the tile id.')
        return
      }
      if (hasMenu) {
        setAddMenuAnchor(e.currentTarget)
      } else {
        addAssetInNamespace(undefined)
      }
    },
    [redirectToManager, setCurrentPage, onStatus, hasMenu, addAssetInNamespace]
  )

  const handleMenuPick = useCallback(
    (namespace: string) => {
      setAddMenuAnchor(null)
      addAssetInNamespace(namespace)
    },
    [addAssetInNamespace]
  )

  const handleOpenCustomNs = useCallback(() => {
    setAddMenuAnchor(null)
    setCustomNsValue('')
    setCustomNsDialogOpen(true)
  }, [])

  const handleConfirmCustomNs = useCallback(() => {
    const trimmed = customNsValue.trim()
    if (!trimmed) return
    setCustomNsDialogOpen(false)
    addAssetInNamespace(trimmed)
  }, [customNsValue, addAssetInNamespace])

  const handleRemoveAsset = useCallback(
    async (filename: string) => {
      await window.api.packRemoveAsset(packDir, filename)
      setDraft((prev) => {
        const newAssetMeta = { ...(prev.assetMeta ?? {}) }
        delete newAssetMeta[filename]
        return {
          ...prev,
          assets: prev.assets.filter((a) => a.filename !== filename),
          assetMeta: Object.keys(newAssetMeta).length > 0 ? newAssetMeta : undefined,
          updatedAt: new Date().toISOString()
        }
      })
      setDirty(true)
    },
    [packDir]
  )

  /**
   * Rename an asset, keeping the project and the disk together.
   *
   * For a numeric-id kind the filename IS the id, so this is how a tile lands on
   * the wrong number and gets moved to the right one. The file moves first: if
   * the project were written first and the move then failed, the pack would name
   * art that is not there — which is the state this editor could not previously
   * even show.
   */
  const commitRename = useCallback(async (): Promise<void> => {
    const from = renaming
    const to = renameText.trim()
    setRenaming(null)
    if (!from || !to || from === to) return
    try {
      await window.api.packRenameAsset(packDir, from, to)
      setDraft((prev) => {
        const meta = { ...(prev.assetMeta ?? {}) }
        if (meta[from]) {
          meta[to] = meta[from]!
          delete meta[from]
        }
        return {
          ...prev,
          assets: prev.assets.map((a) => (a.filename === from ? { ...a, filename: to } : a)),
          assetMeta: Object.keys(meta).length > 0 ? meta : undefined,
          updatedAt: new Date().toISOString()
        }
      })
      setDirty(true)
      onStatus(`Renamed ${from} to ${to}`)
    } catch (err) {
      onStatus(`Rename failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [renaming, renameText, packDir, onStatus])

  const handleMetaFieldChange = useCallback(
    (filename: string, fieldKey: string, value: unknown) => {
      setDraft((prev) => {
        const prevForFile = prev.assetMeta?.[filename] ?? {}
        const nextForFile = { ...prevForFile, [fieldKey]: value }
        return {
          ...prev,
          assetMeta: { ...(prev.assetMeta ?? {}), [filename]: nextForFile },
          updatedAt: new Date().toISOString()
        }
      })
      setDirty(true)
    },
    []
  )

  const handleCompile = useCallback(async () => {
    const reduced = withReducedCovers(draft)
    await window.api.packSave(packFilePath, reduced)
    setDraft(reduced)
    setDirty(false)

    const outputPath = await window.api.saveFile(
      [{ name: 'DATF Asset Pack', extensions: ['datf'] }],
      fileIn(brigidAssetsDir(), `${reduced.pack_id}.datf`)
    )
    if (!outputPath) return

    setCompiling(true)
    try {
      const manifest = {
        schema_version: kind.manifestSchemaVersion ?? 1,
        pack_id: reduced.pack_id,
        pack_version: reduced.pack_version,
        content_type: reduced.content_type,
        priority: reduced.priority,
        covers: reduced.covers
      }
      const filenames = reduced.assets.map((a) => a.filename)
      await window.api.packCompile(packDir, manifest, filenames, outputPath)
      // Remember that this happened, and where. Without it the editor cannot
      // tell a pack that has been compiled from one that never has, so it
      // cannot say that the .datf is behind the project.
      const compiled: PackProject = {
        ...reduced,
        compiledAt: new Date().toISOString(),
        compiledTo: outputPath
      }
      await window.api.packSave(packFilePath, compiled)
      setDraft(compiled)
      onSave(compiled)
      // The map and world map editors preview installed packs from decoded
      // bitmaps and a coverage snapshot, neither of which knows a pack was just
      // rewritten. Main refreshed its own registry inside pack:compile.
      clearPackCaches()
      onStatus(`Compiled ${reduced.pack_id}.datf (${filenames.length} assets)`)
    } catch (err) {
      onStatus(`Compile failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setCompiling(false)
    }
  }, [draft, kind, packDir, packFilePath, onSave, onStatus])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderBottom: '1px solid',
          borderColor: 'divider'
        }}
      >
        <Typography variant="h6" sx={{ flex: 1 }}>
          {draft.pack_id}
        </Typography>
        {compileState !== 'current' && (
          <Chip
            size="small"
            variant="outlined"
            color={compileState === 'never' ? 'default' : 'warning'}
            label={compileState === 'never' ? 'Never compiled' : 'Uncompiled changes'}
          />
        )}
        <Tooltip title="Re-read the pack folder">
          <IconButton
            size="small"
            onClick={() => void rescan()}
            sx={{ color: 'text.primary' }}
            aria-label="rescan pack folder"
          >
            <SyncIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Save">
          <span>
            <IconButton
              size="small"
              onClick={handleSave}
              disabled={!dirty}
              sx={{ color: 'text.primary' }}
              aria-label="save"
            >
              <SaveIcon fontSize="small" />
            </IconButton>
          </span>
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
      {(untrackedFiles.length > 0 || missingFiles.length > 0) && (
        <Box sx={{ px: 2, pt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {untrackedFiles.length > 0 && (
            <Alert
              severity="info"
              action={
                <Button size="small" onClick={adoptUntracked}>
                  Add {untrackedFiles.length}
                </Button>
              }
            >
              {untrackedFiles.length} file(s) in the pack folder are not in this pack, so they will
              not be compiled into the `.datf`: {untrackedFiles.slice(0, 6).join(', ')}
              {untrackedFiles.length > 6 ? ', …' : ''}
            </Alert>
          )}
          {missingFiles.length > 0 && (
            <Alert
              severity="warning"
              action={
                <Button size="small" color="inherit" onClick={dropMissing}>
                  Remove {missingFiles.length}
                </Button>
              }
            >
              {missingFiles.length} file(s) this pack names are not in the pack folder. Compiling
              stops rather than shipping a pack without them: {missingFiles.slice(0, 6).join(', ')}
              {missingFiles.length > 6 ? ', …' : ''}
            </Alert>
          )}
        </Box>
      )}
      {/* Manifest fields */}
      <Box sx={{ p: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField
          label="Pack ID"
          size="small"
          value={draft.pack_id}
          onChange={(e) =>
            updateField('pack_id', e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'))
          }
          sx={{ width: 200 }}
        />
        <TextField
          label="Version"
          size="small"
          value={draft.pack_version}
          onChange={(e) => updateField('pack_version', e.target.value)}
          sx={{ width: 120 }}
        />
        <TextField
          label="Priority"
          size="small"
          type="number"
          value={draft.priority}
          onChange={(e) => updateField('priority', parseInt(e.target.value) || 100)}
          sx={{ width: 100 }}
        />
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            alignSelf: 'center'
          }}
        >
          Type: {draft.content_type}
        </Typography>
      </Box>
      <Divider />
      {/* Asset table */}
      <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="body2" sx={{ flex: 1 }}>
          {draft.assets.length} assets
        </Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          endIcon={hasMenu && !redirectToManager ? <ArrowDropDownIcon /> : undefined}
          onClick={handleAddClick}
        >
          {redirectToManager ? 'Add in Static Tile Manager' : addLabel}
        </Button>
        <Menu
          anchorEl={addMenuAnchor}
          open={!!addMenuAnchor}
          onClose={() => setAddMenuAnchor(null)}
        >
          {namespaceList.map((ns) => (
            <MenuItem key={ns} onClick={() => handleMenuPick(ns)}>
              {ns}
            </MenuItem>
          ))}
          {kind.customNamespacePrompt && (
            <MenuItem onClick={handleOpenCustomNs}>{kind.customNamespacePrompt.menuLabel}</MenuItem>
          )}
        </Menu>
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto', px: 1 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 48 }}>Preview</TableCell>
              <TableCell>Filename</TableCell>
              <TableCell sx={{ width: 100 }}>Slot</TableCell>
              {metaFieldEntries.map(([key, def]) => (
                <TableCell key={key} sx={{ width: 80 }}>
                  {def.label}
                </TableCell>
              ))}
              <TableCell sx={{ width: 40 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {renderRows({
              assets: draft.assets,
              kind,
              metaFieldEntries,
              packDir,
              meta: draft.assetMeta ?? {},
              onMetaFieldChange: handleMetaFieldChange,
              missing: new Set(missingFiles),
              onRemoveAsset: handleRemoveAsset,
              onRenameAsset: (f: string) => {
                setRenaming(f)
                setRenameText(f)
              }
            })}
          </TableBody>
        </Table>
      </Box>
      {/* Kind-specific panel (item-icon dye reference, ui sprite source groups, etc.) */}
      {kind.Panel && (
        <kind.Panel
          draft={draft}
          kind={kind}
          onChange={(updates) => {
            setDraft((prev) => ({ ...prev, ...updates, updatedAt: new Date().toISOString() }))
            setDirty(true)
          }}
        />
      )}
      {/* Custom-namespace dialog (opt-in via kind.customNamespacePrompt) */}
      {kind.customNamespacePrompt && (
        <Dialog
          open={customNsDialogOpen}
          onClose={() => setCustomNsDialogOpen(false)}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle>{kind.customNamespacePrompt.dialogTitle}</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label={kind.customNamespacePrompt.inputLabel ?? 'Source filename'}
              value={customNsValue}
              onChange={(e) => setCustomNsValue(e.target.value)}
              helperText={kind.customNamespacePrompt.dialogHelp}
              sx={{ mt: 1 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleConfirmCustomNs()
                }
              }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCustomNsDialogOpen(false)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleConfirmCustomNs}
              disabled={!customNsValue.trim()}
            >
              Continue
            </Button>
          </DialogActions>
        </Dialog>
      )}
      <Dialog open={renaming !== null} onClose={() => setRenaming(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Rename asset</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="File name"
            value={renameText}
            onChange={(e) => setRenameText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitRename()
            }}
            helperText={
              kind.parseSlot(renameText)
                ? `Reads as ${kind.parseSlot(renameText)!.namespace} ${kind.parseSlot(renameText)!.id}`
                : 'This name does not read as a slot for this pack kind'
            }
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenaming(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => void commitRename()}>
            Rename
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default PackEditor
