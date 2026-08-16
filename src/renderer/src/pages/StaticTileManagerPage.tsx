import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Typography,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  TextField,
  MenuItem,
  Chip,
  Divider,
  Stack,
  Alert,
  IconButton,
  Tooltip,
  LinearProgress
} from '@mui/material'
import ImageIcon from '@mui/icons-material/Image'
import LibraryAddIcon from '@mui/icons-material/LibraryAdd'
import SaveIcon from '@mui/icons-material/Save'
import RefreshIcon from '@mui/icons-material/Refresh'
import ViewInArIcon from '@mui/icons-material/ViewInAr'
import { useSettingsStore } from '../store/settingsStore'
import { useUiStore } from '../store/uiStore'
import { useTransientStatus } from '../hooks/useTransientStatus'
import { packWorkingDir } from '../utils/pickerDefaults'
import { StatusMessage } from '../components/shared/StatusMessage'
import { EmptyStateSettings } from '../components/shared/EmptyStateSettings'
import { WorkingDirToolbar } from '../components/shared/WorkingDirToolbar'
import { loadPixelBufferFromPath, pixelBufferToPngBytes } from '../utils/imageLoader'
import { PixelBuffer } from '../utils/duotone'
import { convertCell, TileLayer, TileScale, WallFace } from '../utils/tileConvert'
import { detectOrientation, Orientation } from '../utils/orientationDetect'
import { sliceGrid } from '../utils/gridSlice'
import {
  mirrorX,
  padBelow,
  sliceColumns,
  splitWallHeight,
  wallColumnsFor,
  WALL_FACE_WIDTH
} from '../utils/tileShape'
import { previewScale } from '../utils/previewFit'
import {
  nextWallId,
  wallWalkability,
  isCommittableWallId,
  isRenderedTileIndex,
  isReclaimableWallId,
  WALL_ID_MAX,
  Walkability
} from '../utils/wallIdAllocator'
import { legacyWallHeight } from '../utils/wallHeight'
import { checkTileEligibility, describeIneligibility } from '../utils/tileEligibility'
import {
  loadMapAssets,
  drawDiamond,
  GROUND_TILE_WIDTH,
  GROUND_TILE_HEIGHT
} from '../utils/mapRenderer'
import type { MapAssets } from '../utils/mapRenderer'
import { staticTilesKind } from '../packKinds/staticTiles'
import { nextSlotId } from '../packKinds/helpers'
import type { PackProject, PackAsset } from '../packKinds/types'
import WangSlicePanel from '../components/statictiles/WangSlicePanel'
import CommittedTiles from '../components/statictiles/CommittedTiles'
import CellStrip from '../components/statictiles/CellStrip'
import WallPlacementPreview from '../components/statictiles/WallPlacementPreview'

interface PackSummary {
  filename: string
  pack_id: string
  pack_version: string
  content_type: string
}

type OrientationChoice = 'auto' | Orientation
type WallMode = 'mint' | 'replace'
type PassabilityPref = 'any' | 'blocking' | 'passable'

/** The square each preview is drawn to fit. Sources are any size (HTOO-418). */
const PREVIEW_BOX = 320

/** Paint a PixelBuffer into a canvas, magnified to fit `box`, crisp. */
function paintBuffer(
  canvas: HTMLCanvasElement | null,
  buf: PixelBuffer | null,
  box: number,
  overlayDiamond: boolean
): void {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = buf?.width ?? 1
  const h = buf?.height ?? 1
  const displayScale = previewScale(w, h, box)
  canvas.width = Math.max(1, Math.round(w * displayScale))
  canvas.height = Math.max(1, Math.round(h * displayScale))
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!buf) return
  const tmp = document.createElement('canvas')
  tmp.width = w
  tmp.height = h
  const tctx = tmp.getContext('2d')
  if (!tctx) return
  const img = tctx.createImageData(w, h)
  img.data.set(buf.data)
  tctx.putImageData(img, 0, 0)
  ctx.drawImage(tmp, 0, 0, w, h, 0, 0, canvas.width, canvas.height)
  if (overlayDiamond) {
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.75)'
    ctx.lineWidth = 1
    drawDiamond(
      ctx,
      (GROUND_TILE_WIDTH / 2) * displayScale,
      (GROUND_TILE_HEIGHT / 2) * displayScale,
      displayScale
    )
    ctx.stroke()
  }
}

const WALKABILITY_COLOR: Record<Walkability, 'success' | 'error' | 'default'> = {
  passable: 'success',
  blocking: 'error',
  unknown: 'default'
}

