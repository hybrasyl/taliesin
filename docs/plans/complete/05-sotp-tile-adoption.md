# WP5 — Adopt dalib `SotpFile` + `renderTile`

**Size: M. ✅ Shipped 2026-08-10** (`7e07756`, and `3d5a8e4` for the `stcani.tbl` fault).
Foundation for pack-carried SOTP.

**Depends on:** [WP0](00-dalib-ts-3-bump.md) (shipped, so this was unblocked). Read `../00-overview.md` first.

> **Commit `12c91b8` reads like this work and is docs-only.** That commit also deleted `docs/completed/tile-collision-asset-pack.md`, which earlier drafts of this plan linked to; the link is gone rather than moved, and the design it described is superseded by Decision 1 below.

## What shipped, against this plan

Parts A and B landed as written. Two things the plan asserted turned out to be wrong, and both were
measured against a real client rather than argued:

**1. The ground-tile appearance change belongs to this WP after all, not to WP0.** Part B below says
the change "already shipped with the dalib-ts 3.0.0 bump". It did not. The tileset **preview** moved
to `renderTile` at 3.0.0; the **map** kept the local blit until `7e07756`, so the map's ground
rendering changes in this commit. Compared over a real client: walls are pixel-for-pixel identical
across 7 tiles (`renderHpf` is pure deduplication, as claimed), while 2 of 5 ground tiles differ.
Colour never changes — only alpha, only on palette-index-0 pixels, only inside the isometric
diamond, where the preview drew a solid diamond and the map punched transparent holes. On ground
tile 1, 783 of 1512 pixels gain opacity. That is acceptance criterion 4 being met, but it is a
**visible** change and it is owned here. `CHANGELOG.md` carries it as a user-facing fix accordingly.

**2. The `stcani.tbl` fault is latent, not live.** The section below — and HTOO-151 — say `stcani`
"silently overrides `stcpal.tbl`". Measured across ids 0..20000 against a real `ia.dat`, the
resolved palette is **identical before and after the fix**; not one rendered tile changes. Two
independent accidents mask it. `stcani.tbl` sorts _before_ `stcpal.tbl` in the archive, so stcpal
merges last and wins all 486 ids the two share — stcani wins none. And the single id whose stcani
entry does survive (19386, mapped to "palette" 19390, where the real palettes run 0..201) is also
covered by a `stcpal` single-value override, and `getPaletteNumber` is `overrides ?? entries ?? 0`.
Comparing the raw `entries` maps shows a difference the public lookup never surfaces, which is why
an earlier reading of this looked like a live one-tile fault.

It was still worth fixing: both masking accidents are properties of a data file nobody here
controls, and a repack that reorders the two tables flips 486 wall ids to animation frame counts.
The fix is not the one-line pattern swap this plan warned against, for the reason it gives — the
mapping now comes from `stcpal` and the cycling definitions are carried across from the broad table,
whose contaminated mapping is discarded. It costs one extra parse, about 4 ms, once at asset load.
Ground is genuinely unaffected: `mpt` does not match `gndani.tbl`, confirmed against a real `seo.dat`.

Part C was recorded and not built, as scoped. `pixelsToImageData` is deleted; nothing else
referenced it.

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

> **Wrong, and disproved by the build — see "What shipped" above.** Only the tileset preview moved
> at 3.0.0. The map kept the local blit until this WP, so ground rendering changes here. Walls are
> the part that is pure deduplication.

## Part C — the seam for pack-carried SOTP (direction only, not built here)

Record where the future custom-SOTP layer plugs in, so Parts A and B are not re-touched:

- **Authoring:** the `static_tiles` covers schema in `src/renderer/src/packKinds/staticTiles.ts` (today `z.object({}).strict()`) grows to carry per-tile SOTP. `packCompile` in `src/main/handlers.ts` already round-trips whatever `covers` blob it receives, so no compile-format change is forced.
- **Consumer:** `staticTilesHandler` and `PackInfo` in `src/main/assetPacks.ts` read the pack SOTP. Add an IPC method (for example `packResolveSotp(subtype, id)`) beside `resolveAssetBytes` and `listCoveredIds`.
- **Merge point:** in `loadMapAssets`, build an effective `SotpFile`. Start from the base `SotpFile` and overlay per-id pack flags for every id in `floorCoverage`/`wallCoverage`, with the same precedence as `resolveWithPackOverride` (pack wins, legacy fallback). Because Part A makes `SotpFile` the single source, this is one localised change and every consumer reflects pack SOTP automatically.

