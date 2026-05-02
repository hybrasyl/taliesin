# Tile Collision (SOTP) Asset Pack

## What SOTP is

**SOTP** stands for **Static Object Tile Properties**. It pairs with the `stc` (static) tile-ID space the table indexes on, with each byte encoding the properties of one foreground tile.

The Hybrasyl client uses `sotp.dat` (packed inside `ia.dat`) as a flat per-tile-ID lookup that decides whether a static foreground tile is walkable — and carries one additional property bit alongside.

### Confirmed encoding (sampled from retail ia.dat, 2026-05-01)

The `sotp.dat` file is a flat byte array. Across 20,423 bytes only four distinct values appear in retail data:

| Byte | Count | % | Meaning |
|---|---|---|---|
| `0x0f` | 15,782 | 77.3% | impassable, static |
| `0x00` | 4,265  | 20.9% | passable, static |
| `0x80` | 322    | 1.6%  | passable, **animated tile** (cycles frames — fountains, fires, candles, water) |
| `0x8f` | 54     | 0.3%  | impassable, animated tile |

Encoding rules confirmed against an in-game corpus of 14 known tile IDs (10 impassable / 4 passable, all matched 14/14):

- **Indexing is 1-based.** Foreground tile ID `N` lives at `sotp[N-1]`. Tile 0 is the empty marker — it has no SOTP entry — so the array packs tiles 1..20423 starting at byte 0. Reading `sotp[N]` directly shifts every answer by one slot.
- **Collision is the low nibble (`& 0x0f`).** `0x0` = passable, `0xf` = impassable (binary `1111`, "fully blocked"). Intermediate values 0x1..0xe are unused in retail.
- **Bit 7 (`0x80`) is the animated-tile flag.** Set on 376 tiles total (322 passable, 54 impassable). It does NOT affect collision — both `0x80` and `0x00` are walkable. Visual sampling confirmed every tile in the bit-7 ranges (16208..16863, 17802..17855, 18213..18254, 19544..19585, etc.) is an animated tile — fountains, fires, candles, flowing water. The bit is redundant with `gndani.tbl` / `stcani.tbl` (which carry the actual animation frame data) and likely exists as a fast lookup for the engine — "does this tile cycle?" without scanning the animation tables.
- **Other high-nibble bits (`0x10..0x40`) appear unused** in retail data. The full nibble space is reserved for future extension.