const StaticTileManagerPage: React.FC = () => {
  const packDir = useSettingsStore((s) => s.packDir)
  const setPackDir = useSettingsStore((s) => s.setPackDir)
  const clientPath = useSettingsStore((s) => s.clientPath)
  const setCurrentPage = useUiStore((s) => s.setCurrentPage)
  const [statusMessage, showStatus] = useTransientStatus()

  // ── Source ────────────────────────────────────────────────────────────────
  const [sourceImage, setSourceImage] = useState<PixelBuffer | null>(null)
  const [sourcePath, setSourcePath] = useState<string>('')
  const [inputMode, setInputMode] = useState<'loose' | 'grid' | 'wang'>('loose')
  const [cellW, setCellW] = useState(32)
  const [cellH, setCellH] = useState(32)
  const [marginX, setMarginX] = useState(0)
  const [marginY, setMarginY] = useState(0)
  const [spacingX, setSpacingX] = useState(0)
  const [spacingY, setSpacingY] = useState(0)
  const [cellIndex, setCellIndex] = useState(0)
  // ── Loose-mode shaping (HTOO-418/419) ──────────────────────────────────────
  /** How many wall tiles the source is cut into. Always the author's answer. */
  const [wallColumns, setWallColumns] = useState(1)
  /** Mirror the source, which turns a face into its opposite. */
  const [mirrorSource, setMirrorSource] = useState(false)
  /** Blank rows at the base of the tile. They raise the art off the ground. */
  const [blankRowsBelow, setBlankRowsBelow] = useState(0)

  // ── Conversion params ───────────────────────────────────────────────────────
  const [layer, setLayer] = useState<TileLayer>('floor')
  const [scale, setScale] = useState<TileScale>(1)
  // Most sources are drawn in the projection they are for, so normalize-only is
  // the common case. Auto stays available for a source drawn square.
  const [orientationChoice, setOrientationChoice] = useState<OrientationChoice>('isometric')

  // ── Target pack ─────────────────────────────────────────────────────────────
  const [packs, setPacks] = useState<PackSummary[]>([])
  const [selectedPack, setSelectedPack] = useState<string>('')
  const [project, setProject] = useState<PackProject | null>(null)

  // ── Legacy assets (sotp + ia.dat) for wall walkability / height ─────────────
  const [assets, setAssets] = useState<MapAssets | null>(null)

  // ── Wall commit controls ────────────────────────────────────────────────────
  const [wallMode, setWallMode] = useState<WallMode>('mint')
  const [passabilityPref, setPassabilityPref] = useState<PassabilityPref>('any')
  /**
   * The wall id, as typed. It starts empty: a number already in the box reads
   * as a decision, and it used to start at 10013 and read as "replace tile
   * 10013". There is no range that makes an id new rather than a replacement --
   * see wallIdAllocator -- so the box has nothing to fill itself in with.
   */
  const [wallIdText, setWallIdText] = useState<string>('')
  /** Four iso steps — a common legacy wall. A starting point, not a derivation. */
  const [wallHeightField, setWallHeightField] = useState<number>(56)
  const [wallFace, setWallFace] = useState<WallFace>('left')
  const [floorId, setFloorId] = useState<number>(1)
  const [placementOpen, setPlacementOpen] = useState(false)

  /** The typed wall id as a number. NaN while the box is empty. */
  const wallId = Number.parseInt(wallIdText, 10)
  const hasWallId = Number.isInteger(wallId) && wallId > 0

  const srcCanvasRef = useRef<HTMLCanvasElement>(null)
  const outCanvasRef = useRef<HTMLCanvasElement>(null)

  // ── Scan static_tiles packs in the working dir ──────────────────────────────
  const refreshPacks = useCallback(async () => {
    if (!packDir) {
      setPacks([])
      return
    }
    const list = (await window.api.packScan(packDir)) as PackSummary[]
    setPacks(
      list
        .filter((p) => p.content_type === 'static_tiles')
        .sort((a, b) => a.pack_id.localeCompare(b.pack_id))
    )
  }, [packDir])

  useEffect(() => {
    refreshPacks()
  }, [refreshPacks])

  // Load the selected pack project
  useEffect(() => {
    if (!packDir || !selectedPack) {
      setProject(null)
      return
    }
    window.api
      .packLoad(`${packDir}/${selectedPack}`)
      .then((data) => setProject(data as PackProject))
      .catch(() => setProject(null))
  }, [packDir, selectedPack])

  // Load legacy assets (for walls) when the client path is known
  useEffect(() => {
    if (!clientPath) {
      setAssets(null)
      return
    }
    let live = true
    loadMapAssets(clientPath)
      .then((a) => {
        if (live) setAssets(a)
      })
      .catch(() => {
        if (live) setAssets(null)
      })
    return () => {
      live = false
    }
  }, [clientPath])

  const handleSetDir = useCallback(async () => {
    const dir = await window.api.openDirectory()
    if (dir) setPackDir(dir)
  }, [setPackDir])

  const handleImport = useCallback(async () => {
    const path = await window.api.openFile(
      [{ name: 'PNG image', extensions: ['png'] }],
      packWorkingDir()
    )
    if (!path) return
    try {
      const buf = await loadPixelBufferFromPath(path)
      setSourceImage(buf)
      setSourcePath(path)
      setCellIndex(0)
      // Nothing about the tile is derived from the source's pixel size. A
      // source is art at whatever resolution it was drawn — a 587×958 drawing
      // of one sign is not 21 tiles wide, and it is not a 958px tall wall. Both
      // numbers stay where the author put them; the counts the source suggests
      // are offered as buttons instead.
      setWallColumns(1)
      setMirrorSource(false)
      setBlankRowsBelow(0)
      showStatus(`Loaded ${buf.width}×${buf.height} source`)
    } catch (e) {
      showStatus(`Load failed: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }, [showStatus])

  // ── Derived: sliced cells + selected preview cell ───────────────────────────
  const cells = useMemo<PixelBuffer[]>(() => {
    if (!sourceImage) return []
    if (inputMode === 'grid') {
      if (cellW <= 0 || cellH <= 0) return []
      try {
        return sliceGrid(sourceImage, { cellW, cellH, marginX, marginY, spacingX, spacingY }).map(
          (c) => c.buffer
        )
      } catch {
        return []
      }
    }
    // Loose mode shapes the source before it becomes tiles (HTOO-418/419).
    // Without this, convertWall maps the whole image across one 28-pixel face,
    // so art meant to be three tiles is shrunk into one.
    //
    // The mirror is applied to the whole source, so a run's columns reverse with
    // it — a house's south wall becomes its east wall, rather than the same
    // columns each flipped in place. Blank rows are NOT applied here: they are a
    // property of the converted tile, not of the source (see `converted`).
    const shaped = mirrorSource ? mirrorX(sourceImage) : sourceImage
    return layer === 'wall' ? sliceColumns(shaped, wallColumns) : [shaped]
  }, [
    sourceImage,
    inputMode,
    cellW,
    cellH,
    marginX,
    marginY,
    spacingX,
    spacingY,
    layer,
    wallColumns,
    mirrorSource
  ])

  const previewCell = cells.length > 0 ? cells[Math.min(cellIndex, cells.length - 1)] : null

  /**
   * Change the raise, and move the tile height with it.
   *
   * The rows come out of the tile height, so raising by 14 without growing the
   * tile would shrink the art by 14. Moving both keeps the art at its own size,
   * which is what raising a new tile means. The author can then set either
   * number to whatever they want — a replacement, for instance, holds the
   * height still and lets the rows take from the art.
   */
  const changeBlankRows = useCallback(
    (raw: number) => {
      const next = Math.max(0, Math.round(raw) || 0)
      const delta = next - blankRowsBelow
      setBlankRowsBelow(next)
      setWallHeightField((h) => Math.max(1, h + delta))
    },
    [blankRowsBelow]
  )

  /** Reported so a reduced preview is never mistaken for the art's real size. */
  const previewFit = previewCell
    ? previewScale(previewCell.width, previewCell.height, PREVIEW_BOX)
    : 1

  const detected = useMemo(
    () => (previewCell ? detectOrientation(previewCell) : null),
    [previewCell]
  )
  const effectiveOrientation: Orientation =
    orientationChoice === 'auto' ? (detected?.orientation ?? 'orthogonal') : orientationChoice

  // ── Derived: converted output ───────────────────────────────────────────────
  /** The art's share of the wall height, and the blank rows below it. */
  const wallSplit = useMemo(
    () => splitWallHeight(wallHeightField, blankRowsBelow),
    [wallHeightField, blankRowsBelow]
  )

  const converted = useMemo<PixelBuffer | null>(() => {
    if (!previewCell) return null
    if (layer !== 'wall') {
      return convertCell(previewCell, { layer, scale }, effectiveOrientation)
    }
    // Convert into the art's share, then leave the rest of the tile empty. The
    // rows cannot be padded onto the source: convertWall maps the whole source
    // down the face, so padding is scaled back out and the art never moves.
    // padBelow works in output pixels, so the row count scales with the tile.
    const face = convertCell(
      previewCell,
      { layer, scale, wallHeight: wallSplit.art, wallFace },
      effectiveOrientation
    )
    return wallSplit.blank > 0 ? padBelow(face, wallSplit.blank * scale) : face
  }, [previewCell, layer, scale, wallSplit, wallFace, effectiveOrientation])

  // Paint previews
  useEffect(() => {
    paintBuffer(srcCanvasRef.current, previewCell, PREVIEW_BOX, false)
  }, [previewCell])
  useEffect(() => {
    paintBuffer(outCanvasRef.current, converted, PREVIEW_BOX, layer === 'floor')
  }, [converted, layer])

  // ── Used ids for the loaded pack ────────────────────────────────────────────
  const usedIds = useMemo(() => {
    const floor = new Set<number>()
    const wall = new Set<number>()
    for (const a of project?.assets ?? []) {
      const slot = staticTilesKind.parseSlot?.(a.filename)
      if (!slot) continue
      if (slot.namespace === 'floor') floor.add(slot.id)
      else if (slot.namespace === 'wall') wall.add(slot.id)
    }
    return { floor, wall }
  }, [project])

  // Suggest the next floor id when the pack changes
  useEffect(() => {
    if (!project) return
    setFloorId(nextSlotId(project.assets, staticTilesKind.parseSlot!, { namespace: 'floor' }))
  }, [project])

  /**
   * The next free wall id to mint, offered as a suggestion.
   *
   * Nothing writes it into the box. The author asks for it with the button.
   */
  const suggestedWallId = useMemo(
    () =>
      nextWallId({
        used: usedIds.wall,
        sotp: assets?.sotp ?? null,
        passability: passabilityPref === 'any' ? undefined : passabilityPref
      }),
    [usedIds.wall, assets, passabilityPref]
  )

  /**
   * The decoded height of the legacy wall being replaced, for reference only.
   *
   * This used to be written into the height field. It is the wrong thing to do
   * twice over. The number is right for a replacement that keeps the legacy
   * silhouette and wrong for anything else, and, being an effect, it wrote
   * itself back over every height the author typed — including on each change
   * of the blank rows, which made the raise look like it did nothing.
   */
  const referenceHeight = useMemo(
    () => (assets && hasWallId ? legacyWallHeight(assets, wallId) : null),
    [assets, hasWallId, wallId]
  )

  /** The source's own height, offered the same way — a label, not a write. */
  const sourceHeight = previewCell?.height ?? null

  /**
   * How many faces the source would be if it were drawn at tile resolution.
   *
   * Offered, never applied. Art is drawn at whatever resolution suits the
   * artist, so a 587-pixel-wide sign is one tile that happens to be 21 faces
   * across, not a run of 21 tiles. Only the author knows which.
   */
  const sourceFaceCount = sourceImage ? wallColumnsFor(sourceImage.width) : 1

  const wallWalk: Walkability = wallWalkability(assets?.sotp ?? null, hasWallId ? wallId : -1)

  // Pre-flight the commit target against the legacy tables — a pack PNG for a
  // frame-animated or palette-cycled id is silently ignored by the client.
  const targetId = layer === 'wall' ? wallId : floorId
  // An empty wall id has no target to check, so nothing is reported about it.
  const hasTargetId = layer === 'wall' ? hasWallId : Number.isInteger(floorId) && floorId > 0
  const targetEligibility = hasTargetId
    ? checkTileEligibility(assets, layer, targetId)
    : { eligible: true as const }
  // Replace mode intentionally writes over a legacy/pack id; any other layer
  // that targets an already-committed id would be a silent clobber, so we block
  // it (and say so) rather than overwrite.
  const isReplaceMode = layer === 'wall' && wallMode === 'replace'
  const targetUsed = (layer === 'wall' ? usedIds.wall : usedIds.floor).has(targetId)
  const wouldOverwrite = targetUsed && !isReplaceMode

  // ── Commit the previewed tile into the pack ─────────────────────────────────
  const [committing, setCommitting] = useState(false)
  // Live progress for the multi-file batch import (null when not running).
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null)
  const commit = useCallback(async () => {
    if (!packDir || !project || !selectedPack || !converted) return
    const id = layer === 'wall' ? wallId : floorId
    if (!Number.isInteger(id) || id <= 0) {
      showStatus(layer === 'wall' ? 'Enter a wall tile id' : 'Enter a floor tile id')
      return
    }
    // One rule, both modes. The client and the server do not know whether the
    // author meant to add a tile or to replace one, so nothing else can differ:
    // ids 0-12 and 10000-10012 are sentinels the client never draws, and an id
    // above 20423 indexes past sotp.dat and crashes the server on map load.
    // (There is no "mint window" -- see wallIdAllocator and WLD-44.)
    if (layer === 'wall' && !isCommittableWallId(id)) {
      showStatus(
        isRenderedTileIndex(id)
          ? `Wall id ${id} is above ${WALL_ID_MAX}, which crashes map load`
          : `Wall id ${id} is a sentinel the client never renders`
      )
      return
    }
    const used = layer === 'wall' ? usedIds.wall : usedIds.floor
    const overwriting = used.has(id)
    if (overwriting && !(layer === 'wall' && wallMode === 'replace')) {
      showStatus(`${layer}${String(id).padStart(5, '0')} already exists in this pack`)
      return
    }
    setCommitting(true)
    try {
      const filename = `${layer}${String(id).padStart(5, '0')}.png`
      const bytes = await pixelBufferToPngBytes(converted)
      const assetsDir = `${packDir}/${project.pack_id}`
      await window.api.ensureDir(assetsDir)
      await window.api.writeBytes(`${assetsDir}/${filename}`, bytes)

      const asset: PackAsset = { filename, sourcePath }
      const nextAssets = project.assets.some((a) => a.filename === filename)
        ? project.assets.map((a) => (a.filename === filename ? asset : a))
        : [...project.assets, asset]
      const updated: PackProject = {
        ...project,
        assets: nextAssets,
        updatedAt: new Date().toISOString()
      }
      await window.api.packSave(`${packDir}/${selectedPack}`, updated)
      setProject(updated)
      showStatus(`Committed ${filename} (${converted.width}×${converted.height})`)
      // advance to the next cell / next id for a smoother batch-by-hand flow
      if (inputMode === 'grid' && cellIndex < cells.length - 1) setCellIndex((i) => i + 1)
    } catch (e) {
      showStatus(`Commit failed: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setCommitting(false)
    }
  }, [
    packDir,
    project,
    selectedPack,
    converted,
    layer,
    wallId,
    floorId,
    usedIds,
    wallMode,
    sourcePath,
    inputMode,
    cellIndex,
    cells.length,
    showStatus
  ])

  // Batch-commit every grid cell as a floor with sequential ids (floor-only —
  // walls need per-id walkability/height decisions, so they stay single-commit).
  const commitAllFloors = useCallback(async () => {
    if (!packDir || !project || !selectedPack || cells.length === 0) return
    setCommitting(true)
    try {
      const assetsDir = `${packDir}/${project.pack_id}`
      await window.api.ensureDir(assetsDir)
      let packAssets: PackAsset[] = [...project.assets]
      const ineligible: string[] = []
      let count = 0
      for (const cell of cells) {
        const orient =
          orientationChoice === 'auto' ? detectOrientation(cell).orientation : orientationChoice
        const opts = { layer: 'floor' as const, scale }
        const conv = convertCell(cell, opts, orient)
        const id = nextSlotId(packAssets, staticTilesKind.parseSlot, { namespace: 'floor' })
        // Fresh-pack floor ids start at 1 — inside the legacy range — so a batch
        // can silently target animated/cycled ids. Write anyway, but collect them.
        const elig = checkTileEligibility(assets, 'floor', id)
        if (!elig.eligible && elig.reason) {
          ineligible.push(`${id} (${describeIneligibility(elig.reason)})`)
        }
        const filename = `floor${String(id).padStart(5, '0')}.png`
        const bytes = await pixelBufferToPngBytes(conv)
        await window.api.writeBytes(`${assetsDir}/${filename}`, bytes)
        packAssets = [...packAssets, { filename, sourcePath }]
        count++
      }
      const updated: PackProject = {
        ...project,
        assets: packAssets,
        updatedAt: new Date().toISOString()
      }
      await window.api.packSave(`${packDir}/${selectedPack}`, updated)
      setProject(updated)
      const warn = ineligible.length
        ? ` — ${ineligible.length} target animated/cycled ids that won't render: ${ineligible.join(', ')}`
        : ''
      showStatus(`Committed ${count} floor tiles${warn}`)
    } catch (e) {
      showStatus(`Batch commit failed: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setCommitting(false)
    }
  }, [
    packDir,
    project,
    selectedPack,
    cells,
    orientationChoice,
    scale,
    sourcePath,
    showStatus,
    assets
  ])

  // Multi-file batch import: pick many PNGs and commit each as its own tile for
  // the current layer. Floors mint sequential floor ids; walls mint sequential
  // ids via nextWallId (respecting the passability pref) with per-file height =
  // source height. Ineligible (animated/cycled) target ids are reported, not
  // dropped. Runs independent of the single-source preview / grid slicing.
  const batchImport = useCallback(async () => {
    if (!packDir || !project || !selectedPack) return
    const paths = await window.api.openFiles(
      [{ name: 'PNG image', extensions: ['png'] }],
      packWorkingDir()
    )
    if (paths.length === 0) return
    setCommitting(true)
    setBatchProgress({ done: 0, total: paths.length })
    try {
      const assetsDir = `${packDir}/${project.pack_id}`
      await window.api.ensureDir(assetsDir)
      let packAssets: PackAsset[] = [...project.assets]
      const mintedWalls = new Set(usedIds.wall) // grows as we mint, per-file
      const ineligible: string[] = []
      const failed: string[] = []
      let count = 0
      let done = 0
      let exhausted = false
      for (const p of paths) {
        try {
          const buf = await loadPixelBufferFromPath(p)
          const orient =
            orientationChoice === 'auto' ? detectOrientation(buf).orientation : orientationChoice
          let id: number
          let filename: string
          if (layer === 'wall') {
            const next = nextWallId({
              used: mintedWalls,
              sotp: assets?.sotp ?? null,
              passability: passabilityPref === 'any' ? undefined : passabilityPref
            })
            if (next === null) {
              exhausted = true
              break
            }
            id = next
            mintedWalls.add(id)
            filename = `wall${String(id).padStart(5, '0')}.png`
          } else {
            id = nextSlotId(packAssets, staticTilesKind.parseSlot, { namespace: 'floor' })
            filename = `floor${String(id).padStart(5, '0')}.png`
          }
          const opts = { layer, scale, wallHeight: layer === 'wall' ? buf.height : undefined }
          const conv = convertCell(buf, opts, orient)
          const elig = checkTileEligibility(assets, layer, id)
          if (!elig.eligible && elig.reason) {
            ineligible.push(`${id} (${describeIneligibility(elig.reason)})`)
          }
          const bytes = await pixelBufferToPngBytes(conv)
          await window.api.writeBytes(`${assetsDir}/${filename}`, bytes)
          packAssets = [...packAssets, { filename, sourcePath: p }]
          count++
        } catch {
          failed.push(p.split(/[\\/]/).pop() ?? p)
        }
        done++
        setBatchProgress({ done, total: paths.length })
      }
      const updated: PackProject = {
        ...project,
        assets: packAssets,
        updatedAt: new Date().toISOString()
      }
      await window.api.packSave(`${packDir}/${selectedPack}`, updated)
      setProject(updated)
      const notes: string[] = []
      if (exhausted) notes.push('wall id range exhausted — stopped early')
      if (failed.length) notes.push(`${failed.length} failed to load: ${failed.join(', ')}`)
      if (ineligible.length) {
        notes.push(
          `${ineligible.length} target animated/cycled ids that won't render: ${ineligible.join(', ')}`
        )
      }
      showStatus(
        `Committed ${count} ${layer} tile${count === 1 ? '' : 's'}${notes.length ? ` — ${notes.join('; ')}` : ''}`
      )
    } catch (e) {
      showStatus(`Batch import failed: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setCommitting(false)
      setBatchProgress(null)
    }
  }, [
    packDir,
    project,
    selectedPack,
    layer,
    scale,
    orientationChoice,
    passabilityPref,
    usedIds.wall,
    assets,
    showStatus
  ])

  if (!packDir) {
    return (
      <EmptyStateSettings
        title="Static Tile Manager"
        description="Set an asset-pack working directory in Settings to import and convert tiles."
        onOpenSettings={() => setCurrentPage('settings')}
      />
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WorkingDirToolbar dir={packDir} onChangeDir={handleSetDir}>
        <StatusMessage message={statusMessage} />
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
          {packs.length} static_tiles pack{packs.length !== 1 ? 's' : ''}
        </Typography>
        <Tooltip title="Rescan packs">
          <IconButton size="small" onClick={refreshPacks}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </WorkingDirToolbar>

      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: source + conversion controls */}
        <Box
          sx={{
            width: 320,
            flexShrink: 0,
            borderRight: '1px solid',
            borderColor: 'divider',
            overflow: 'auto',
            p: 2
          }}
        >
          <Stack spacing={2}>
            <Button variant="contained" startIcon={<ImageIcon />} onClick={handleImport} fullWidth>
              Import image…
            </Button>

            <Tooltip title={`Pick many PNGs; commit each as its own ${layer} tile`}>
              <span>
                <Button
                  variant="outlined"
                  startIcon={<LibraryAddIcon />}
                  onClick={batchImport}
                  disabled={!selectedPack || committing}
                  fullWidth
                >
                  Batch import files…
                </Button>
              </span>
            </Tooltip>

            {batchProgress && (
              <Box>
                <LinearProgress
                  variant="determinate"
                  value={
                    batchProgress.total > 0 ? (batchProgress.done / batchProgress.total) * 100 : 0
                  }
                />
                <Typography variant="caption" color="text.secondary">
                  Committing {batchProgress.done}/{batchProgress.total}…
                </Typography>
              </Box>
            )}

            <Box>
              <Typography variant="overline" color="text.secondary">
                Input mode
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                fullWidth
                value={inputMode}
                onChange={(_, v) => v && setInputMode(v)}
              >
                <ToggleButton value="loose">Loose</ToggleButton>
                <ToggleButton value="grid">Grid sheet</ToggleButton>
                <ToggleButton value="wang">Wang</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {inputMode === 'loose' && sourceImage && (
              <Stack spacing={1}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Shape the source before it becomes tiles
                </Typography>
                {layer === 'wall' && (
                  <TextField
                    size="small"
                    label="Tiles wide"
                    type="number"
                    value={wallColumns}
                    onChange={(e) => {
                      setWallColumns(Math.max(1, Number(e.target.value) || 1))
                      setCellIndex(0)
                    }}
                    helperText={
                      wallColumns > 1
                        ? `Cut into ${wallColumns} tiles of ${WALL_FACE_WIDTH}px`
                        : 'One tile — the whole image is fitted to one face'
                    }
                  />
                )}
                {layer === 'wall' && sourceFaceCount > 1 && sourceFaceCount !== wallColumns && (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`Source is ${sourceFaceCount} faces wide`}
                    onClick={() => {
                      setWallColumns(sourceFaceCount)
                      setCellIndex(0)
                    }}
                  />
                )}
                {layer === 'wall' && (
                  <TextField
                    size="small"
                    label="Blank rows below"
                    type="number"
                    value={blankRowsBelow}
                    onChange={(e) => changeBlankRows(Number(e.target.value))}
                    helperText={
                      blankRowsBelow > 0
                        ? `Art ${wallSplit.art}px, ${wallSplit.blank}px empty base — tile ${wallHeightField}px`
                        : 'Empty rows at the base raise the art off the ground'
                    }
                  />
                )}
                <ToggleButton
                  size="small"
                  value="mirror"
                  selected={mirrorSource}
                  onChange={() => setMirrorSource((v) => !v)}
                >
                  Mirror (opposite face)
                </ToggleButton>
              </Stack>
            )}

            {inputMode === 'grid' && (
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <TextField
                  size="small"
                  label="Cell W"
                  type="number"
                  value={cellW}
                  onChange={(e) => setCellW(Number(e.target.value))}
                />
                <TextField
                  size="small"
                  label="Cell H"
                  type="number"
                  value={cellH}
                  onChange={(e) => setCellH(Number(e.target.value))}
                />
                <TextField
                  size="small"
                  label="Margin X"
                  type="number"
                  value={marginX}
                  onChange={(e) => setMarginX(Number(e.target.value))}
                />
                <TextField
                  size="small"
                  label="Margin Y"
                  type="number"
                  value={marginY}
                  onChange={(e) => setMarginY(Number(e.target.value))}
                />
                <TextField
                  size="small"
                  label="Spacing X"
                  type="number"
                  value={spacingX}
                  onChange={(e) => setSpacingX(Number(e.target.value))}
                />
                <TextField
                  size="small"
                  label="Spacing Y"
                  type="number"
                  value={spacingY}
                  onChange={(e) => setSpacingY(Number(e.target.value))}
                />
              </Box>
            )}

            <Divider />

            {inputMode !== 'wang' && (
              <Box>
                <Typography variant="overline" color="text.secondary">
                  Layer
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  fullWidth
                  value={layer}
                  onChange={(_, v) => v && setLayer(v)}
                >
                  <ToggleButton value="floor">Floor</ToggleButton>
                  <ToggleButton value="wall">Wall</ToggleButton>
                </ToggleButtonGroup>
              </Box>
            )}

            <Box>
              <Typography variant="overline" color="text.secondary">
                Scale
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                fullWidth
                value={scale}
                onChange={(_, v) => v && setScale(v)}
              >
                <ToggleButton value={1}>1×</ToggleButton>
                <ToggleButton value={2}>2×</ToggleButton>
              </ToggleButtonGroup>
              {scale === 2 && (
                <Typography variant="caption" color="warning.main">
                  2× is author-ahead — renders only after the client virtual-resolution rebase.
                </Typography>
              )}
            </Box>

            {inputMode !== 'wang' && (
              <Box>
                <Typography variant="overline" color="text.secondary">
                  Orientation
                </Typography>
                <TextField
                  select
                  size="small"
                  fullWidth
                  value={orientationChoice}
                  onChange={(e) => setOrientationChoice(e.target.value as OrientationChoice)}
                >
                  <MenuItem value="auto">
                    Auto{detected ? ` — ${detected.orientation}` : ''}
                  </MenuItem>
                  <MenuItem value="orthogonal">Orthogonal (project → iso)</MenuItem>
                  <MenuItem value="isometric">Isometric (normalize only)</MenuItem>
                </TextField>
                {detected && orientationChoice === 'auto' && (
                  <Typography variant="caption" color="text.disabled">
                    detected {detected.orientation} ({Math.round(detected.confidence * 100)}%
                    confidence)
                  </Typography>
                )}
              </Box>
            )}

            {inputMode !== 'wang' && layer === 'floor' && (
              <Typography variant="caption" color="text.disabled">
                Floors are 56×27 diamonds — corners masked transparent, source alpha kept.
              </Typography>
            )}
            {inputMode === 'wang' && (
              <Typography variant="caption" color="text.disabled">
                Wang mode slices ground autotiles into diamond floors + a mask sidecar.
              </Typography>
            )}
          </Stack>
        </Box>

        {/* Center: previews */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          {!sourceImage ? (
            <Typography sx={{ color: 'text.disabled' }}>
              Import a PNG (loose tile, grid sheet, or wang set) to begin.
            </Typography>
          ) : inputMode === 'wang' ? (
            <WangSlicePanel
              source={sourceImage}
              scale={scale}
              packDir={packDir}
              packFilename={selectedPack}
              project={project}
              assets={assets}
              onProjectChange={setProject}
              onStatus={showStatus}
            />
          ) : (
            <Stack spacing={2}>
              <CellStrip
                cells={cells}
                selected={Math.min(cellIndex, cells.length - 1)}
                onSelect={setCellIndex}
                noun={inputMode === 'loose' ? 'Tile' : 'Cell'}
              />
              <Stack direction="row" spacing={4} sx={{ flexWrap: 'wrap' }}>
                <Box>
                  <Typography variant="subtitle2">
                    Source {previewCell ? `(${previewCell.width}×${previewCell.height})` : ''}
                    {previewCell && previewFit < 1
                      ? ` — shown at ${Math.round(previewFit * 100)}%`
                      : ''}
                  </Typography>
                  <Box
                    component="canvas"
                    ref={srcCanvasRef}
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      imageRendering: 'pixelated'
                    }}
                  />
                </Box>
                <Box>
                  <Typography variant="subtitle2">
                    Converted {converted ? `(${converted.width}×${converted.height})` : ''}
                  </Typography>
                  <Box
                    component="canvas"
                    ref={outCanvasRef}
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      imageRendering: 'pixelated',
                      background:
                        'repeating-conic-gradient(#0000 0% 25%, #8884 0% 50%) 50% / 16px 16px'
                    }}
                  />
                </Box>
              </Stack>
            </Stack>
          )}
        </Box>

        {/* Right: commit (loose/grid only — wang commits from its own panel) */}
        {inputMode !== 'wang' && (
          <Box
            sx={{
              width: 300,
              flexShrink: 0,
              borderLeft: '1px solid',
              borderColor: 'divider',
              overflow: 'auto',
              p: 2
            }}
          >
            <Stack spacing={2}>
              <Typography variant="overline" color="text.secondary">
                Commit to pack
              </Typography>
              <TextField
                select
                size="small"
                fullWidth
                label="Target static_tiles pack"
                value={selectedPack}
                onChange={(e) => setSelectedPack(e.target.value)}
              >
                {packs.length === 0 && (
                  <MenuItem value="" disabled>
                    No static_tiles packs — create one in Asset Pack Manager
                  </MenuItem>
                )}
                {packs.map((p) => (
                  <MenuItem key={p.filename} value={p.filename}>
                    {p.pack_id} (v{p.pack_version})
                  </MenuItem>
                ))}
              </TextField>

              {layer === 'floor' ? (
                <TextField
                  size="small"
                  fullWidth
                  label="Floor tile id"
                  type="number"
                  value={floorId}
                  onChange={(e) => setFloorId(Number(e.target.value))}
                  helperText="Floors are unconstrained server-side (1–65535)."
                />
              ) : (
                <>
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    fullWidth
                    value={wallMode}
                    onChange={(_, v) => v && setWallMode(v)}
                  >
                    <ToggleButton value="mint">New id</ToggleButton>
                    <ToggleButton value="replace">Overwrite</ToggleButton>
                  </ToggleButtonGroup>

                  {wallMode === 'mint' && (
                    <TextField
                      select
                      size="small"
                      fullWidth
                      label="Walkability preference"
                      value={passabilityPref}
                      onChange={(e) => setPassabilityPref(e.target.value as PassabilityPref)}
                      helperText={
                        assets?.sotp
                          ? 'Picks the next free id whose legacy sotp byte matches.'
                          : 'No sotp.dat loaded — range-only allocation.'
                      }
                    >
                      <MenuItem value="any">Any</MenuItem>
                      <MenuItem value="blocking">Blocking</MenuItem>
                      <MenuItem value="passable">Passable</MenuItem>
                    </TextField>
                  )}

                  <TextField
                    size="small"
                    fullWidth
                    label="Wall tile id"
                    type="number"
                    value={wallIdText}
                    onChange={(e) => setWallIdText(e.target.value)}
                    error={hasWallId && !isCommittableWallId(wallId)}
                    helperText={`1–${WALL_ID_MAX}. Sentinels 0–12 and 10000–10012 never draw.`}
                  />

                  {hasWallId && isCommittableWallId(wallId) && !isReclaimableWallId(wallId) && (
                    <Typography variant="caption" color="text.disabled">
                      Not in the reclaimable pool. The id may carry legacy art that a map places.
                    </Typography>
                  )}

                  {suggestedWallId !== null && (
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => setWallIdText(String(suggestedWallId))}
                    >
                      Use next free id ({suggestedWallId})
                    </Button>
                  )}

                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Typography variant="body2">Walkability:</Typography>
                    <Chip size="small" label={wallWalk} color={WALKABILITY_COLOR[wallWalk]} />
                  </Stack>

                  <TextField
                    size="small"
                    fullWidth
                    label="Wall height (1×, px)"
                    type="number"
                    value={wallHeightField}
                    onChange={(e) => setWallHeightField(Math.max(1, Number(e.target.value) || 1))}
                    helperText="The whole tile, art and blank rows. Legacy walls are multiples of 14."
                  />

                  {/* Heights worth knowing, as labels. Nothing here writes the
                      field: the height is the author's, and it stays typed. */}
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                    {sourceHeight !== null && (
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`Source ${sourceHeight}px`}
                        onClick={() => setWallHeightField(sourceHeight + blankRowsBelow)}
                      />
                    )}
                    {referenceHeight !== null && (
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`Legacy ${wallId} is ${referenceHeight}px`}
                        onClick={() => setWallHeightField(referenceHeight)}
                      />
                    )}
                  </Stack>

                  <TextField
                    select
                    size="small"
                    fullWidth
                    label="Angled face"
                    value={wallFace}
                    onChange={(e) => setWallFace(e.target.value as WallFace)}
                    helperText="The tile's intrinsic angle, not its map placement."
                  >
                    <MenuItem value="left">Left (roofline rises →)</MenuItem>
                    <MenuItem value="right">Right (roofline falls →)</MenuItem>
                  </TextField>
                </>
              )}

              {!assets && (
                <Alert severity="info" sx={{ py: 0 }}>
                  No client loaded — render eligibility (animated / palette-cycled) and wall
                  walkability can&apos;t be verified. Commits still write, but aren&apos;t
                  validated.
                </Alert>
              )}

              {wouldOverwrite && (
                <Alert severity="warning" sx={{ py: 0 }}>
                  {layer}
                  {String(targetId).padStart(5, '0')} already exists in this pack. Commit is blocked
                  to avoid overwriting — pick an unused id
                  {layer === 'wall' ? ' or switch to Replace' : ''}.
                </Alert>
              )}

              {!targetEligibility.eligible && targetEligibility.reason && (
                <Alert severity="warning" sx={{ py: 0 }}>
                  Tile {layer === 'wall' ? wallId : floorId} is{' '}
                  {describeIneligibility(targetEligibility.reason)}
                  {targetEligibility.reason === 'animated' && targetEligibility.sequence?.length
                    ? ` (legacy sequence ${targetEligibility.sequence.join(', ')})`
                    : ''}
                  . The client ignores pack art for{' '}
                  {describeIneligibility(targetEligibility.reason)} ids — this PNG won&apos;t
                  render.
                </Alert>
              )}

              <Button
                variant="outlined"
                startIcon={<ViewInArIcon />}
                disabled={!converted}
                onClick={() => setPlacementOpen(true)}
                fullWidth
              >
                Preview in place…
              </Button>

              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                disabled={!converted || !selectedPack || committing || wouldOverwrite}
                onClick={commit}
                fullWidth
              >
                Commit tile
              </Button>

              {inputMode === 'grid' && layer === 'floor' && cells.length > 1 && (
                <Button
                  variant="outlined"
                  disabled={!selectedPack || committing}
                  onClick={commitAllFloors}
                  fullWidth
                >
                  Commit all {cells.length} cells as floors
                </Button>
              )}

              {project && packDir && (
                <CommittedTiles
                  packDir={packDir}
                  packFilename={selectedPack}
                  project={project}
                  onProjectChange={setProject}
                  onStatus={showStatus}
                  onEdit={(ns, id) => {
                    setLayer(ns)
                    if (ns === 'floor') setFloorId(id)
                    else {
                      setWallIdText(String(id))
                      setWallMode('replace')
                    }
                    showStatus(`Editing ${ns} ${id} — import art and commit to replace`)
                  }}
                />
              )}
            </Stack>
          </Box>
        )}
      </Box>

      <WallPlacementPreview
        open={placementOpen}
        onClose={() => setPlacementOpen(false)}
        converted={converted}
        assets={assets}
        scale={scale}
        wallHeight={wallHeightField}
        onWallHeightChange={setWallHeightField}
        blankRows={blankRowsBelow}
        onBlankRowsChange={changeBlankRows}
      />
    </Box>
  )
}

export default StaticTileManagerPage
