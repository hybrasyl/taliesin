import type { UiControl, UiControlKind, UiPanelLayout, UiRect, UiVariant } from './types'
import { UI_CONTROL_KINDS, uiPanelLayoutSchema } from './types'
import { escapeXml as esc, attr, parseXmlDocument } from '../utils/xmlUtils'

/**
 * Layout XML ⇄ UiPanelLayout (layout-version 1).
 * Format contract: docs/ui-panel-layout-format.md.
 */

// ── Rect helpers ──────────────────────────────────────────────────────────────

export function parseRect(raw: string): UiRect {
  const parts = raw.split(',').map((p) => parseInt(p.trim(), 10))
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`invalid rect "${raw}" — expected "x,y,w,h"`)
  }
  return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] }
}

export function formatRect(rect: UiRect): string {
  return `${rect.x},${rect.y},${rect.w},${rect.h}`
}

// ── Parse ─────────────────────────────────────────────────────────────────────

export function parsePanelXml(xml: string): UiPanelLayout {
  const root = parseXmlDocument(xml).documentElement
  if (root.tagName !== 'panel') {
    throw new Error(`expected <panel> root element, got <${root.tagName}>`)
  }

  const anchorEls = root.querySelectorAll(':scope > anchor')
  if (anchorEls.length !== 1) {
    throw new Error(`expected exactly one <anchor>, found ${anchorEls.length}`)
  }
  const anchor = parseRect(attr(anchorEls[0], 'rect'))

  const variants: UiVariant[] = []
  for (const variantEl of root.querySelectorAll(':scope > variant')) {
    const controls: UiControl[] = []
    for (const el of variantEl.children) {
      const kind = el.tagName as UiControlKind
      if (!UI_CONTROL_KINDS.includes(kind)) {
        throw new Error(
          `unknown control element <${el.tagName}> in variant "${attr(variantEl, 'name')}"`
        )
      }
      const control: UiControl = {
        kind,
        name: attr(el, 'name'),
        rect: parseRect(attr(el, 'rect'))
      }
      const align = attr(el, 'align')
      if (align) control.align = align as UiControl['align']
      if (el.hasAttribute('max-length')) {
        control.maxLength = parseInt(attr(el, 'max-length'), 10)
      }
      if (el.hasAttribute('frames')) {
        control.frames = parseInt(attr(el, 'frames'), 10)
      }
      const path = attr(el, 'bind')
      const maxPath = attr(el, 'bind-max')
      const visiblePath = attr(el, 'bind-visible')
      const format = attr(el, 'format')
      if (path || maxPath || visiblePath || format) {
        control.binding = {
          ...(path ? { path } : {}),
          ...(maxPath ? { maxPath } : {}),
          ...(visiblePath ? { visiblePath } : {}),
          ...(format ? { format } : {})
        }
      }
      controls.push(control)
    }
    const variant: UiVariant = { name: attr(variantEl, 'name'), controls }
    const background = attr(variantEl, 'background')
    if (background) variant.background = background
    variants.push(variant)
  }

  const layout: UiPanelLayout = {
    id: attr(root, 'id'),
    layoutVersion: parseInt(attr(root, 'layout-version', '1'), 10),
    anchor,
    variants
  }
  return uiPanelLayoutSchema.parse(layout)
}

// ── Serialize ─────────────────────────────────────────────────────────────────

/** Stable attribute order keeps saved XML diff-friendly. */
function controlAttrs(c: UiControl): string {
  const parts = [`name="${esc(c.name)}"`, `rect="${formatRect(c.rect)}"`]
  if (c.align) parts.push(`align="${c.align}"`)
  if (c.maxLength !== undefined) parts.push(`max-length="${c.maxLength}"`)
  if (c.frames !== undefined) parts.push(`frames="${c.frames}"`)
  if (c.binding?.path) parts.push(`bind="${esc(c.binding.path)}"`)
  if (c.binding?.maxPath) parts.push(`bind-max="${esc(c.binding.maxPath)}"`)
  if (c.binding?.visiblePath) parts.push(`bind-visible="${esc(c.binding.visiblePath)}"`)
  if (c.binding?.format) parts.push(`format="${esc(c.binding.format)}"`)
  return parts.join(' ')
}

export function serializePanelXml(layout: UiPanelLayout): string {
  uiPanelLayoutSchema.parse(layout)
  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="utf-8"?>')
  lines.push(`<panel id="${esc(layout.id)}" layout-version="${layout.layoutVersion}">`)
  lines.push(`  <anchor rect="${formatRect(layout.anchor)}"/>`)
  for (const v of layout.variants) {
    const vAttrs = [`name="${esc(v.name)}"`]
    if (v.background) vAttrs.push(`background="${esc(v.background)}"`)
    if (v.controls.length === 0) {
      lines.push(`  <variant ${vAttrs.join(' ')}/>`)
      continue
    }
    lines.push(`  <variant ${vAttrs.join(' ')}>`)
    for (const c of v.controls) {
      lines.push(`    <${c.kind} ${controlAttrs(c)}/>`)
    }
    lines.push('  </variant>')
  }
  lines.push('</panel>')
  return lines.join('\n') + '\n'
}
