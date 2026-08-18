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
  'ambient_sounds',
  'world_maps',
  'town_maps',
  'npc_portraits',
  'static_tiles',
  'creature_sprites',
  'ui_panels'
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
  updatedAt: z.string(),
  // When the pack was last compiled, and where to. Optional: every project
  // written before this existed has neither, and a pack that has never been
  // compiled has neither either. Both are what lets the editor say a pack has
  // changes the .datf does not carry.
  compiledAt: z.string().optional(),
  compiledTo: z.string().optional()
})

/**
 * Schema for the `manifest` argument of `pack:compile`. This is the
 * `_manifest.json` baked into the .datf zip and is what the Hybrasyl
 * client parses. Stays in sync with the manifest object literal built in
 * PackEditor.tsx's handleCompile.
 */
export const packManifestSchema = z
  .object({
    // v2 exists for ui_panels (XML layout files are a new client capability);
    // all other content types stay v1 so older clients keep accepting them.
    schema_version: z.union([z.literal(1), z.literal(2)]),
    ...baseFields
  })
  .superRefine((m, ctx) => {
    const required = m.content_type === 'ui_panels' ? 2 : 1
    if (m.schema_version !== required) {
      ctx.addIssue({
        code: 'custom',
        path: ['schema_version'],
        message: `content_type ${m.content_type} requires schema_version ${required}`
      })
    }
  })

/** Schema for the `assetFilenames` argument of `pack:compile`. */
export const packCompileFilenamesSchema = z.array(z.string())
