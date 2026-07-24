# Adopt dalib `SotpFile` + `renderTile` — foundation for pack-carried SOTP

**Status (2026-07-23): plan, not started.** Depends on the dalib-ts next release (see
Precondition).

## Context

Taliesin replaces tile art through `static_tiles` `.datf` packs (Static Tile Manager, shipped
v2.7.0). A replaced tile keeps the collision and render behavior of the legacy `sotp.dat` —
packs carry no SOTP. The agreed direction is that custom SOTP travels **inside the
`static_tiles` pack** with the replaced art. This decision supersedes the separate
`tile_collision` content-type design (`docs/completed/tile-collision-asset-pack.md` and its
Comhaigne twin).

Before that capability is built, Taliesin must stop hand-rolling two things that dalib-ts now
provides:

1. **SOTP parsing.** `mapRenderer.ts` reads `sotp.dat` as raw bytes and decodes the collision
   nibble by hand (`& 0x0f`) in two places. dalib-ts now ships `SotpFile` with the same
   1-based layout and correct render-flag accessors.
2. **Tile pixel decode.** Ground and wall tiles use a local `pixelsToImageData`. The archive
   tileset preview already uses dalib `renderTile`. The two disagree on ground tiles: the
   preview draws an opaque diamond, the map draws a transparent-holed rectangle.

This plan is the **foundation only**. It adopts `SotpFile` as the single SOTP source and
`renderTile`/`renderHpf` for the legacy decode. It leaves a clean seam where pack-carried SOTP
overlays later. It does not build the custom-SOTP authoring UI or the Brigid client consumer.

## Precondition — dalib-ts next release

This work assumes Taliesin adopts the dalib-ts next release as a normal dependency bump
(`package.json` `^x.y.z` plus lockfile). That release ships `SotpFile`, `Tile`/`Tileset`, and
the `renderTile` diamond/index-0 fix. The work sits on dalib `main` today, unreleased, still
labeled 2.2.0. The bump is already proven safe: the refinement is additive at the API surface,
and Taliesin passes the full gate against it (typecheck, 1061 tests, build). Execution step 0
is therefore: dalib cuts the release, Taliesin bumps the dependency.

## Part A — `SotpFile` as the single SOTP source

Replace the raw-bytes model with the dalib parser. Note the factory argument order:
`SotpFile.fromArchive(archive, fileName='sotp.dat')` and `SotpFile.fromEntry(entry)`.

- `src/renderer/src/utils/mapRenderer.ts` — change the `MapAssets` field `sotpTable:
  Uint8Array | null` to `sotp: SotpFile | null`. Build it at load with
  `sotpEntry ? SotpFile.fromEntry(sotpEntry) : null`.
- `isTilePassable` (`mapRenderer.ts`) — take a `SotpFile`. Use
  `lf <= 0 || sotp.getCollision(lf) === 0`. `getCollision(id)` returns `getFlags(id) & 0x0f`,
  so the collision semantics and the 1-based `id-1` index are identical.
- `wallWalkability` (`src/renderer/src/utils/wallIdAllocator.ts`) — take a `SotpFile`. Keep the
  explicit out-of-range branch that returns `'unknown'`, gated on `sotp.maxTileId`. dalib
  returns 0 (passable) past the end, which would otherwise drop the `'unknown'` result the
  allocator needs.
- Overlay and export consumers — update the callers that hold the table to pass `assets.sotp`:
  `components/mapmaker/{MapEditorCanvas,ExportMapDialog,TabMapPopup}.tsx`,
  `components/mapeditor/MapRenderCanvas.tsx`, `pages/StaticTileManagerPage.tsx`. A caller that
  needs raw bytes uses `sotp.toUint8Array()`.
