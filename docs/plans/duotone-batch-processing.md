# Duotone Phase 3: Batch Processing

## Context

Audit of `docs/taliesin_duotone_scope.md` against the codebase shows Phases 1, 2, and 4 are shipped; only Phase 3 (batch processing) remains. Goal: complete the duotone pipeline so the success criteria in §11 of the scope doc can be met (20–30 form-swap icons × 17 elements processed in under an hour).

This plan supersedes the §3 work in the original scope doc, which has been archived to `docs/completed/`.

## Status by Phase

### Phase 1 — Palette Definition & Simple Processing ✅ Done

- Palette JSON schema (Zod): [src/main/schemas/palette.ts](../../src/main/schemas/palette.ts)
- Palette Manager UI: [src/renderer/src/components/palette/PaletteManagerView.tsx](../../src/renderer/src/components/palette/PaletteManagerView.tsx)
- Duotone algorithm with BT.601 luminance + four-stop gradient: [src/renderer/src/utils/duotone.ts](../../src/renderer/src/utils/duotone.ts)
- Single-icon processing + PNG output: [src/renderer/src/components/palette/ColorizeView.tsx](../../src/renderer/src/components/palette/ColorizeView.tsx)
- IPC: `palette:scan|load|save|delete|calibrationLoad|calibrationSave|frame:scan` — [src/main/handlers.ts](../../src/main/handlers.ts)
- Storage roots: `{packDir}/_palettes/`, `{packDir}/_calibrations/`, `{packDir}/_frames/`

### Phase 2 — Variant Selection & Calibration ✅ Done

- Variant set: [src/renderer/src/utils/variants.ts](../../src/renderer/src/utils/variants.ts) — 8 variants. Doc lists 9 but explicitly notes `contrast = strong` (duplicate); the dedup is intentional and correct.
- Variant grid + Auto badge: [src/renderer/src/components/palette/VariantGrid.tsx](../../src/renderer/src/components/palette/VariantGrid.tsx)
- Auto-detection scoring (50% range / 30% contrast / 20% midtone): variants.ts:111-160
- Calibration types + persistence: [src/renderer/src/utils/paletteTypes.ts](../../src/renderer/src/utils/paletteTypes.ts), ColorizeView lines 146–369
- Color picker (hex + react-colorful wheel): [src/renderer/src/components/palette/ColorSwatchPicker.tsx](../../src/renderer/src/components/palette/ColorSwatchPicker.tsx)
- Custom params dialog (sliders + clampBlack/clampWhite): [src/renderer/src/components/palette/CustomVariantDialog.tsx](../../src/renderer/src/components/palette/CustomVariantDialog.tsx)
- Tests: [src/renderer/src/utils/__tests__/](../../src/renderer/src/utils/__tests__/) — duotone, variants, paletteIO

### Phase 3 — Batch Processing ❌ Not started

Specifically missing:

- No Batch Processor view component or page tab. PalettePage only wires `palette` and `colorize` tabs.
- No folder-scan IPC for sourcing batch input.
- No batch-process IPC. ColorizeView writes one PNG at a time via `window.api.writeBytes`; no fan-out helper.
- No grayscale master pipeline. `toGrayscale()` exists in duotone.ts:105-116 but nothing writes/reads `{packDir}/_masters/{asset_id}.png` or checks mtimes.
- No progress reporting for multi-file runs.
- No output-naming template (`{asset_id}_{palette_id}_{entry_id}.png` only ad-hoc in ColorizeView).
- No options surface for "use saved calibration", "auto-detect uncalibrated", "regenerate masters", "override variant".
- No completion summary report.

### Phase 4 — Polish & Advanced Features ⚠️ Mostly done

- ✅ Color picker (hex + wheel)
- ✅ Canonical test icon — `testIconPath` is wired end-to-end in PaletteManagerView.tsx:121-146, 315-366
- ✅ Multi-palette support
- ✅ Custom variants per palette (see VariantOverrideEditor.tsx)
- ✅ Black/white clamping
- ➖ Export to client-ready format — not needed. Palette JSON is Taliesin-only today; the MonoGame client consumes pre-baked PNGs, not palettes. The JSON is kept simple enough that if a future client need arises (e.g. runtime shader tinting), it should be ingestible as-is. A slimmed `palette:export` IPC remains documented in [paletteTypes.ts](../../src/renderer/src/utils/paletteTypes.ts) as the fallback if schemas ever diverge.

