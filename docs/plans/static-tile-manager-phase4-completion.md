# Static Tile Manager — Phase 4 completion plan

Entry point for finishing Phase 4 of the Static Tile Manager. The feature (Phases 1–4) is
already implemented on branch `feat/static-tile-manager`; this doc scopes the four remaining
polish items the user approved (2026-07-05). Parent plan:
[static-tile-manager.md](static-tile-manager.md).

## Current state (branch `feat/static-tile-manager`, pushed, 12 commits)

- **Converter** [tileConvert.ts](../../src/renderer/src/utils/tileConvert.ts): floors → 56×27
  **diamonds** (transparent corners, source alpha preserved); walls → 28×N **left/right-angled**
  faces (height carved-inside so replacements match legacy). Ground-truth-locked against the
  extracted corpora. `resampleTile` for already-iso sources. scale {1,2}, only 1× exercised.
- **Logic cores** (all pure + fixture-tested): `wallIdAllocator.ts`, `orientationDetect.ts`,
  `gridSlice.ts`, `wallHeight.ts`, `wangSlicer.ts`, `wangSidecar.ts`, `tileAnimation.ts`.
- **Page** [StaticTileManagerPage.tsx](../../src/renderer/src/pages/StaticTileManagerPage.tsx):
  loose / grid / wang import, convert + preview, commit-to-pack. Wall commit surfaces the
  10013–20423 allocator + sotp walkability + ia.dat auto-height. Grid batch "commit all as
  floors". Frame-animated pre-flight warning. Committed-tiles gallery
  ([CommittedTiles.tsx](../../src/renderer/src/components/statictiles/CommittedTiles.tsx),
  [WangSlicePanel.tsx](../../src/renderer/src/components/statictiles/WangSlicePanel.tsx)).
- Green: typecheck, eslint, prettier, **913 tests**, `electron-vite build`. No PR yet.

The commit path everywhere is: `convertOrthoTile`/`resampleTile` → `pixelBufferToPngBytes` →
`window.api.writeBytes(packDir/<pack_id>/<file>)` → append asset → `packSave`. No new data-path
IPC. Legacy tables come from `loadMapAssets(clientPath)` → `MapAssets`.

## The four approved items

### 1. Palette-cycled pre-flight (the "cycled" half — currently only frame-animation is done)

**Why now:** the user flagged this ties into an upcoming feature, so build the eligibility check
as a **reusable util**, not page-local logic.

**The exact Brigid rule (verified against `brigid/Brigid.Rendering/MapRenderer.cs` phase 2.5,
~lines 520–540):** a tile's pack art is skipped when it **has legacy data** *and* its palette
carries cycling entries:

```csharp
// bg (floor); fg (wall) is symmetric via ForegroundPaletteLookup
if (bgTileData.ContainsKey(tileId) &&
    bgLookup.Table.GetCyclingEntries(bgLookup.Table.GetPaletteNumber(tileId + 1)) is not null)
    continue; // cycled → pack PNG ignored
```

Two nuances that must be honoured:
- **`GetPaletteNumber(id + 1)`** — the same +1 offset `mapRenderer.getStcBitmap`/`getGroundBitmap`
  already use.
- **Pack-only IDs are never skipped.** The cycling check is gated on `ContainsKey` (legacy data
  present). A minted ID with no legacy tile/HPF always renders regardless of palette. So the
  cycled check only fires for IDs **inside the legacy range**.

**Data availability (confirmed):** `MapAssets` already carries `groundPaletteTable` /
`stcPaletteTable` (dalib `PaletteTable`), which expose `getPaletteNumber(n)` and
`getCyclingEntries(n): readonly PaletteCyclingEntry[] | undefined`. Legacy existence:
- floor legacy ⇔ `id >= 1 && id <= assets.groundTileCount`
- wall legacy ⇔ `assets.iaArchive.get('stc' + String(id).padStart(5,'0') + '.hpf')` is present

**Work:**
- Fold into a single **`tileEligibility.ts`** (or extend `tileAnimation.ts`):
  ```ts
  export type Ineligibility = 'animated' | 'cycled'
  export interface TileEligibility { eligible: boolean; reason?: Ineligibility; sequence?: number[] }
  export function checkTileEligibility(assets, layer, id): TileEligibility
  ```
  Order: frame-animated (existing `checkTileAnimatedForLayer`) first → else palette-cycled
  (legacy-gated) → else eligible.