- `SotpFile` also exposes `getRenderFlags` and `isOverPlayer` (the `0x80` high-nibble bit —
  the C# `TileFlags.Transparent` / screen-blend / over-player bit). These supersede the
  ambiguous local comment in `mapRenderer.ts` that guesses `0x80` means "interactable
  surface." This adds no behavior now; the accessor becomes available for later use.

## Part B — `renderTile` / `renderHpf` for the legacy decode

Swap the local blit inside the legacy branches only. The `resolveWithPackOverride` wrapper and
its art-only override branch stay unchanged.

- `getGroundBitmap` (`mapRenderer.ts`) — wrap the existing slice in a dalib `Tile` and render:
  `renderTile(new Tile(groundPixels.subarray(start, start + GROUND_TILE_BYTES)), palette)`,
  then `createImageBitmap(toImageData(frame))`. Keep the palette lookup
  (`groundPaletteTable.getPaletteNumber(tileIndex + 1)` — the `+1` is a palette-table quirk,
  separate from tile indexing).
  **Visual change:** `renderTile` draws palette index 0 opaque and masks the isometric
  diamond. Today the map draws index 0 transparent across the full rectangle. The new output
  is the DA-correct ground behavior and matches both the archive preview and the reference
  client. It needs a visual confirm.
- `getStcBitmap` (`mapRenderer.ts`) — replace `pixelsToImageData(hpf.data, …)` with
  `renderHpf(hpf, palette)`, then `createImageBitmap(toImageData(frame))`. `renderHpf` uses
  `colorKey=true` (index 0 transparent), so walls are visually unchanged. This is pure dedup.
- Remove the local `pixelsToImageData` if nothing else references it. Confirm with a grep
  first; the function is exported.
- New imports in `mapRenderer.ts`: `SotpFile, Tile, renderTile, renderHpf` from
  `@eriscorp/dalib-ts`, and `toImageData` from `@eriscorp/dalib-ts/helpers/imageData`.

## Part C — the seam for pack-carried SOTP (direction only, not built here)

Record where the future custom-SOTP layer plugs in, so Part A and Part B are not re-touched:

- **Authoring:** the `static_tiles` covers schema in `src/renderer/src/packKinds/staticTiles.ts`
  (today `z.object({}).strict()`) grows to carry per-tile SOTP. `packCompile` in
  `src/main/handlers.ts` already round-trips whatever `covers` blob it receives, so no
  compile-format change is forced.
- **Consumer:** `staticTilesHandler` and `PackInfo` in `src/main/assetPacks.ts` read the pack
  SOTP. Add an IPC method (for example `packResolveSotp(subtype, id)`) beside
  `resolveAssetBytes` and `listCoveredIds`.
- **Merge point:** in `loadMapAssets`, build an effective `SotpFile`. Start from the base
  `SotpFile`. Overlay per-id pack flags for every id in `floorCoverage`/`wallCoverage`. Use
  the same precedence as `resolveWithPackOverride` (pack wins, legacy fallback). Because
  Part A makes `SotpFile` the single source, this is one localized change and every consumer
  reflects pack SOTP automatically.

## Out of scope

- The over-player / screen-blend (`0x80`) render pass. Taliesin's map editor has no blend pass,
  and `renderTile` alone does not add one.
- The server-side SOTP overlay, bounds-check, and native tile attributes (cross-repo,
  `hybrasyl-server`).
- The custom-SOTP authoring UI and the Brigid client consumer (follow-up features on this base).

## Verification

- Gate: `npm run typecheck && npm run lint:check && npm run test:coverage && npm run build`.
- **Tests to update:** the SOTP unit tests that build a raw `Uint8Array` and call
  `isTilePassable`/`wallWalkability` must build a `SotpFile` instead (for example
  `SotpFile.fromBuffer(bytes)`). Assert identical passable/blocking/unknown results, so the
  refactor is proven behavior-preserving.
- **Visual (hand to the user, `npm run dev`):** open a map in the Map Maker/editor. Confirm
  ground tiles render as opaque diamonds that match the archive tileset preview (the Part B
  change). Confirm walls and the passability overlay are unchanged.

## Critical files

- `src/renderer/src/utils/mapRenderer.ts` — `MapAssets.sotp`, load, `getGroundBitmap`,
  `getStcBitmap`, `isTilePassable`, remove `pixelsToImageData`.
- `src/renderer/src/utils/wallIdAllocator.ts` — `wallWalkability`.
- Consumers: `components/mapmaker/{MapEditorCanvas,ExportMapDialog,TabMapPopup}.tsx`,
  `components/mapeditor/MapRenderCanvas.tsx`, `pages/StaticTileManagerPage.tsx`.
- Tests under `src/renderer/src/utils/__tests__/` that cover `isTilePassable`/`wallWalkability`.
- Part C seam (future PR): `packKinds/staticTiles.ts`, `main/assetPacks.ts`, `main/handlers.ts`.
