# WP5 — Adopt dalib `SotpFile` + `renderTile`

**Size: M.** **Not started.** Foundation for pack-carried SOTP.

**Depends on:** [WP0](complete/00-dalib-ts-3-bump.md) (shipped, so this is unblocked). Read `00-overview.md` first.

> **Commit `12c91b8` reads like this work and is docs-only.** Nothing has been adopted yet. That commit also deleted `docs/completed/tile-collision-asset-pack.md`, which earlier drafts of this plan linked to; the link is gone rather than moved, and the design it described is superseded by Decision 1 below.

## Goal

Taliesin replaces tile art through `static_tiles` `.datf` packs (Static Tile Manager, shipped v2.7.0). A replaced tile keeps the collision and render behaviour of the legacy `sotp.dat`, because packs carry no SOTP. Before custom SOTP can travel inside a pack, Taliesin must stop hand-rolling two things dalib-ts now provides.

1. **SOTP parsing.** `mapRenderer.ts` reads `sotp.dat` as raw bytes and decodes the collision nibble by hand (`& 0x0f`) in two places. dalib-ts ships `SotpFile` with the same 1-based layout and correct render-flag accessors.
2. **Tile pixel decode.** Ground and wall tiles use a local `pixelsToImageData`. The archive tileset preview already uses dalib `renderTile`. The two disagree on ground tiles: the preview draws an opaque diamond, the map draws a transparent-holed rectangle.

This WP is the **foundation only**. It adopts `SotpFile` as the single SOTP source and `renderTile`/`renderHpf` for the legacy decode, and leaves a clean seam where pack-carried SOTP overlays later.

## Decisions (Sabrael, 2026-07-23)

1. **Custom SOTP travels inside the `static_tiles` pack** with the replaced art. This supersedes the separate `tile_collision` content-type design, whose doc was deleted in `12c91b8`; its Comhaigne twin is likewise superseded.

## New dependency

None. The precondition earlier drafts recorded — "depends on the dalib-ts next release" — **is satisfied.** That release is 3.0.0, it is published, and Taliesin is on `^3.1.0`. Read this WP with that resolved.

New imports in `mapRenderer.ts`: `SotpFile`, `Tile`, `renderTile`, `renderHpf` from `@eriscorp/dalib-ts`, and `toImageData` from `@eriscorp/dalib-ts/helpers/imageData`.

## Part A — `SotpFile` as the single SOTP source

Replace the raw-bytes model with the dalib parser. Note the factory argument order: `SotpFile.fromArchive(archive, fileName='sotp.dat')` and `SotpFile.fromEntry(entry)`.