## Also owned by this WP — `stcani.tbl` is being merged into the wall palette table

Found during WP0 and deliberately left unfixed there, because it is pre-existing, unrelated to the bump, and fixing it changes map rendering, which would have contaminated WP0's verification.

> **The impact stated below is wrong — see "What shipped" above.** The fault is **latent**: measured
> against a real `ia.dat`, the resolved palette is identical before and after the fix, and no
> rendered tile changes. Archive order and a `stcpal` override mask it. Fixed anyway, because both
> masking accidents are properties of a data file nobody here controls.

`mapRenderer.ts` builds the wall palette table with `PaletteTable.fromArchive('stc', iaArchive)`. That pattern matches **every** `stc*.tbl` in `ia.dat`, and `PaletteTable.fromArchive` routes each match by whether its name has a numeric identifier: numeric names become cycling files, non-numeric names are **merged as palette mapping tables**.

`stcani.tbl` has no numeric identifier. It is the foreground _animation_ table, and it is being merged as if it were a palette table. Its lines are tile sequences, so `PaletteTable.parseText` reads a 3-plus-token line as a **range entry** and runs `for (i = min; i <= mid; i++) entries.set(i, third)` — assigning an arbitrary palette number to every wall id in the animation sequence's numeric span, silently overriding `stcpal.tbl`.

Ground is unaffected: `fromArchive('mpt', seoArchive)` does not match `gndani.tbl`. **Only walls, and only animated ones**, which is why it has gone unnoticed.

The fix is not a straight pattern swap. `fromArchive('stcpal')` drops the numeric `stc###.tbl` cycling files, and `tileEligibility.ts` depends on those through `getCyclingEntries` / `isPaletteCycled`. Build the palette mapping from `stcpal` and merge the cycling files separately, or use the two-pattern form dalib's own resolver uses.

**Confirm against a real `ia.dat` before changing anything:** the impact above is derived from the parsers, not yet observed on screen. — **Done, and it is what disproved the impact.**

## Non-goals (stop-lines)

- **The over-player / screen-blend (`0x80`) render pass.** Taliesin's map editor has no blend pass, and `renderTile` alone does not add one.
- **The server-side SOTP overlay, bounds-check and native tile attributes.** Cross-repo, owned by `hybrasyl-server`. Recorded in `00a-backlog.md`.
- **The custom-SOTP authoring UI and the Brigid client consumer.** Part C records the seam and stops there. Recorded in `00a-backlog.md`.

## Tests

The existing SOTP unit tests build a raw `Uint8Array` and call `isTilePassable`/`wallWalkability`; they must build a `SotpFile` instead (for example `SotpFile.fromBuffer(bytes)`). **Assert identical passable/blocking/unknown results**, so the refactor is proven behaviour-preserving.

Tests live under `src/renderer/src/utils/__tests__/`.

## Acceptance criteria

1. ✅ `MapAssets` carries a `SotpFile`, and no consumer decodes the collision nibble by hand.
2. ✅ `wallWalkability` still returns `'unknown'` past `sotp.maxTileId`. A test pins it, asserting that dalib's answer and ours differ — dalib returns 0 past the end of the table, and 0 reads as passable, so deferring the range check would hand the allocator unknown ids as free passable slots.
3. ✅ Ground and wall tiles render through `renderTile`/`renderHpf`, and the local `pixelsToImageData` is gone.
4. ✅ Walls are pixel-for-pixel unchanged and ground tiles match the archive tileset preview — measured off-screen against a real client, per "What shipped". **Still owed: the on-screen confirmation in `npm run dev`, which is HTOO-150's `needs-testing` state.**
5. ✅ `stcani.tbl` no longer contributes palette entries to the wall palette table, and `tileEligibility.ts` still sees the cycling files.
6. ✅ The SOTP unit tests keep their fixture bytes and hand them to the parser instead of indexing by hand, so the identical expectations are the evidence the refactor preserved behaviour.
7. ✅ All checks green.

Criterion 4 is visual and is handed to the user in `npm run dev`.