- Keep the palette-cycled core **structurally typed + pure** for tests: e.g.
  `isPaletteCycled(palTable: { getPaletteNumber(n): number; getCyclingEntries(n): unknown[]|undefined }, id: number)`,
  and a `hasLegacyFloor/Wall(assets, id)` gate. Match Brigid: cycled ⇔ `getCyclingEntries(getPaletteNumber(id+1)) != null`.
- Replace the page's `checkTileAnimatedForLayer` warning with the combined eligibility warning
  ("animated" vs "cycled" message).

**Tests:** fake palette table (cycling for palette N, none for M) + fake ground count / ia entry
set → floor/wall legacy id with cycling → cycled; pack-only id with cycling palette → eligible
(legacy gate); animated id → animated (takes precedence).

### 2. Eligibility on the wang + batch paths (approved)

The eligibility warning only fires in the single floor/wall commit panel today. **Real risk:** a
**fresh pack's** floor IDs start at 1 (`nextSlotId` firstId=1) — squarely inside the legacy
range — so a batch or wang commit can silently target animated/cycled IDs that won't render.

**Work:** in `commitAllFloors` (page) and the wang panel commit, run `checkTileEligibility` on
each allocated ID. Don't silently drop — **write it anyway** (author's call) but **collect the
ineligible IDs and report them** in the status/message (e.g. "committed 40 tiles; 3 target
animated/cycled IDs and won't render: 12, 84, 97"). Optionally mark them in the wang tag grid.

### 3. True batch import (approved)

Current batch = one grid sheet → floors. Extend:
- **Multi-file loose import.** Select many PNGs at once. `window.api.openFile` returns a single
  path — check the preload/`dialog:openFile` handler for a `multiSelections` variant; add a small
  `openFiles` dialog method if absent (dialog-only, still no data-path IPC). Commit each as its
  own tile.
- **Wall batch.** *Proposed default (confirm at build time):* mint **sequential** wall IDs via
  `nextWallId` (respect 10013–20423 + the walkability-pref filter), per-cell height = source
  height (uniform for equal cells). **No replace-range in v1** — replace stays single-commit
  because each legacy ID wants its own decoded height. Surface item-2 eligibility on this path too.
- **Progress.** For large sheets, a `LinearProgress` (or count in the status). The parent plan
  points at [batchPipeline.ts](../../src/renderer/src/utils/batchPipeline.ts)'s `BatchProgress`
  callback pattern — reuse it rather than inventing one.

### 4. Warnings surfacing (approved)

Most of the parent plan's load-time warnings (floor ≠ 56×27, floor transparency, wall width ≠ 28)
are **moot** — the converter guarantees output geometry, and the floor-seam warning died with the
square-floor removal. What remains worth surfacing:
- **Can't-verify note:** when no `clientPath` is loaded, eligibility (and wall walkability) can't
  be checked — say so near the commit, don't imply "safe".
- **Overwrite note:** committing over an existing pack ID (single commit already blocks non-replace
  overwrite; make the intent explicit and consistent for batch/wang).
- Keep it light — no dimension warnings on our own guaranteed-correct output.

## Suggested order

1. `tileEligibility.ts` + tests (item 1) — unblocks item 2.
2. Wire the combined warning into the single commit panel; apply to wang + `commitAllFloors`
   (item 2).
3. Multi-file loose import + wall batch + progress (item 3).
4. Fold in the can't-verify / overwrite notes (item 4).

## Verification each step

`npx prettier --write <changed>` → `npm run typecheck` → `npx eslint <changed>` →
`npx vitest run` (whole suite) → `npx electron-vite build` (renderer bundles). The user runs the
Electron app themselves to eyeball conversions — do **not** launch the dev server.

## Deferred (not Phase 4)

- Wang layout presets for specific source tools (Tiled corner order, RPG Maker A2 quadrant) — only
  the canonical `mask = index` preset ships; the target worlds' assets are freeform atlases handled
  by manual tagging.
- 2× scale (gated on the client virtual-resolution rebase + a manifest scale field).
- Brigid/server recommendations (manifest scale field, load-time validation, paired tile-flags
  override, server SOTP bounds-check + overlay) — separate repos.
- Opening the PR (CI validate gate runs on PR).
