import type { UiControl, UiControlKind, UiPanelLayout, UiRect, UiVariant } from './types'
import { backgroundFilename, controlArtFilename } from './artNaming'

/**
 * Legacy control `.txt` prefab → draft UiPanelLayout (pure, unit-tested).
 *
 * Dark Ages panels ship as control files inside setoa.dat / cious.dat; dalib's
 * `ControlFile.fromArchive` parses them into `Control[]`. This module turns one
 * such control file into a first-draft layout the Forge opens on the canvas —
 * heuristic, so it also returns warnings and a list of art jobs the dialog runs
 * to extract each control's PNG. Mapping contract:
 * docs/ui-panel-layout-format.md § Legacy prefab import mapping.
 *
 * Kept structurally decoupled from dalib (plain input shapes below) so it needs
 * no archive to test — dalib's `Control`/`ControlFile` are assignable to these.
 */

/** Legacy ControlType integers (mirrors dalib's const enum ControlType). */
export const CONTROL_TYPE = {
  Anchor: 0,
  ReturnsValue: 3,
  Returns0: 4,
  ReadonlyText: 5,
  EditableText: 6,
  DoesNotReturnValue: 7
} as const

/** Legacy rect (left/top/right/bottom), matching dalib's `Rect`. */
export interface PrefabRect {
  left: number
  top: number
  right: number
  bottom: number
}

/** One (image resource, frame) pair to render for a control. */
export interface PrefabImage {
  imageName: string
  frameIndex: number
}

/** Structural subset of dalib's `Control` this importer reads. */
export interface PrefabControl {
  name: string
  type: number
  rect?: PrefabRect
  returnValue?: number
  images?: PrefabImage[]
}

/** Structural subset of dalib's `ControlFile`. */
export interface PrefabControlFile {
  controls: PrefabControl[]
}

/**
 * A PNG the dialog must extract from the source archive: render `imageName`
 * frame `frameIndex` with the chosen palette and write it to `destFilename`
 * (already convention-named) under the pack project dir.
 */
export interface PrefabArtJob {
  /** Legacy image resource, e.g. "setoa" → an .epf/.spf entry in the archive. */
  imageName: string
  frameIndex: number
  destFilename: string
  /** Human label for the review step, e.g. "hp_bar → normal". */
  label: string
}

export interface PrefabImportResult {
  layout: UiPanelLayout
  artJobs: PrefabArtJob[]
  warnings: string[]
}

const CONTROL_STATE_BY_FRAME = ['normal', 'pressed'] as const

/** Sanitize a legacy control name to `[a-z0-9_]`, never empty. */
export function sanitizeName(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned || 'control'
}

/** left/top/right/bottom (absolute) → x/y/w/h re-based to `origin`. */
function rebaseRect(rect: PrefabRect, origin: { x: number; y: number }): UiRect {
  return {
    x: rect.left - origin.x,
    y: rect.top - origin.y,
    w: Math.max(0, rect.right - rect.left),
    h: Math.max(0, rect.bottom - rect.top)
  }
}

/**
 * Classify a legacy control into a Forge control kind.
 * EditableText → textbox; ReadonlyText → label; images + a return value →
 * button; images only → image; anything else → label (flagged).
 */
export function classifyControl(control: PrefabControl): {
  kind: UiControlKind
  warning?: string
} {
  const hasImages = (control.images?.length ?? 0) > 0
  const hasReturn = control.returnValue !== undefined
  switch (control.type) {
    case CONTROL_TYPE.EditableText:
      return { kind: 'textbox' }
    case CONTROL_TYPE.ReadonlyText:
      return { kind: 'label' }
  }
  if (hasImages && hasReturn) return { kind: 'button' }
  if (hasImages) return { kind: 'image' }
  return {
    kind: 'label',
    warning: `control "${control.name}" (type ${control.type}) had no clear kind — defaulted to label`
  }
}

/**
 * Draft a single-variant layout from a legacy control file.
 *
 * The first `Anchor` control fixes the panel's coordinate origin and logical
 * size; every other control's rect is re-based to it. When no Anchor is present
 * the bounding box of all rects is used (with a warning). Names are sanitized
 * and de-duplicated; each control's images become art jobs (frame 0 → normal,
 * frame 1 → pressed), and the anchor's own image becomes the variant background.
 */
export function controlFileToLayout(
  cf: PrefabControlFile,
  panelId: string,
  variantName = 'default'
): PrefabImportResult {
  const warnings: string[] = []
  const artJobs: PrefabArtJob[] = []

  const controls = cf.controls ?? []
  const anchorIndex = controls.findIndex((c) => c.type === CONTROL_TYPE.Anchor)
  const anchorControl = anchorIndex >= 0 ? controls[anchorIndex] : undefined

  // Anchor rect + origin: the anchor control's rect, else the bounding box.
  let anchor: UiRect
  let origin: { x: number; y: number }
  if (anchorControl?.rect) {
    const r = anchorControl.rect
    origin = { x: r.left, y: r.top }
    anchor = { x: 0, y: 0, w: Math.max(0, r.right - r.left), h: Math.max(0, r.bottom - r.top) }
  } else {
    const rects = controls.map((c) => c.rect).filter((r): r is PrefabRect => !!r)
    if (rects.length) {
      const minLeft = Math.min(...rects.map((r) => r.left))
      const minTop = Math.min(...rects.map((r) => r.top))
      const maxRight = Math.max(...rects.map((r) => r.right))
      const maxBottom = Math.max(...rects.map((r) => r.bottom))
      origin = { x: minLeft, y: minTop }
      anchor = { x: 0, y: 0, w: maxRight - minLeft, h: maxBottom - minTop }
    } else {
      origin = { x: 0, y: 0 }
      anchor = { x: 0, y: 0, w: 160, h: 100 }
    }
    warnings.push('no Anchor control found — derived the panel bounds from all control rects')
  }

  // Anchor image → variant background.
  let background: string | undefined
  const anchorImage = anchorControl?.images?.[0]
  if (anchorImage) {
    background = backgroundFilename(panelId, variantName)
    artJobs.push({
      imageName: anchorImage.imageName,
      frameIndex: anchorImage.frameIndex,
      destFilename: background,
      label: 'background'
    })
  }

  const used = new Set<string>()
  const uniqueName = (raw: string): string => {
    const base = sanitizeName(raw)
    let name = base
    let n = 2
    while (used.has(name)) name = `${base}_${n++}`
    used.add(name)
    return name
  }

  const uiControls: UiControl[] = []
  controls.forEach((control, i) => {
    if (i === anchorIndex) return // consumed as the anchor
    if (!control.rect) {
      warnings.push(`control "${control.name}" has no rect — skipped`)
      return
    }
    const { kind, warning } = classifyControl(control)
    if (warning) warnings.push(warning)
    const name = uniqueName(control.name)
    const uiControl: UiControl = { kind, name, rect: rebaseRect(control.rect, origin) }
    uiControls.push(uiControl)

    // Control images → normal/pressed art jobs (further frames aren't mapped).
    const images = control.images ?? []
    images.forEach((img, frame) => {
      const state = CONTROL_STATE_BY_FRAME[frame]
      if (!state) return
      artJobs.push({
        imageName: img.imageName,
        frameIndex: img.frameIndex,
        destFilename: controlArtFilename(panelId, name, state),
        label: `${name} → ${state}`
      })
    })
  })

  const variant: UiVariant = { name: variantName, controls: uiControls }
  if (background) variant.background = background

  const layout: UiPanelLayout = {
    id: panelId,
    layoutVersion: 1,
    anchor,
    variants: [variant]
  }

  return { layout, artJobs, warnings }
}
