import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton
} from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'
import type { PackProject } from '../../packKinds'
import type { UiControl, UiControlKind, UiPanelLayout, UiRect } from '../../uiforge/types'
import { parsePanelXml, serializePanelXml } from '../../uiforge/panelXml'
import {
  HANDLE_HIT_RADIUS_SCREEN,
  buildSnapContext,
  cursorForMode,
  hitTest,
  moveRect,
  newControl,
  resizeRect,
  roundRect,
  screenToLogical,
  snapMove,
  snapResize,
  uniqueControlName,
  type DragMode
} from '../../uiforge/canvasGeometry'
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard'
import UnsavedChangesDialog from '../UnsavedChangesDialog'
import LayoutCanvas, { type ForgeZoom } from './LayoutCanvas'
import VariantTabs from './VariantTabs'
import ControlPalette from './ControlPalette'
import PropertyPanel from './PropertyPanel'

export interface ForgePanelProps {
  project: PackProject
  /** Absolute path of the pack's asset directory (packDir/pack_id). */
  projectAssetsDir: string
  /** Absolute path of the project .json file. */
  projectFilePath: string
  panelId: string
  /** Persist project-level mutations (assets list / covers). */
  onProjectChange: (updated: PackProject) => Promise<void>
  onStatus: (msg: string) => void
}

// ── Undo/redo reducer ───────────────────────────────────────────────────────────

interface EditorState {
  present: UiPanelLayout | null
  past: UiPanelLayout[]
  future: UiPanelLayout[]
}

type EditorAction =
  | { type: 'load'; layout: UiPanelLayout }
  | { type: 'commit'; next: UiPanelLayout } // discrete edit — records history
  | { type: 'preview'; next: UiPanelLayout } // live drag — no history
  | { type: 'commitPreview'; before: UiPanelLayout; next: UiPanelLayout } // finalize a drag
  | { type: 'undo' }
  | { type: 'redo' }

const HISTORY_LIMIT = 100
const cap = (arr: UiPanelLayout[]): UiPanelLayout[] =>
  arr.length > HISTORY_LIMIT ? arr.slice(arr.length - HISTORY_LIMIT) : arr

function editorReducer(s: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case 'load':
      return { present: a.layout, past: [], future: [] }
    case 'commit':
      if (!s.present) return { present: a.next, past: [], future: [] }
      return { present: a.next, past: cap([...s.past, s.present]), future: [] }
    case 'preview':
      return { ...s, present: a.next }
    case 'commitPreview':
      return { present: a.next, past: cap([...s.past, a.before]), future: [] }
    case 'undo': {
      if (!s.past.length || !s.present) return s
      const prev = s.past[s.past.length - 1]
      return { present: prev, past: s.past.slice(0, -1), future: [s.present, ...s.future] }
    }
    case 'redo': {
      if (!s.future.length || !s.present) return s
      const next = s.future[0]
      return { present: next, past: cap([...s.past, s.present]), future: s.future.slice(1) }
    }
  }
}

interface DragState {
  mode: DragMode
  name: string
  startX: number
  startY: number
  origRect: UiRect
  before: UiPanelLayout
  pointerId: number
  moved: boolean
}

