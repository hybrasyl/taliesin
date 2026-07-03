import { z } from 'zod'

/**
 * Data model for ui_panels layout XML (layout-version 1).
 * Contract: docs/ui-panel-layout-format.md — Brigid implements the same shapes.
 */

export interface UiRect {
  x: number
  y: number
  w: number
  h: number
}

export const UI_CONTROL_KINDS = ['label', 'button', 'image', 'textbox', 'progressbar'] as const
export type UiControlKind = (typeof UI_CONTROL_KINDS)[number]

export type UiAlign = 'left' | 'center' | 'right'

export interface UiBinding {
  /** Primary value path, e.g. 'player.hp'. */
  path?: string
  /** Max-value path (progressbar denominator / {max} in label formats). */
  maxPath?: string
  /** Boolean path; control hidden while false. */
  visiblePath?: string
  /** Template with {value}/{max} placeholders, optional numeric spec {value:0.0}. */
  format?: string
}

export interface UiControl {
  kind: UiControlKind
  /** [a-z0-9_]+, unique within its variant; feeds the art filename convention. */
  name: string
  rect: UiRect
  align?: UiAlign
  maxLength?: number
  frames?: number
  binding?: UiBinding
}

export interface UiVariant {
  /** [a-z0-9_]+, unique within the panel. */
  name: string
  /** PNG filename inside the pack, per the naming convention. */
  background?: string
  controls: UiControl[]
}

export interface UiPanelLayout {
  /** [a-z0-9_]+, must match the XML filename stem. */
  id: string
  layoutVersion: number
  anchor: UiRect
  variants: UiVariant[]
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const UI_NAME_RE = /^[a-z0-9_]+$/

const uiNameSchema = z
  .string()
  .regex(UI_NAME_RE, 'must be lowercase letters, digits, and underscores')

export const uiRectSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  w: z.number().int().min(0),
  h: z.number().int().min(0)
})

export const uiBindingSchema = z.object({
  path: z.string().min(1).optional(),
  maxPath: z.string().min(1).optional(),
  visiblePath: z.string().min(1).optional(),
  format: z.string().min(1).optional()
})

export const uiControlSchema = z.object({
  kind: z.enum(UI_CONTROL_KINDS),
  name: uiNameSchema,
  rect: uiRectSchema,
  align: z.enum(['left', 'center', 'right']).optional(),
  maxLength: z.number().int().min(1).optional(),
  frames: z.number().int().min(1).optional(),
  binding: uiBindingSchema.optional()
})

export const uiVariantSchema = z
  .object({
    name: uiNameSchema,
    background: z.string().min(1).optional(),
    controls: z.array(uiControlSchema)
  })
  .superRefine((variant, ctx) => {
    const seen = new Set<string>()
    for (const c of variant.controls) {
      if (seen.has(c.name)) {
        ctx.addIssue({
          code: 'custom',
          path: ['controls'],
          message: `duplicate control name "${c.name}" in variant "${variant.name}"`
        })
      }
      seen.add(c.name)
    }
  })

export const uiPanelLayoutSchema = z
  .object({
    id: uiNameSchema,
    layoutVersion: z.number().int().min(1),
    anchor: uiRectSchema,
    variants: z.array(uiVariantSchema).min(1)
  })
  .superRefine((layout, ctx) => {
    const seen = new Set<string>()
    for (const v of layout.variants) {
      if (seen.has(v.name)) {
        ctx.addIssue({
          code: 'custom',
          path: ['variants'],
          message: `duplicate variant name "${v.name}"`
        })
      }
      seen.add(v.name)
    }
  })

/** Buttons never bind (actions stay C#-owned); bind targets are per-kind. */
export const BINDABLE_KINDS: readonly UiControlKind[] = ['label', 'textbox', 'progressbar', 'image']

export function createEmptyLayout(id: string): UiPanelLayout {
  return {
    id,
    layoutVersion: 1,
    anchor: { x: 0, y: 0, w: 160, h: 100 },
    variants: [{ name: 'default', controls: [] }]
  }
}
