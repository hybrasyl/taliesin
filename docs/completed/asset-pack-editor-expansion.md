# Asset Pack Editor — Expansion to all 5 shipping content types + .datf import

## Context

Taliesin's Asset Pack editor currently supports 2 of the 5 content types that the Hybrasyl client ships with: `ability_icons` and `nation_badges`. The other three — `legend_mark_icons`, `ui_sprite_overrides`, `item_icons` — are documented and live in the client but cannot be authored in Taliesin today. The editor also has no import path, so once a `.datf` is compiled it can't be opened back up to edit.

This plan refactors the editor around a per-type "pack kind" registry so each content type owns its naming/ID rules, dimensions, covers schema, and any kind-specific UI affordances. It then adds the missing 3 types and a `.datf` round-trip importer on that scaffolding.

Reference: `E:\Dark Ages Dev\Repos\Comhaigne\docs\plans\hybrasyl.client\asset-pack-format.md` and the per-domain authoring guides (`item-icons-authoring-guide.md`, `legend-mark-icons-authoring-guide.md`, `item-asset-pack-scoping.md`, `ui-asset-pack-scoping.md`).

## Out of scope

- `ui_panels` (schema_version 2, XML layouts) — separate planned effort.
- `tiles`, `creatures`, `effects`, `bundle` content types (planned in Comhaigne docs but not yet shipping in client).
- Hot-reload, font packs, panel localization (deferred per Comhaigne).

## Reusable utilities

The codebase already has the building blocks we need; no new image/zip dependencies required:

- **`loadPixelBufferFromPath`** ([src/renderer/src/utils/imageLoader.ts:6](src/renderer/src/utils/imageLoader.ts#L6)) — reads a PNG via `window.api.readFile`, decodes through a Blob URL + canvas (avoiding `file://` taint that Electron's webSecurity imposes), and returns `{ data: Uint8ClampedArray, width, height }`. Gives us **dimensions and RGBA pixels in one call** — drives both dimension validation and item-icon dye-color compliance.
- **`pixelBufferToPngBytes`** ([src/renderer/src/utils/imageLoader.ts:60](src/renderer/src/utils/imageLoader.ts#L60)) — round-trips RGBA back to PNG bytes; useful if we ever need to rewrite an asset (not needed for this plan but available).
- **`unzipper`** ([package.json:44](package.json#L44)) — already a direct dep, streaming. Used for `pack:import`. No need to add `yauzl`.
- **`archiver`** — already used by `packCompile`; reused as-is.

## Critical files

Existing:

- `src/main/schemas/pack.ts` — covers schemas live here
- `src/main/handlers.ts:776–880` — pack IPC
- `src/renderer/src/pages/AssetPackPage.tsx` — list/select/create/delete + hosts editor
- `src/renderer/src/components/assetpack/PackEditor.tsx` — the editor itself
- `src/renderer/src/components/assetpack/CreatePackDialog.tsx` — content_type dropdown (hardcoded)
- `src/renderer/src/components/assetpack/__tests__/PackEditor.test.tsx`
- `src/renderer/src/__tests__/integration/AssetPackPage.integration.test.tsx`
- `src/preload/index.ts`, `src/renderer/src/env.d.ts`, `src/renderer/src/__tests__/setup/mockApi.ts` — IPC surface declarations

New:

- `src/renderer/src/packKinds/` — registry + per-kind modules
- `src/main/schemas/pack/coversAbilityIcons.ts`, `coversNationBadges.ts`, `coversLegendMarks.ts`, `coversItemIcons.ts`, `coversUiSpriteOverrides.ts`
- `src/renderer/src/components/assetpack/ItemIconsPanel.tsx`
- `src/renderer/src/components/assetpack/UiSpriteSourcesPanel.tsx`

## Pack-kind registry interface

`src/renderer/src/packKinds/types.ts`:

```ts
import type { z } from 'zod'

export type ContentType =
  | 'ability_icons'
  | 'nation_badges'
  | 'legend_mark_icons'
  | 'ui_sprite_overrides'
  | 'item_icons'

export interface SlotIdentity {
  /** Logical namespace. 'skill'|'spell' for ability_icons, 'nation', 'legend',
   *  'item'. For ui_sprite_overrides this is the source-file token, e.g. 'mile.spf'. */
  namespace: string
  /** Numeric ID inside the namespace, raw filename digits (already in 0/1-base
   *  according to the kind's convention). */
  id: number
}

export interface AssetTargetPath {
  /** Path inside the .datf zip (and on disk under packDir). May contain a single
   *  forward slash for ui_sprite_overrides ('mile.spf/0001.png'). */
  zipPath: string
  /** Same string with forward slashes — used as the on-disk relative path. */
  relPath: string
}

export interface DimensionRule {
  /** Returns null on success, error string on failure. */
  validate(width: number, height: number): string | null
  /** Display label, e.g. "32×32" or "16–32×16–32". */
  label: string
}

export interface AddAssetOptions {
  /** Per-kind context: source filename for ui_sprite_overrides,
   *  namespace selector ('skill'|'spell') for ability_icons. */
  ctx?: Record<string, unknown>
  existingAssets: { filename: string; meta?: Record<string, unknown> }[]
}

export type AssetMetaField =
  | { kind: 'boolean'; label: string; help?: string }
  | { kind: 'enum'; label: string; options: string[] }

export interface PackKind {
  type: ContentType
  label: string // 'Ability Icons (skill/spell)'
  description: string // shown in CreatePackDialog
  dimension: DimensionRule
  defaultCovers(): Record<string, unknown>
  coversSchema: z.ZodType
  parseSlot(relPath: string): SlotIdentity | null
  nextAssetPath(opts: AddAssetOptions): AssetTargetPath
  assetMetaFields?(): Record<string, AssetMetaField>
  /** Namespaces for the "Add" splitter. ability_icons returns ['skill','spell'];
   *  ui_sprite_overrides returns existing source-file tokens + a virtual "+ new". */
  namespaces?(existing: { filename: string }[]): string[]

  /** Optional kind-specific UI panel rendered inside PackEditor.
   *  Lets a new pack type ship its own affordances without PackEditor needing
   *  to know about it. Receives the current draft + an updater callback. */
  Panel?: React.FC<{
    draft: PackProject
    onChange: (next: Partial<PackProject>) => void
  }>
}
```

### Modularity

The registry is the single contract for adding a pack type. The recipe to add a new content type (e.g. `tiles` once it ships in the client):

1. **Create `src/main/schemas/pack/coversTiles.ts`** — exports a zod schema for the new covers shape.
2. **Create `src/renderer/src/packKinds/tiles.ts`** — exports a `PackKind` implementing the interface above. If the kind needs a kind-specific UI section, define a `Panel` component in the same file (or import from a sibling).
3. **Register in `src/renderer/src/packKinds/index.ts`** — add the import to the `PACK_KINDS` map. This is the only edit outside the new files.
4. **Add a variant to the discriminated union in `src/main/schemas/pack.ts`** — one new `z.object({ content_type: z.literal('tiles'), covers: coversTilesSchema, ...baseProject })` entry.
5. **Tests** — table-driven schema test gets one new row; `PackEditor.test.tsx` gets a kind-specific describe block following the same shape as the others.

No edits required to `CreatePackDialog.tsx`, `AssetPackPage.tsx`, `PackEditor.tsx`, or any IPC handler. The dialog reads `listKinds()`, the page uses `getKind(ct).defaultCovers()`, and `PackEditor` dispatches all behavior through the registry methods plus the optional `Panel`.

Two design choices that protect modularity:

- **`Panel` as a kind-owned component**, not a switch in `PackEditor`. `ItemIconsPanel` and `UiSpriteSourcesPanel` are exported from their kind modules (`itemIcons.ts`, `uiSpriteOverrides.ts`) as `Panel`. `PackEditor` renders `<kind.Panel draft={draft} onChange={...} />` if defined, never naming any specific kind.
- **`assetMetaFields()` as kind-owned schema**, not hardcoded. The asset table reads the field list from the kind, renders columns generically, and persists per-asset state through the same `assetMeta` map regardless of kind.

`src/renderer/src/packKinds/index.ts` exports `PACK_KINDS: Record<ContentType, PackKind>`, `getKind(ct)`, `listKinds()`.

## Schema migration (`src/main/schemas/pack.ts`)

Constraint: `tsconfig.web.json` includes only `src/renderer/src/**/*` and `tsconfig.node.json` includes only `src/main/**/*` and `src/preload/**/*`. The renderer cannot import from `src/main/`. Per-kind covers schemas therefore live **inside renderer kind modules** (`src/renderer/src/packKinds/<kind>.ts`); main does not duplicate them. Main only sees data the renderer just produced and validated, so per-kind enforcement at the renderer is sufficient.

Main's job is project shape + that `content_type` is one of the 5 known literals. Adding a new content_type later: one literal in the enum here + new kind module + registry entry.

```ts
const baseFields = {
  pack_id: z.string().min(1),
  pack_version: z.string(),
  content_type: z.enum([
    'ability_icons',
    'nation_badges',
    'legend_mark_icons',
    'ui_sprite_overrides',
    'item_icons'
  ]),
  priority: z.number().int(),
  covers: z.record(z.string(), z.unknown()),
  assetMeta: z.record(z.string(), z.record(z.string(), z.unknown())).optional()
}

export const packProjectSchema = z.object({
  ...baseFields,
  assets: z.array(packAssetSchema),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const packManifestSchema = z.object({
  schema_version: z.literal(1),
  ...baseFields
})
```

Per-kind covers shapes (enforced renderer-side via `kind.coversSchema`):

| Kind                  | Covers shape                                  |
| --------------------- | --------------------------------------------- |
| `ability_icons`       | `{ ability_icons: { dimensions: [32, 32] } }` |
| `nation_badges`       | `{ nation_badges: {} }` (strict)              |
| `legend_mark_icons`   | `{ legend_mark_icons: {} }` (strict)          |
| `ui_sprite_overrides` | `{ ui_sprite_overrides: {} }` (strict)        |
| `item_icons`          | `{ item_icons: { no_dye?: number[] } }`       |

`schema_version` is `z.literal(1)`. The manifest never carries `assets`, `assetMeta`, `createdAt`, `updatedAt`.

`assetMeta` is keyed by filename and holds per-kind state (today: `{ noDye?: boolean }` for `item_icons`). It never serializes into `_manifest.json` — at compile time, `item_icons.no_dye` is reduced from `assetMeta`.

**Tradeoff:** `assetMeta` as a sibling map vs. promoting `assets[]` to `{ filename, sourcePath, meta }`. The sibling map preserves the on-wire shape of existing `_manifest.json` files (no migration story for already-shipped 2-type packs) and limits churn to projects that opt in. The codebase is small, but this still avoids touching every existing test fixture.

## Phase breakdown

### Phase 1 — Registry scaffolding + schema migration

No UI behavior change. The 2 existing content types route through the registry; new types defined but unused by UI yet.

**New files:**

- `src/renderer/src/packKinds/types.ts`, `index.ts`
- `src/renderer/src/packKinds/abilityIcons.ts`, `nationBadges.ts`, `legendMarkIcons.ts`, `itemIcons.ts`, `uiSpriteOverrides.ts`
- `src/renderer/src/packKinds/__tests__/packKinds.test.ts` — per-kind table tests for `parseSlot`, `nextAssetPath`, `dimension.validate`, `coversSchema`

**Modified:**

- `src/main/schemas/pack.ts` — `content_type` becomes `z.enum(...)`; `assetMeta` added; `schema_version` becomes `z.literal(1)`
- `src/main/__tests__/schemas.test.ts` — update `validPackProject` to include the new shape; add tests for unknown content_type and assetMeta

**Verification:** existing `npm test` passes after fixture updates; load an existing 2-type pack, confirm it parses through the new union.

---

### Phase 2 — Wire registry into Create + Edit UI

The dropdown lists all 5 types; create/save/compile use registry rules. `item_icons` and `ui_sprite_overrides` work end-to-end with generic add UX (specifics arrive in Phase 3).

**Modified:**

- `src/renderer/src/components/assetpack/CreatePackDialog.tsx` — replace hardcoded `CONTENT_TYPES` with `listKinds().map(k => ({ value: k.type, label: k.label }))`. Show `kind.description` and `kind.dimension.label` as helper text.
- `src/renderer/src/pages/AssetPackPage.tsx` — drop `DEFAULT_COVERS`; call `getKind(contentType).defaultCovers()` in `handleCreate`. Tighten `PackProject.content_type` to `ContentType`.
- `src/renderer/src/components/assetpack/PackEditor.tsx` — delete `slotIdFromFilename` and `nextSlotId`; route through `kind.parseSlot` and `kind.nextAssetPath`. "Add PNG" becomes a `SplitButton` when `kind.namespaces` returns >1 entry (skill/spell for `ability_icons`; existing source tokens + "+ new source" for `ui_sprite_overrides`). Slot column shows `namespace` + `id`.

**Tests:**

- Extend `PackEditor.test.tsx` with one describe-block per kind covering filename rule and 0/1-based first-id (`legend0000`, `item00001`, `mile.spf/0000.png`).
- Extend `AssetPackPage.integration.test.tsx` to create a `legend_mark_icons` pack and verify covers payload.

**Tradeoff:** SplitButton vs. always-modal "which namespace?" picker. SplitButton is faster for the common `ability_icons` case; for `ui_sprite_overrides` "New source file..." opens a small dialog only when picked, so simple cases stay simple.

---

### Phase 3 — Item-icons / UI-sprite-overrides specifics + dimension validation

Validation runs renderer-side via the existing `loadPixelBufferFromPath` ([src/renderer/src/utils/imageLoader.ts:6](src/renderer/src/utils/imageLoader.ts#L6)) — no new IPC, no new dependency. The same call gives us `{width, height}` for dimension checks **and** RGBA pixels for the dye-color scan.

**New files:**

- `src/renderer/src/packKinds/itemIconsDye.ts` — `CANONICAL_DYE_HEX = ['#B393C7','#9B7BB7','#8F5BA3','#7F3B93','#47235F','#37005B']`, `parseHex(hex): [r,g,b]`, `isCanonicalDye(r,g,b): boolean`, `scanDyeUsage(buf: PixelBuffer): { canonicalPixels: number; nonDyeablePurplePixels: number; totalOpaquePixels: number }` — iterates `buf.data` once, counts pixels matching the 6 canonical RGBAs versus near-purple-but-non-canonical pixels (a heuristic warning for "did you mean to use a canonical purple?").
- `src/renderer/src/components/assetpack/ItemIconsPanel.tsx` — collapsible kind-specific section: 6-color swatch reference + computed no_dye list view.
- `src/renderer/src/components/assetpack/UiSpriteSourcesPanel.tsx` — collapsible: lists each source-file token (group), counts frames per group, supports rename/remove of a whole group. Supports many groups in one pack (multi-source from day one).

**Modified:**

- `src/renderer/src/components/assetpack/PackEditor.tsx` — after `openFile` returns the picked path, call `loadPixelBufferFromPath(filePath)` once, then:
  - `kind.dimension.validate(width, height)` — abort + status message on mismatch, never call `packAddAsset`.
  - For `item_icons`: optionally call `scanDyeUsage(buf)`. If `nonDyeablePurplePixels > 0` and the asset isn't flagged `noDye`, surface a non-blocking warning ("3 near-purple pixels not in canonical palette — did you mean to use the dye colors? Mark as no_dye to suppress").
  - Render kind-specific panel(s). When `kind.assetMetaFields()` returns fields, render extra columns in the asset table (e.g. "No dye" checkbox for `item_icons`).
  - On save, for `item_icons`, recompute `covers.item_icons.no_dye` from `assetMeta` (sorted ascending).
- `src/main/handlers.ts` — `packAddAsset` currently only mkdirs `safePack`; needed for `mile.spf/0001.png` to land in a nested dir. Add `fs.mkdir(dirname(dest), { recursive: true })` before the copy. Confirm `assertInside` allows the nested path.

**Tests:**

- `PackEditor.test.tsx` — 29×29 PNG into `ability_icons` pack: status error surfaces, no `packAddAsset` call.
- `PackEditor.test.tsx` — toggling "No dye" on an `item_icons` asset and saving puts the slot id into `covers.item_icons.no_dye`.
- `PackEditor.test.tsx` — adding three PNGs across two `ui_sprite_overrides` source groups (`mile.spf` + `nation.spf`) produces nested `mile.spf/0000.png`, `mile.spf/0001.png`, `nation.spf/0000.png` on disk.
- New `src/renderer/src/packKinds/__tests__/itemIconsDye.test.ts` — `isCanonicalDye` matches all 6 hexes (case-insensitive), rejects near-misses; `scanDyeUsage` correctly counts on a synthetic `PixelBuffer`.
- `src/main/__tests__/ipc.handlers.test.ts` — `packAddAsset` with a nested target filename creates the parent directory.

**Note:** because pixel decode happens in the renderer canvas (not main), there's no new IPC channel and nothing to add to `mockApi.ts` or `env.d.ts`. The cost is the renderer-side decode for every "Add PNG" — negligible for typical icon-sized PNGs.

---

### Phase 4 — `.datf` import (round-trip)

**New IPC:**

- `pack:import(datfPath, packDir, { force: boolean })` → `{ projectFilename: string; warnings: string[] }`.
  1. Validate `datfPath` ends in `.datf`, inside an allowed root.
  2. Open with `unzipper` ([package.json:44](package.json#L44), already a direct dep). Streaming matters because `ui_sprite_overrides` packs can have hundreds of frames across many source-file groups.
  3. Read every entry; locate `_manifest.json`, parse against `packManifestSchema` (the new union).
  4. Determine `pack_id` from manifest. Refuse if `path.join(packDir, pack_id)` exists unless `force`.
  5. `mkdir packDir/<pack_id>`; stream non-manifest entries into it. Preserve subdirs (`mile.spf/0000.png`). Run `assertInside(packAssetsDir, entry.fileName)` on every entry to block Zip-Slip.
  6. Build a `PackProject`:
     - `assets[]` from the file list; warn (don't fail) on filenames `kind.parseSlot` can't parse.
     - `sourcePath` = the in-pack absolute path (original source is lost on compile).
     - `assetMeta`: for `item_icons`, hydrate `{ noDye: true }` for ids in `covers.item_icons.no_dye`.
     - `priority` defaults to 100 if absent.
     - `createdAt`/`updatedAt` = `new Date().toISOString()`.
  7. Re-validate via `packProjectSchema` before writing `<packDir>/<pack_id>.json`.
  8. Return filename + per-asset warnings.

**Modified:**

- `src/main/handlers.ts` — register `pack:import`. Reuse `parseOrLog`/`assertInside` patterns.
- `src/preload/index.ts`, `src/renderer/src/env.d.ts`, `src/renderer/src/__tests__/setup/mockApi.ts` — declare `packImport`.
- `src/renderer/src/pages/AssetPackPage.tsx` — toolbar button "Import .datf" next to "New Pack". Calls `openFile` with `.datf` filter, then `packImport`, then `refresh()` and select the new pack. Surface warnings via status (or small dialog if non-empty).

**Tests (`src/main/__tests__/ipc.handlers.test.ts`):**

- Build a tiny zip in-memory with stub manifest + `legend0000.png`/`legend0001.png`; assert project JSON shape and on-disk PNG paths.
- Reject manifest with bogus `content_type`.
- Reject zip entry named `../escape.png`.
- `force: false` against existing pack throws; `force: true` overwrites.
- `ui_sprite_overrides` round-trip preserves `mile.spf/0001.png` and `kind.parseSlot` produces `{namespace:'mile.spf', id:1}`.
- `item_icons` with `covers.item_icons.no_dye = [3, 5]` hydrates `assetMeta['item00003.png'] = {noDye:true}`.

Plus a renderer integration test: mock `packImport` resolved value, click Import, confirm refresh + selection.

**Tradeoff:** `unzipper` over `adm-zip` (would be a new dep) — streaming wins for large UI override packs and we already use it. We do not recover original `sourcePath` on import (lost in compile); set it to the in-pack absolute path so the schema stays valid. Re-add from disk is opt-in.

---

### Phase 5 — Polish + cross-cutting cleanup

**Modified:**

- `src/renderer/src/components/assetpack/PackEditor.tsx` — replace `<img src={'file://...'}>` (flaky on Windows + Electron file-protocol restrictions) with a Blob URL pattern: read bytes via existing `readFile`, `URL.createObjectURL(new Blob([bytes], {type:'image/png'}))`, revoke on unmount. Group `ui_sprite_overrides` table rows by namespace under collapsible headings.

**Manual smoke (user-run):**

1. **`ability_icons`**: New Pack → 32×32 PNG → "Add Skill Icon" yields `skill0001.png`; "Add Spell Icon" yields `spell0001.png`. Compile → Import. Namespaces and slot ids match.
2. **`legend_mark_icons`**: New Pack → 20×20 PNG → first slot is `legend0000.png` (0-based). 21×20 accepted; 22×22 rejected.
3. **`item_icons`**: New Pack → 16×16 PNG → `item00001.png` (5 digits). Mark "No dye" → save → `covers.item_icons.no_dye === [1]`. Swatch panel shows the 6 canonical hex values.
4. **`ui_sprite_overrides`**: New Pack → "New source file..." → `mile.spf` → 3 PNGs land at `<packDir>/<pack_id>/mile.spf/0000.png|0001.png|0002.png`. Compile → Import → confirm grouping.
5. **End-to-end with client**: compile an `item_icons` pack, drop into client's data dir alongside legacy `.dat` files, launch client, confirm icons render with correct dye behavior.

## IPC contract (final state)

| Channel            | Args                                       | Returns                         | Status                      |
| ------------------ | ------------------------------------------ | ------------------------------- | --------------------------- |
| `pack:scan`        | `dirPath`                                  | `PackSummary[]`                 | existing                    |
| `pack:load`        | `filePath`                                 | `PackProject`                   | existing                    |
| `pack:save`        | `filePath, project`                        | `void`                          | existing (schema tightened) |
| `pack:delete`      | `filePath`                                 | `void`                          | existing                    |
| `pack:addAsset`    | `packDir, sourcePath, targetFilename`      | `void`                          | existing (mkdir parent)     |
| `pack:removeAsset` | `packDir, filename`                        | `void`                          | existing                    |
| `pack:compile`     | `packDir, manifest, filenames, outputPath` | `void`                          | existing (schema tightened) |
| `pack:import`      | `datfPath, packDir, {force}`               | `{projectFilename, warnings[]}` | **new (Phase 4)**           |

PNG dimension and pixel-level checks happen renderer-side via the existing `loadPixelBufferFromPath` — no IPC needed.

## Resolved decisions

- **No migration story for existing packs** — only test packs exist outside the editor.
- **`ui_sprite_overrides` is multi-source from day one** — one pack covers many source-file groups (`mile.spf` + `nation.spf` + ...).
- **Item-icon dye-color scanner ships in Phase 3** — reuses `loadPixelBufferFromPath`; no new dependency.
- **Commit per phase** — five commits, each independently testable and shippable.
- **Modularity is a hard requirement** — adding a new pack type touches only the new kind module + one line in `packKinds/index.ts` + one variant in the schema union. No edits to UI components or IPC handlers.