/** Editor shell for one panel layout: palette, canvas, properties, undo/redo, save. */
const ForgePanel: React.FC<ForgePanelProps> = ({
  project,
  projectAssetsDir,
  panelId,
  onProjectChange,
  onStatus
}) => {
  const [state, dispatch] = useReducer(editorReducer, { present: null, past: [], future: [] })
  const layout = state.present
  const [error, setError] = useState<string | null>(null)
  const [activeVariant, setActiveVariant] = useState<string>('')
  const [zoom, setZoom] = useState<ForgeZoom>(2)
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null)
  const [selectedControl, setSelectedControl] = useState<string | null>(null)
  const [armedKind, setArmedKind] = useState<UiControlKind | null>(null)
  const [hoverCursor, setHoverCursor] = useState('default')
  const dragRef = useRef<DragState | null>(null)

  const layoutPath = `${projectAssetsDir}/${panelId}.xml`

  const {
    markDirty,
    markClean,
    saveRef,
    dialogOpen,
    handleDialogSave,
    handleDialogDiscard,
    handleDialogCancel
  } = useUnsavedGuard(`UI panel ${panelId}`)

  // Load the layout XML.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const buf = await window.api.readFile(layoutPath)
        const parsed = parsePanelXml(new TextDecoder().decode(buf))
        if (cancelled) return
        dispatch({ type: 'load', layout: parsed })
        setActiveVariant(parsed.variants[0]?.name ?? '')
        setSelectedControl(null)
        setError(null)
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : 'unknown error'
        setError(msg)
        onStatus(`Failed to load ${panelId}.xml: ${msg}`)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [layoutPath, panelId, onStatus])

  const variant = useMemo(
    () => layout?.variants.find((v) => v.name === activeVariant) ?? layout?.variants[0] ?? null,
    [layout, activeVariant]
  )

  // Keep active variant / selection valid after undo-redo removes them.
  useEffect(() => {
    if (!layout) return
    if (!layout.variants.some((v) => v.name === activeVariant)) {
      setActiveVariant(layout.variants[0]?.name ?? '')
      setSelectedControl(null)
    }
  }, [layout, activeVariant])
  useEffect(() => {
    if (variant && selectedControl && !variant.controls.some((c) => c.name === selectedControl)) {
      setSelectedControl(null)
    }
  }, [variant, selectedControl])

  const selected = useMemo(
    () => variant?.controls.find((c) => c.name === selectedControl) ?? null,
    [variant, selectedControl]
  )

  // Resolve the variant background PNG to a blob URL (readFile avoids file:// taint).
  useEffect(() => {
    let url: string | null = null
    let cancelled = false
    setBackgroundUrl(null)
    const bg = variant?.background
    if (!bg) return
    ;(async () => {
      try {
        const buf = await window.api.readFile(`${projectAssetsDir}/${bg}`)
        if (cancelled) return
        url = URL.createObjectURL(new Blob([new Uint8Array(buf)], { type: 'image/png' }))
        setBackgroundUrl(url)
      } catch {
        // Background referenced but not on disk yet — canvas shows neutral fill.
      }
    })()
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [variant?.background, projectAssetsDir])

  // ── History-aware mutators ────────────────────────────────────────────────────
  const commit = useCallback(
    (next: UiPanelLayout) => {
      dispatch({ type: 'commit', next })
      markDirty()
    },
    [markDirty]
  )
  const undo = useCallback(() => {
    dispatch({ type: 'undo' })
    markDirty()
  }, [markDirty])
  const redo = useCallback(() => {
    dispatch({ type: 'redo' })
    markDirty()
  }, [markDirty])

  /** Replace the active variant's control list, producing a new layout. */
  const withActiveControls = useCallback(
    (produce: (controls: UiControl[]) => UiControl[]): UiPanelLayout | null => {
      if (!layout || !variant) return null
      return {
        ...layout,
        variants: layout.variants.map((v) =>
          v.name === variant.name ? { ...v, controls: produce(v.controls) } : v
        )
      }
    },
    [layout, variant]
  )

  // ── Discrete edits (PropertyPalette + keyboard) ────────────────────────────────
  const handleControlChange = useCallback(
    (name: string, next: UiControl) => {
      const l = withActiveControls((cs) => cs.map((c) => (c.name === name ? next : c)))
      if (l) commit(l)
      if (name !== next.name && selectedControl === name) setSelectedControl(next.name)
    },
    [withActiveControls, commit, selectedControl]
  )

  const handleDeleteControl = useCallback(
    (name: string) => {
      const l = withActiveControls((cs) => cs.filter((c) => c.name !== name))
      if (l) commit(l)
      if (selectedControl === name) setSelectedControl(null)
    },
    [withActiveControls, commit, selectedControl]
  )

  const handleDuplicateControl = useCallback(
    (name: string) => {
      if (!variant) return
      const src = variant.controls.find((c) => c.name === name)
      if (!src) return
      const copy: UiControl = {
        ...structuredClone(src),
        name: uniqueControlName(
          src.name,
          variant.controls.map((c) => c.name)
        ),
        rect: { ...src.rect, x: src.rect.x + 8, y: src.rect.y + 8 }
      }
      const l = withActiveControls((cs) => [...cs, copy])
      if (l) commit(l)
      setSelectedControl(copy.name)
    },
    [variant, withActiveControls, commit]
  )

  const handleNudge = useCallback(
    (dx: number, dy: number) => {
      if (!selected) return
      const l = withActiveControls((cs) =>
        cs.map((c) => (c.name === selected.name ? { ...c, rect: moveRect(c.rect, dx, dy) } : c))
      )
      if (l) commit(l)
    },
    [selected, withActiveControls, commit]
  )

  const handleAnchorChange = useCallback(
    (anchor: UiRect) => {
      if (layout) commit({ ...layout, anchor })
    },
    [layout, commit]
  )

  // ── Canvas pointer interactions ────────────────────────────────────────────────
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!layout || !variant) return
      const { offsetX, offsetY } = e.nativeEvent
      const pt = screenToLogical(offsetX, offsetY, zoom)

      // Placement mode: drop a new control and disarm.
      if (armedKind) {
        const control = newControl(
          armedKind,
          pt.x,
          pt.y,
          variant.controls.map((c) => c.name),
          layout.anchor
        )
        const l = withActiveControls((cs) => [...cs, control])
        if (l) commit(l)
        setSelectedControl(control.name)
        setArmedKind(null)
        return
      }

      const hit = hitTest(variant.controls, selectedControl, pt, HANDLE_HIT_RADIUS_SCREEN / zoom)
      if (!hit) {
        setSelectedControl(null)
        return
      }
      setSelectedControl(hit.name)
      const orig = variant.controls.find((c) => c.name === hit.name)!
      dragRef.current = {
        mode: hit.mode,
        name: hit.name,
        startX: pt.x,
        startY: pt.y,
        origRect: orig.rect,
        before: layout,
        pointerId: e.pointerId,
        moved: false
      }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [layout, variant, zoom, armedKind, selectedControl, withActiveControls, commit]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!layout || !variant) return
      const { offsetX, offsetY } = e.nativeEvent
      const pt = screenToLogical(offsetX, offsetY, zoom)
      const drag = dragRef.current

      if (!drag) {
        // Hover feedback only.
        if (armedKind) {
          setHoverCursor('crosshair')
        } else {
          const hit = hitTest(
            variant.controls,
            selectedControl,
            pt,
            HANDLE_HIT_RADIUS_SCREEN / zoom
          )
          setHoverCursor(hit ? cursorForMode(hit.mode) : 'default')
        }
        return
      }

      const dx = pt.x - drag.startX
      const dy = pt.y - drag.startY
      if (dx !== 0 || dy !== 0) drag.moved = true
      let rect =
        drag.mode === 'move'
          ? moveRect(drag.origRect, dx, dy)
          : resizeRect(drag.origRect, drag.mode, dx, dy)
      if (!e.altKey) {
        const ctx = buildSnapContext(variant.controls, drag.name, layout.anchor)
        rect = drag.mode === 'move' ? snapMove(rect, ctx) : snapResize(rect, drag.mode, ctx)
      }
      const l = withActiveControls((cs) =>
        cs.map((c) => (c.name === drag.name ? { ...c, rect } : c))
      )
      if (l) dispatch({ type: 'preview', next: l })
    },
    [layout, variant, zoom, armedKind, selectedControl, withActiveControls]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current
      if (!drag) return
      dragRef.current = null
      try {
        e.currentTarget.releasePointerCapture(drag.pointerId)
      } catch {
        // capture may already be gone
      }
      if (!drag.moved || !layout) return
      // Round the dragged control to integer geometry and record one history step.
      const next = withActiveControls((cs) =>
        cs.map((c) => (c.name === drag.name ? { ...c, rect: roundRect(c.rect) } : c))
      )
      if (next) {
        dispatch({ type: 'commitPreview', before: drag.before, next })
        markDirty()
      }
    },
    [layout, withActiveControls, markDirty]
  )

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase()
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select'
      const mod = e.ctrlKey || e.metaKey

      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault()
        redo()
        return
      }
      if (typing) return

      if (e.key === 'Escape') {
        if (armedKind) setArmedKind(null)
        else setSelectedControl(null)
        return
      }
      if (mod && (e.key === 'd' || e.key === 'D')) {
        if (selectedControl) {
          e.preventDefault()
          handleDuplicateControl(selectedControl)
        }
        return
      }
      if (!selectedControl) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        handleDeleteControl(selectedControl)
        return
      }
      const step = e.shiftKey ? 8 : 1
      const nudges: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step]
      }
      const nudge = nudges[e.key]
      if (nudge) {
        e.preventDefault()
        handleNudge(nudge[0], nudge[1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    armedKind,
    selectedControl,
    undo,
    redo,
    handleDuplicateControl,
    handleDeleteControl,
    handleNudge
  ])

  // ── Save ───────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!layout) return
    await window.api.writeFile(layoutPath, serializePanelXml(layout))
    // Keep the project's covers (panel_ids) honest via the page-level saver.
    await onProjectChange(project)
    markClean()
    onStatus(`Saved ${panelId}.xml`)
  }, [layout, layoutPath, project, onProjectChange, markClean, onStatus, panelId])

  useEffect(() => {
    saveRef.current = handleSave
  }, [handleSave, saveRef])

  // Panel switches remount this component (key prop) — drop any stale global
  // dirty registration on the way out.
  useEffect(() => () => markClean(), [markClean])

  const changeLayoutFromTabs = useCallback(
    (mutate: (prev: UiPanelLayout) => UiPanelLayout) => {
      if (layout) commit(mutate(layout))
    },
    [layout, commit]
  )

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error">Failed to load {panelId}.xml</Typography>
        <Typography variant="body2" sx={{ color: 'text.disabled', mt: 1 }}>
          {error}
        </Typography>
      </Box>
    )
  }
  if (!layout || !variant) return null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
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
        <Typography variant="h6" sx={{ flex: 1 }}>
          {layout.id}
          <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.disabled' }}>
            {layout.anchor.w}×{layout.anchor.h} · layout-version {layout.layoutVersion}
          </Typography>
        </Typography>
        <Tooltip title="Undo (Ctrl+Z)">
          <span>
            <IconButton
              size="small"
              onClick={undo}
              disabled={state.past.length === 0}
              aria-label="undo"
            >
              <UndoIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Redo (Ctrl+Y)">
          <span>
            <IconButton
              size="small"
              onClick={redo}
              disabled={state.future.length === 0}
              aria-label="redo"
            >
              <RedoIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={zoom}
          onChange={(_, v) => v && setZoom(v)}
          aria-label="zoom"
        >
          <ToggleButton value={1}>1×</ToggleButton>
          <ToggleButton value={2}>2×</ToggleButton>
          <ToggleButton value={4}>4×</ToggleButton>
        </ToggleButtonGroup>
        <Tooltip title="Save layout">
          <span>
            <IconButton size="small" onClick={handleSave} aria-label="save layout">
              <SaveIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <VariantTabs
        layout={layout}
        activeVariant={variant.name}
        onSelect={(name) => {
          setActiveVariant(name)
          setSelectedControl(null)
        }}
        onChange={changeLayoutFromTabs}
      />

      {/* Body: palette | canvas | properties */}
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <ControlPalette armedKind={armedKind} onArm={setArmedKind} />
        <LayoutCanvas
          layout={layout}
          variant={variant}
          zoom={zoom}
          backgroundUrl={backgroundUrl}
          selectedControl={selectedControl}
          cursor={armedKind ? 'crosshair' : hoverCursor}
          onCanvasPointerDown={handlePointerDown}
          onCanvasPointerMove={handlePointerMove}
          onCanvasPointerUp={handlePointerUp}
        />
        <PropertyPanel
          layout={layout}
          variant={variant}
          selected={selected}
          onControlChange={handleControlChange}
          onDeleteControl={handleDeleteControl}
          onAnchorChange={handleAnchorChange}
        />
      </Box>

      <UnsavedChangesDialog
        open={dialogOpen}
        onSave={handleDialogSave}
        onDiscard={handleDialogDiscard}
        onCancel={handleDialogCancel}
      />
    </Box>
  )
}

export default ForgePanel