- `src/renderer/src/utils/mapRenderer.ts` — change the `MapAssets` field `sotpTable: Uint8Array | null` to `sotp: SotpFile | null`. Build it at load with `sotpEntry ? SotpFile.fromEntry(sotpEntry) : null`.
- `isTilePassable` (`mapRenderer.ts`) — take a `SotpFile`. Use `lf <= 0 || sotp.getCollision(lf) === 0`. `getCollision(id)` returns `getFlags(id) & 0x0f`, so the collision semantics and the 1-based `id-1` index are identical.
- `wallWalkability` (`src/renderer/src/utils/wallIdAllocator.ts`) — take a `SotpFile`. **Keep the explicit out-of-range branch that returns `'unknown'`, gated on `sotp.maxTileId`.** dalib returns 0 (passable) past the end of the table, which would otherwise silently drop the `'unknown'` result the allocator needs.
- Overlay and export consumers — update the callers that hold the table to pass `assets.sotp`: `components/mapmaker/{MapEditorCanvas,ExportMapDialog,TabMapPopup}.tsx`, `components/mapeditor/MapRenderCanvas.tsx`, `pages/StaticTileManagerPage.tsx`. A caller that needs raw bytes uses `sotp.toUint8Array()`.
- `SotpFile` also exposes `getRenderFlags` and `isOverPlayer` (the `0x80` high-nibble bit — the C# `TileFlags.Transparent` / screen-blend / over-player bit). These supersede the ambiguous local comment in `mapRenderer.ts` that guesses `0x80` means "interactable surface". This adds no behaviour now; the accessor becomes available for later use.

## Part B — `renderTile` / `renderHpf` for the legacy decode

Swap the local blit inside the legacy branches only. The `resolveWithPackOverride` wrapper and its art-only override branch stay unchanged.

- `getGroundBitmap` (`mapRenderer.ts`) — wrap the existing slice in a dalib `Tile` and render: `renderTile(new Tile(groundPixels.subarray(start, start + GROUND_TILE_BYTES)), palette)`, then `createImageBitmap(toImageData(frame))`. Keep the palette lookup (`groundPaletteTable.getPaletteNumber(tileIndex + 1)` — the `+1` is a palette-table quirk, separate from tile indexing).
- `getStcBitmap` (`mapRenderer.ts`) — replace `pixelsToImageData(hpf.data, …)` with `renderHpf(hpf, palette)`, then `createImageBitmap(toImageData(frame))`. `renderHpf` uses `colorKey=true` (index 0 transparent), so walls are visually unchanged. This is pure dedup.
- Remove the local `pixelsToImageData` if nothing else references it. Confirm with a grep first; the function is exported.

**The ground-tile appearance change belongs to WP0, not to this WP.** Earlier drafts attributed it to Part B, but the `renderTile` fix shipped in dalib-ts 3.0.0 — ground tiles changed the moment the dependency was bumped, whether or not `mapRenderer.ts` was touched. It was confirmed during WP0. Part B is therefore what it should have been all along: **pure deduplication** of a local blit against the library.

## Part C — the seam for pack-carried SOTP (direction only, not built here)

Record where the future custom-SOTP layer plugs in, so Parts A and B are not re-touched:

- **Authoring:** the `static_tiles` covers schema in `src/renderer/src/packKinds/staticTiles.ts` (today `z.object({}).strict()`) grows to carry per-tile SOTP. `packCompile` in `src/main/handlers.ts` already round-trips whatever `covers` blob it receives, so no compile-format change is forced.
- **Consumer:** `staticTilesHandler` and `PackInfo` in `src/main/assetPacks.ts` read the pack SOTP. Add an IPC method (for example `packResolveSotp(subtype, id)`) beside `resolveAssetBytes` and `listCoveredIds`.
- **Merge point:** in `loadMapAssets`, build an effective `SotpFile`. Start from the base `SotpFile` and overlay per-id pack flags for every id in `floorCoverage`/`wallCoverage`, with the same precedence as `resolveWithPackOverride` (pack wins, legacy fallback). Because Part A makes `SotpFile` the single source, this is one localised change and every consumer reflects pack SOTP automatically.

## Also owned by this WP — `stcani.tbl` is being merged into the wall palette table

Found during WP0 and deliberately left unfixed there, because it is pre-existing, unrelated to the bump, and fixing it changes map rendering, which would have contaminated WP0's verification.

`mapRenderer.ts` builds the wall palette table with `PaletteTable.fromArchive('stc', iaArchive)`. That pattern matches **every** `stc*.tbl` in `ia.dat`, and `PaletteTable.fromArchive` routes each match by whether its name has a numeric identifier: numeric names become cycling files, non-numeric names are **merged as palette mapping tables**.

`stcani.tbl` has no numeric identifier. It is the foreground _animation_ table, and it is being merged as if it were a palette table. Its lines are tile sequences, so `PaletteTable.parseText` reads a 3-plus-token line as a **range entry** and runs `for (i = min; i <= mid; i++) entries.set(i, third)` — assigning an arbitrary palette number to every wall id in the animation sequence's numeric span, silently overriding `stcpal.tbl`.

Ground is unaffected: `fromArchive('mpt', seoArchive)` does not match `gndani.tbl`. **Only walls, and only animated ones**, which is why it has gone unnoticed.

The fix is not a straight pattern swap. `fromArchive('stcpal')` drops the numeric `stc###.tbl` cycling files, and `tileEligibility.ts` depends on those through `getCyclingEntries` / `isPaletteCycled`. Build the palette mapping from `stcpal` and merge the cycling files separately, or use the two-pattern form dalib's own resolver uses.

**Confirm against a real `ia.dat` before changing anything:** the impact above is derived from the parsers, not yet observed on screen.

## Non-goals (stop-lines)

- **The over-player / screen-blend (`0x80`) render pass.** Taliesin's map editor has no blend pass, and `renderTile` alone does not add one.
- **The server-side SOTP overlay, bounds-check and native tile attributes.** Cross-repo, owned by `hybrasyl-server`. Recorded in `00a-backlog.md`.
- **The custom-SOTP authoring UI and the Brigid client consumer.** Part C records the seam and stops there. Recorded in `00a-backlog.md`.

## Tests

The existing SOTP unit tests build a raw `Uint8Array` and call `isTilePassable`/`wallWalkability`; they must build a `SotpFile` instead (for example `SotpFile.fromBuffer(bytes)`). **Assert identical passable/blocking/unknown results**, so the refactor is proven behaviour-preserving.

Tests live under `src/renderer/src/utils/__tests__/`.

## Acceptance criteria

1. `MapAssets` carries a `SotpFile`, and no consumer decodes the collision nibble by hand.
2. `wallWalkability` still returns `'unknown'` past `sotp.maxTileId`.
3. Ground and wall tiles render through `renderTile`/`renderHpf`, and the local `pixelsToImageData` is gone.
4. Walls and the passability overlay are visually unchanged; ground tiles match the archive tileset preview.
5. `stcani.tbl` no longer contributes palette entries to the wall palette table, and `tileEligibility.ts` still sees the cycling files.
6. The SOTP unit tests assert identical results to the pre-refactor behaviour.
7. All checks green.

Criterion 4 is visual and must be handed to the user in `npm run dev`.
