import type { z } from 'zod'
import type React from 'react'

export type ContentType =
  | 'ability_icons'
  | 'nation_badges'
  | 'legend_mark_icons'
  | 'ui_sprite_overrides'
  | 'item_icons'

export const ALL_CONTENT_TYPES: readonly ContentType[] = [
  'ability_icons',
  'nation_badges',
  'legend_mark_icons',
  'ui_sprite_overrides',
  'item_icons'
] as const

export interface PackAsset {
  filename: string
  sourcePath: string
}

export interface PackProject {
  pack_id: string
  pack_version: string
  content_type: ContentType
  priority: number
  covers: Record<string, unknown>
  assets: PackAsset[]
  assetMeta?: Record<string, Record<string, unknown>>
  createdAt: string
  updatedAt: string
}

export interface SlotIdentity {
  /** Logical namespace. 'skill'|'spell' for ability_icons, 'nation', 'legend',
   *  'item'. For ui_sprite_overrides this is the source-file token, e.g.
   *  'mile.spf'. */
  namespace: string
  /** Numeric ID inside the namespace, raw filename digits — already in 0/1-base
   *  per the kind's convention (e.g. legend_mark_icons returns 0 for the first
   *  slot). */
  id: number
}

export interface AssetTargetPath {
  /** Path inside the .datf zip (and on disk under packDir). May contain a
   *  single forward slash for ui_sprite_overrides ('mile.spf/0001.png'). */
  zipPath: string
  /** On-disk relative path under packDir, forward-slash separated. */
  relPath: string
}

export interface DimensionRule {
  /** Returns null on success, error string on failure. */
  validate(width: number, height: number): string | null
  /** Display label, e.g. "32×32" or "16–32 × 16–32" or "any". */
  label: string
}

export interface AddAssetOptions {
  /** Per-kind context. ability_icons expects { namespace: 'skill'|'spell' };
   *  ui_sprite_overrides expects { namespace: '<source-filename>' }. */
  ctx?: Record<string, unknown>
  existingAssets: PackAsset[]
}

export type AssetMetaField =
  | { kind: 'boolean'; label: string; help?: string }
  | { kind: 'enum'; label: string; options: string[]; help?: string }

export interface PackKindPanelProps {
  draft: PackProject
  onChange: (updates: Partial<PackProject>) => void
}

export interface PackKind {
  type: ContentType
  /** Human label for the create dialog and editor header. */
  label: string
  /** One-line description shown under the dropdown when this kind is picked. */
  description: string
  dimension: DimensionRule
  /** Initial `covers` blob used at pack creation. */
  defaultCovers(): Record<string, unknown>
  /** Renderer-side strict schema for this kind's covers payload. Main does not
   *  duplicate this — main's project schema accepts any covers blob. */
  coversSchema: z.ZodTypeAny
  /** Parse a stored relPath/zipPath back to a slot identity, or null if the
   *  filename doesn't match this kind's convention. */
  parseSlot(relPath: string): SlotIdentity | null
  /** Compute the next free filename + namespace for an "Add" click. */
  nextAssetPath(opts: AddAssetOptions): AssetTargetPath
  /** Per-asset metadata fields to render as extra columns. The asset table
   *  reads this generically, so a new kind doesn't require editor changes. */
  assetMetaFields?(): Record<string, AssetMetaField>
  /** Namespaces shown in the "Add" splitter. ability_icons returns
   *  ['skill','spell']; ui_sprite_overrides returns the union of existing
   *  source-file tokens (caller appends a "+ new source" entry separately). */
  namespaces?(existing: PackAsset[]): string[]
  /** Optional kind-specific UI panel rendered inside PackEditor. Lets a new
   *  pack type ship its own affordances without PackEditor naming the kind. */
  Panel?: React.FC<PackKindPanelProps>
}
