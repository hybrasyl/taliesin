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

## Implementation Slice

1. **Grayscale master pipeline.**
   - New renderer util `grayscaleMaster.ts` that, given a source path, returns a cached master path under `{packDir}/_masters/{basename}.png`, regenerating only when source mtime > master mtime.
   - Add `master:stat` and `master:write` IPC (or extend existing IPC); ensure `_masters/` is inside the session-scoped allowed roots.
   - Switch ColorizeView's per-source render to read from the master so single-icon and batch share one path.

2. **Batch IPC + worker.**
   - New main-process handler `palette:batchColorize` that takes `{ packDir, paletteId, sources: string[], options: { useCalibration, autoDetect, overrideVariantId?, regenerateMasters } }` and streams progress events back via a channel.
   - Algorithm runs in renderer for now (Canvas API already proven correct in tests); main process handles fs reads/writes and progress emit. Defer `sharp`/Node-side rendering until performance forces it.
   - Output naming: `{asset_id}_{palette_id}_{entry_id}.png`.

3. **BatchView UI.**
   - New tab in PalettePage.tsx: `palette | colorize | batch`.
   - Source selector: folder picker.
   - Palette dropdown (reuse `PaletteSummary` loader from `paletteIO.ts`).
   - Options panel: 4 checkboxes + variant override dropdown.
   - Progress strip with live "x / N — current file" + per-file status (ok/skip/fail).
   - Completion summary card (counts + failure list).

4. **Determinism guarantee.**
   - Verify per §11 that re-running a batch over the same calibration produces byte-identical PNGs. Canvas `toBlob` PNG output should already be deterministic for identical pixel data; add a checksum test.

## Critical Files to Touch

- New: `src/renderer/src/components/palette/BatchView.tsx` — folder-picker source, palette dropdown, options panel, progress strip, completion summary
- New: `src/renderer/src/utils/grayscaleMaster.ts` — mtime-cached master loader
- New: `src/renderer/src/utils/batchPipeline.ts` — orchestrates calibration resolution → variant selection → render → write; emits per-file progress; aggregates manifest entries
- New: `src/main/schemas/batch.ts` — Zod schemas for batch IPC payloads
- Edit: [src/renderer/src/pages/PalettePage.tsx](../../src/renderer/src/pages/PalettePage.tsx) — add `batch` tab
- Edit: [src/main/handlers.ts](../../src/main/handlers.ts) — add `palette:batchColorize` (streaming progress channel) + `master:stat` and `master:write` IPC; ensure `_colorized/` and `_masters/` are inside the session-scoped allowed roots
- Edit: [src/preload/index.ts](../../src/preload/index.ts) — expose new IPC on `window.api` with subscribe-style progress callback
- Reuse: `applyDuotone`, `toGrayscale`, `autoDetectBest`, `loadCalibrations`, `outputFilename`, the existing folder-picker dialog used for palette/frame dirs

## Verification

- Unit tests for `grayscaleMaster.ts` (mtime cache hit/miss, master regeneration on source change).
- Unit tests for `batchPipeline.ts` (calibration override precedence, auto-detect fallback, output filename templating).
- Integration: run a batch over a test fixture pack with 3 icons × 4 entries; confirm 12 outputs, masters cached, progress events fired in order, second run is no-op (idempotent and byte-identical PNGs).
- Manual: launch dev (user runs Electron themselves), open the new Batch tab, point at the elements palette + an icon folder, run with default options, inspect output folder.