## Resolved Decisions

- **Batch input**: arbitrary folder picker. User points at any directory of PNGs at batch time.
- **Output location**: `{packDir}/_colorized/` sibling folder, consistent with the existing `_palettes/_calibrations/_frames/_masters` convention. Easy to wipe and regenerate.
- **Manifest**: write `manifest.json` per batch under `{packDir}/_colorized/` with `{ paletteId, ranAt, entries: [{ source, entryId, output, variantId, calibrationSource: 'saved'|'auto'|'override' }] }`. Downstream tooling can read this without scraping filenames.

## Implementation (shipped)

1. **Grayscale master pipeline.** ✅ commit `bc23b38`
   - [src/renderer/src/utils/grayscaleMaster.ts](../../src/renderer/src/utils/grayscaleMaster.ts) caches BT.601 grayscale of each source under `{packDir}/_masters/{basename}.png`. Mtime-based invalidation; regenerates when source mtime > master mtime, master is missing, or `force=true`.
   - Generic `fs:stat` IPC added in main; reuses existing `fs:writeBytes`/`fs:readFile` so no new schema needed (load-side returns null on stat failure).
   - __Deferred-by-decision: ColorizeView swap.__ The plan called for ColorizeView to read through the master so single-icon and batch share one path. On reflection the master is purely a batch-side optimization (the duotone algorithm is luminance-only, so applying to the color source produces equivalent output). ColorizeView already works; touching it would only warm the master cache for free, which has no practical value since batch warms its own cache lazily. Skipped.

2. **Batch pipeline.** ✅ commit `bbc6b30`
   - [src/renderer/src/utils/batchPipeline.ts](../../src/renderer/src/utils/batchPipeline.ts) — `runBatch(packDir, paletteId, sources, options, onProgress, deps?)` orchestrates the full flow.
   - __Architectural revision__: no new `palette:batchColorize` IPC. The original plan put orchestration in the main process; in practice the renderer already has Canvas + access to `fs:writeBytes`/`fs:writeFile`/`fs:ensureDir`, so the pipeline drives the loop locally and reports progress via callback. Simpler, no IPC streaming-channel work needed, gives BatchView direct React-state control over progress UI.
   - Variant selection priority: `overrideVariantId` > saved calibration (when `useCalibration=true`) > auto-detect (when `autoDetect=true`) > balanced default.
   - Output naming: `{asset_id}_{palette_id}_{entry_id}.png`.
   - Per-pair errors collected as failures and reported in result without aborting the run.

3. **BatchView UI.** ✅ commit `242aaef`
   - [src/renderer/src/components/palette/BatchView.tsx](../../src/renderer/src/components/palette/BatchView.tsx) — folder picker, palette dropdown, options panel (4 checkboxes + variant override), live progress strip, completion summary card with first-10 failure list.
   - Wired into [src/renderer/src/pages/PalettePage.tsx](../../src/renderer/src/pages/PalettePage.tsx) as the third tab.

4. **Determinism guarantee.** ✅ in commit at end of branch
   - Unit test in [src/renderer/src/utils/__tests__/batchPipeline.test.ts](../../src/renderer/src/utils/__tests__/batchPipeline.test.ts) — runs `runBatch` twice with a deterministic encoder stub and asserts byte-identical writes + identical manifest (modulo `ranAt`). Proves the orchestration layer is deterministic.
   - PNG byte-determinism beyond that point depends on Chromium's `canvas.toBlob('image/png')` being deterministic for identical pixel data. This holds in practice but cannot be unit-tested in jsdom; manual smoke test is `git diff` on the output folder after a re-run.

## Verification

- ✅ Unit tests for `grayscaleMaster.ts` (12 cases — mtime cache hit/miss, master regeneration on source change, force flag).
- ✅ Unit tests for `batchPipeline.ts` (17 cases — variant decision matrix, override precedence, auto-detect fallback, source-load failure isolation, per-entry failure recovery, Windows-path normalization, two-run determinism).
- Manual smoke (run by user, see release checklist): launch Electron dev, open Palettes & Duotone → Batch tab, point at the elements palette + an icon folder, Run Batch with defaults, inspect `{packDir}/_colorized/` for outputs + `manifest.json`, re-run and `git diff` to confirm determinism.