> Note: [dat-files.md:190](./dat-files.md#L190) describes the client masking every byte with `& 0xF0` after read. That doesn't square with the actual byte distribution (only `0x0f` would be impassable post-mask if mask were `0x0F`; the empirical impassable bytes are `0x0f` and `0x8f`). Either the mask direction is misdocumented or the masking step is followed by a separate inversion. Worth re-reading the client's `FUN_005CF3B0` to confirm.

## Context

There is no path to override SOTP without patching the legacy binary today, and legacy binary editing is explicitly off the table for this project.

This plan introduces a new `.datf` content type, `tile_collision`, that ships sparse per-tile-ID overrides as JSON. The client merges the override map onto the in-memory SOTP table at load time, with multi-pack priority resolution. Taliesin authors the pack via a new pack-kind module that slots into the existing registry from the Phase 1–5 asset-pack-editor work.

References:
- Existing SOTP load and `isTilePassable`: `taliesin/src/renderer/src/utils/mapRenderer.ts`
- Asset pack format: [asset-pack-format.md](./asset-pack-format.md)
- Existing pack-kind registry in Taliesin: `taliesin/src/renderer/src/packKinds/index.ts`

## Out of scope

- **Per-map per-coordinate overrides.** "This chair in Mileth should be sittable but the same sprite in Piet shouldn't" is a server-push problem (see [chair-sitting-scoping.md:101–106](./chair-sitting-scoping.md#L101)). Confirmed deferred — the TabMap passable/non-passable overlay covers the secret-passages use case, and chairs are universally chairs.
- **Authoring the animated-tile bit.** Bit 7 is an engine-level flag derived from the animation tables, not something an override author should be flipping. The merge rule below preserves it explicitly.
- **Editing the base SOTP itself.** Authoring is always sparse overrides; the base ships in `ia.dat` and is read-only.

## Format v1

### Manifest covers

```json
{
  "schema_version": 1,
  "pack_id": "my-collision-fixes",
  "pack_version": "1.0.0",
  "content_type": "tile_collision",
  "priority": 100,
  "covers": {
    "tile_collision": {}
  }
}
```

Strict empty covers — no per-pack metadata required for v1.

### Pack contents

A single file at the ZIP root:

```text
my-collision-fixes.datf
├── _manifest.json
└── overrides.json
```

`overrides.json` schema:

```json
{
  "format": 1,
  "tiles": {
    "1234": "passable",
    "5678": "impassable"
  }
}
```

- `format` — integer, currently `1`. Bumped if the schema gains structured property metadata (v2).
- `tiles` — object keyed by stringified tile ID (decimal). Values are the absolute override: `"passable"` or `"impassable"`. No third value in v1.

The keys are strings (not numbers) because JSON objects can't carry integer keys. The values are strings (not booleans) so v2 can extend the value to an object form (see below) without breaking the v1 string form.

### Semantics

- **Sparse overlay, absolute on collision only.** Each entry replaces the **collision** of the base SOTP byte for that tile ID; the animated-tile bit is preserved from the base. Only tiles listed in `overrides.json` are affected; everything else falls through to base SOTP unchanged.
- **Merge rule:** `merged = (base & 0x80) | (override === "passable" ? 0x00 : 0x0f)`. This way an animated impassable tile (`0x8f`) flipped to passable becomes `0x80` (still animated, now walkable), not `0x00` (animation lost).
- **Multi-pack priority resolution.** When two packs both override the same tile ID, the higher-priority pack wins (matches the existing asset-pack `priority` field).
- **No "delta" mode.** The pack is the source of truth for any tile's collision in either direction.

## Format v2 (planned, non-breaking expansion path)

Retail SOTP only carries one non-collision bit (animated, engine-derived) — but the Hybrasyl client is not bound to retail's encoding. The client team can introduce new SOTP semantics, or define a successor table (`sotp2.dat` or similar), to encode properties retail never had: `chair` (sittable), `water` (slowing / swim animation), `portal` (transition trigger), `door` (interactable), and so on. The chair-sitting-scoping discussion is the canonical example — marking a tile as a chair unlocks server-side seated-state without per-map server pushes.

When that happens, this override format graduates to express the new properties. v2 readers must accept v1's string form and v2's object form interchangeably so existing v1 packs continue to work:

```json
{
  "format": 2,
  "tiles": {
    "1234": "passable",
    "5678": { "passable": false, "staticType": "chair" },
    "9999": { "passable": true, "staticType": "water" }
  }
}
```

- `format: 2` — declares that values may be either a v1 string or a v2 object.
- Object form: `{ "passable": boolean, "staticType"?: string }`.
  - `passable` — required. Same semantics as the v1 string.
  - `staticType` — optional. Name of a property the Hybrasyl client recognizes (`chair`, `water`, `door`, `portal`, etc. — exact set defined by whatever extension the client team adds).
- Backward compatibility: v2 packs may still use the v1 string for tiles that only need a collision change; v1 packs are read by v2 clients without modification; v2 packs declared `format: 2` are rejected by v1-only clients with a warning.

Why this shape:

- The collision boolean stays primary and required — the dominant use case is "make this tile walkable / not walkable," not "tag it with a property."
- `staticType` is purely additive and never silently changes a tile's collision. An author setting `staticType: "chair"` still has to decide whether the chair is `passable: true`.
- Single-property-per-tile (`staticType` as a scalar string, not `properties` as an array) is the simplest model and matches retail SOTP's "tile has at most one property" pattern. If multi-property tiles become real, that's a v3 conversation.
- `staticType` strings are kept in a single shared list owned by the client team. The override format itself doesn't validate the names — authoring tools enumerate them from the client's exported list, but unknown names are passed through verbatim so future client additions don't require an editor update.

What's *not* author-settable in v2:

- The animated-tile bit (retail's `0x80`). Engine-derived from animation tables; preserved by the merge rule, never expressed in the JSON.

## Client-side responsibilities (Chaos.Client)

This is the gate before the format is useful — Taliesin can author packs, but the client must consume them. Sketch of what's needed:

1. **Register the content type** in `AssetPackRegistry`. New handler reads `overrides.json`, parses, validates `format` against the supported version range (currently `1`), builds an `IDictionary<int, byte>` of tile-ID → override byte.
2. **Merge step at SOTP load time.** After the base `sotp.dat` is loaded from `ia.dat`, walk the merged override map (in pack-priority order, lowest first so highest writes last) and stamp the override byte on the in-memory SOTP table, **preserving the animation bit from the base byte**:
   - `merged_byte = (base_byte & 0x80) | (override === "passable" ? 0x00 : 0x0f)`
   - This keeps animated impassable tiles animated when an author flips them to passable (and vice versa).
3. **Hot-reload semantics:** none. Same as other asset-pack types — restart applies changes.
4. **Validation/logging:** if a tile ID is outside the SOTP table bounds, log a warning and skip; if `format` is unsupported, reject the pack with a warning.

The client work is small (one new content-type handler + a merge step) but it's a real coordination point.

## Taliesin pack-kind module

Slots into the existing registry. Adding it touches:

1. **New file** `src/renderer/src/packKinds/tileCollision.ts` exporting `tileCollisionKind: PackKind`.
2. **New file** `src/renderer/src/components/assetpack/TileCollisionPanel.tsx` for kind-specific UI (the override list + tile picker).
3. **One-line registration** in `src/renderer/src/packKinds/index.ts`.
4. **One literal** in the `content_type` enum at `src/main/schemas/pack.ts`.

Kind interface:

| Field | Value |
|---|---|
| `type` | `'tile_collision'` |
| `label` | `'Tile Collision (SOTP override)'` |
| `description` | `'Override per-tile passability flags from sotp.dat. Sparse overlay merged onto the base SOTP table at client load.'` |
| `dimension.label` | `'n/a'` |
| `dimension.validate` | always returns `null` (no PNG dimension to check) |
| `defaultCovers()` | `{ tile_collision: { tiles: {} } }` |
| `coversSchema` | (see below) |
| `parseSlot` | parses the single `overrides.json` filename → `{ namespace: 'overrides', id: 0 }` |
| `nextAssetPath` | always returns `overrides.json` (single-file pack) |
| `assetMetaFields` | `undefined` |
| `namespaces` | `undefined` (no menu) |
| `Panel` | `TileCollisionPanel` |
| `disablesAssetTable` | `true` (new modularity hook — see below) |
| `virtualAssets` | generates `overrides.json` from `covers.tile_collision.tiles` (new hook) |
| `hydrateCoversFromAssets` | inverse — reads `overrides.json` from import (new hook) |

`coversSchema` for v1:

```ts
z.object({
  tile_collision: z.object({
    tiles: z.record(
      z.string().regex(/^\d+$/),
      z.enum(['passable', 'impassable'])
    ).optional()
  })
})
```

### Important divergences from the existing kinds

- **Single-file pack, not a list of PNGs.** Existing kinds (ability_icons, item_icons, etc.) all add PNG-per-asset. Tile collision is one JSON file. The "Add PNG" affordance doesn't apply.
- **State lives in `draft.covers`, not `draft.assets`.** The override list is conceptually metadata; storing it in `covers.tile_collision.tiles` aligns with how the client schema validates the same payload. `overrides.json` is generated at compile time from `covers`, never staged on disk.

### Modularity hooks needed (additions to PackKind)

```ts
interface PackKind {
  // ... existing fields ...

  /** Hide the per-asset table when the kind is single-file or covers-only.
   *  Defaults to false. */
  disablesAssetTable?: boolean

  /** Generate virtual file entries at compile time. Used by tile_collision
   *  to write overrides.json from covers, without staging the file on disk.
   *  Returned content is appended into the .datf zip alongside on-disk assets. */
  virtualAssets?(draft: PackProject): { name: string; content: string }[]

  /** Inverse of virtualAssets. After pack:import extracts the .datf into
   *  packDir, this hook reads any kind-owned files and returns the covers
   *  blob to merge into the imported PackProject. */
  hydrateCoversFromAssets?(extracted: {
    files: Record<string, string>
  }): Record<string, unknown>
}
```

All three are optional, so existing kinds stay untouched.

## Editor UX

`TileCollisionPanel` carries the whole UI:

1. **Tile picker — left half.** Reuses the existing tileset rendering (currently in `ArchivePreview.tsx`'s `TilesetPreview`). Shows the foreground tile sheet from the user's active library, paged. Clicking a tile selects it; the panel shows the base SOTP value next to a toggle.
2. **Override list — right half.** Sortable table: tile ID, baseline (passable/impassable), override (passable/impassable/unset), preview thumbnail, "remove override" button. Filterable.
3. **State source.** The panel reads/writes `draft.covers.tile_collision.tiles` directly via `onChange({ covers: ... })`.
4. **Baseline source.** Read base `sotp.dat` from the user's active library (already loaded by `mapRenderer.ts`). If missing — banner says "Set an active library in Settings to see baseline SOTP." Authoring without a baseline is still possible (fully sparse overrides), just with less context.
5. **No add-PNG button.** The Add PNG affordance hides via `kind.disablesAssetTable`.

### Authoring flow

1. User opens or creates a `tile_collision` pack.
2. Panel shows a tile grid with foreground tiles 1..N, each tagged with its baseline collision.
3. User clicks tile, toggles override, repeat.
4. Save → `packSave` writes the project JSON with `covers.tile_collision.tiles = { ... }`.
5. Compile → `packCompile` zips the manifest + the virtually-generated `overrides.json` into `<pack_id>.datf`.

### Round-trip

`pack:import` of a `tile_collision` pack reads `overrides.json`, runs it through the format validator, and stuffs it into `covers.tile_collision.tiles` via `hydrateCoversFromAssets`. The hydration hook fires symmetrically with the `virtualAssets` reduction at compile.

## Critical files to touch (Taliesin side)

New:
- `src/renderer/src/packKinds/tileCollision.ts`
- `src/renderer/src/components/assetpack/TileCollisionPanel.tsx`
- `src/renderer/src/packKinds/__tests__/tileCollision.test.ts`

Modified:
- `src/renderer/src/packKinds/types.ts` — add `disablesAssetTable?` and `virtualAssets?` and `hydrateCoversFromAssets?` to `PackKind`
- `src/renderer/src/packKinds/index.ts` — register the kind
- `src/main/schemas/pack.ts` — add `'tile_collision'` to the `content_type` enum
- `src/renderer/src/components/assetpack/PackEditor.tsx` — honor `disablesAssetTable`; pass virtual assets to compile
- `src/main/handlers.ts` — `packCompile` accepts virtual asset content; `packImport` runs `hydrateCoversFromAssets`
- `src/main/__tests__/packImport.test.ts` — round-trip test for tile_collision

## Verification

- **Unit tests:**
  - Kind module: `parseSlot` / `nextAssetPath` handle the single-file `overrides.json` correctly. `coversSchema` accepts and rejects malformed override maps.
  - `TileCollisionPanel`: toggling a tile updates `covers.tile_collision.tiles`; removing brings it back to baseline.
  - Compile: a pack with 2 overrides produces a .datf whose `overrides.json` matches the canonical shape.
  - Import: the inverse — extracting a pre-built .datf reconstructs the overrides into `covers`.
- **End-to-end smoke (after client work):** create an override pack flagging tile 1234 as passable when baseline is impassable, drop in client data dir, walk on the tile in-game.

## Open questions

1. **The dat-files.md `& 0xF0` mask claim.** The empirical byte distribution (`0x00` / `0x0f` / `0x80` / `0x8f`) doesn't match a high-nibble mask — that would zero the low-nibble collision flag. Either the client's mask is `& 0x0F` and dat-files.md got the direction wrong, or there's a second step (e.g. a swap or invert) the doc didn't capture. Worth re-reading `FUN_005CF3B0` to settle and update dat-files.md accordingly. Doesn't block this format.
2. **Authoring UX without a baseline library.** Acceptable to author overrides when no library is set (no baseline visible), or block the editor until a library is set?
