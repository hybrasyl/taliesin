import { z } from 'zod'

const packAssetSchema = z.object({
  filename: z.string(),
  sourcePath: z.string()
})

/**
 * Schema for `pack:save` payload — the in-progress `.json` project file the
 * renderer maintains while editing an asset pack. Mirrors `PackProject` in
 * `src/renderer/src/components/assetpack/PackEditor.tsx`.
 */
export const packProjectSchema = z.object({
  pack_id: z.string().min(1),
  pack_version: z.string(),
  content_type: z.string(),
  priority: z.number().int(),
  covers: z.record(z.string(), z.unknown()),
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
  schema_version: z.number().int(),
  pack_id: z.string().min(1),
  pack_version: z.string(),
  content_type: z.string(),
  priority: z.number().int(),
  covers: z.record(z.string(), z.unknown())
})

/** Schema for the `assetFilenames` argument of `pack:compile`. */
export const packCompileFilenamesSchema = z.array(z.string())
