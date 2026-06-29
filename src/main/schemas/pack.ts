import { z } from 'zod'

const packAssetSchema = z.object({
  filename: z.string(),
  sourcePath: z.string()
})

// Mirrors ContentType in src/renderer/src/packKinds/types.ts. Adding a new
// pack kind: add the literal here, plus a new kind module + registration in
// src/renderer/src/packKinds/index.ts.
const contentTypeSchema = z.enum([
  'ability_icons',
  'nation_badges',
  'legend_mark_icons',
  'ui_sprite_overrides',
  'item_icons',
  'music',
  'sound_effects',
  'world_maps'
])

// Per-kind covers schemas live with their kind modules in
// src/renderer/src/packKinds/<kind>.ts and are enforced renderer-side before
// pack:save. Main accepts any covers blob — main only sees data the renderer
// just produced and validated.
const coversSchema = z.record(z.string(), z.unknown())

// Per-asset metadata: keyed by filename, each value is a kind-defined record
// (e.g. { noDye: true } for item_icons). Never serialized into _manifest.json;
// reduced into covers fields at compile time.
const assetMetaSchema = z.record(z.string(), z.record(z.string(), z.unknown()))

const baseFields = {
  pack_id: z.string().min(1),
  pack_version: z.string(),
  content_type: contentTypeSchema,
  priority: z.number().int(),
  covers: coversSchema,
  assetMeta: assetMetaSchema.optional()
}

/**
 * Schema for `pack:save` payload — the in-progress `.json` project file the
 * renderer maintains while editing an asset pack. Mirrors `PackProject` in
 * src/renderer/src/packKinds/types.ts.
 */
export const packProjectSchema = z.object({
  ...baseFields,
  assets: z.array(packAssetSchema),
  createdAt: z.string(),
  updatedAt: z.string()
})

/**
 * Schema for the `manifest` argument of `pack:compile`. This is the
 * `_manifest.json` baked into the .datf zip and is what the Hybrasyl
 * client parses. Stays in sync with the manifest object literal built in
 * PackEditor.tsx's handleCompile.
 */
export const packManifestSchema = z.object({
  schema_version: z.literal(1),
  ...baseFields
})

/** Schema for the `assetFilenames` argument of `pack:compile`. */
export const packCompileFilenamesSchema = z.array(z.string())
