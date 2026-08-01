# WP2 — LFT glyph browser

**Size: M.** Grew from S–M — see _Correction_ below. **Not started.**

**Depends on:** [WP0](complete/00-dalib-ts-3-bump.md) (shipped, so this is unblocked). Read `00-overview.md` first.

## Goal

`da.lft` and `lod.lft` live in `national.dat` and are the client's active font. `classifyEntry` in `archiveRenderer.ts` has no `.lft` case, so they fall through to a hex dump. This WP makes the Archive Viewer show the client's real font as a font — the other half of the trade [WP3](complete/03-remove-fnt-editor.md) opened by deleting the FNT editor.

## Decisions (Sabrael, 2026-07-28)

1. **LFT is read-only.** `lft.md:159` records that the client contains no confirmed LFT writer, so Taliesin browses LFT and does not author it.

## Correction — the components this WP was to inherit no longer exist

The milestone doc scoped this WP as retargeting `FontGlyphGrid` and `FontPixelEditor`, which it said would "survive into WP2" when WP3 deleted the FNT editor. **They did not survive.** WP3 removed `src/renderer/src/components/font/` in full (verified 2026-08-01: the directory is gone from `main`). The glyph grid and the per-glyph bitmap view are therefore **new components in this WP**, not edits, which is why the size moved from S–M to M.

## New dependency

None. **No parser work — dalib-ts 3.0.0 already ships `LftFile`,** and Taliesin is on ^3.1.0.

- `LftFile.fromEntry(entry)` → `nominalWidth`, `nominalHeight`, `glyphs[]`, `bitmapData`, plus `isValidKey`, `getGlyph`, `getAdvance`, `getGlyphPixels(key)`.
- Helpers `lftGlyphWidth`, `lftGlyphHeight`, `lftRowStride`.
- `Graphics`: `renderLftText`, `measureLftText`, `drawLftGlyph`, `lftGlyphKeys` (with a DBCS lead-byte path).

**That last group is worth more than the glyph grid.** A "type a string, see it rendered in the client's real font, with real per-glyph metrics" box is a few lines on top of `renderLftText`, and it is the thing that actually tells an author whether a label will fit.

## File map

- `src/renderer/src/utils/archiveRenderer.ts` *(edit)* — add `'lft'` to `PreviewType` and a `.lft` case to `classifyEntry`.
- `src/renderer/src/components/archive/LftPreview.tsx` *(new)* — header summary, a jump-to-key box, a glyph grid, and a sample-text field driven by `renderLftText`.
- `src/renderer/src/components/archive/LftGlyphGrid.tsx` *(new)* — virtualised or paged grid over populated glyphs. Was to be a retarget of the deleted `FontGlyphGrid`; see _Correction_.
- `src/renderer/src/components/archive/LftGlyphInspector.tsx` *(new)* — one glyph's bitmap and metrics, read-only. Was to be a retarget of the deleted `FontPixelEditor`; see _Correction_.

## Two things this format makes non-obvious

Bounds validation is no longer one of them — `LftFile` owns it.

1. **65,535 records at 3.4 MB per entry.** The grid must be virtualised or paged. Do not render every key. Most records have `bitmap_offset == 0` and draw nothing, so filtering to populated glyphs is the useful default view. This is also the case the OOM finding cares about: **do not put the `LftFile` in a React prop** — see `complete/archive-preview-dev-oom.md`, and follow `archiveStore.ts`, which passes an index rather than the object.
2. **Keys are not Unicode.** `lft.md:155-159` is explicit: the index is the raw ANSI or DBCS byte value, and its meaning depends on the code page the client had selected. Label the browser by **key**, never by character name, and say which code page a key would be read under (`text.md:43-52` maps language mode → font entry → code page).

## Non-goals (stop-lines)

- **No LFT writing.** Per Decision 1. If a writer is ever wanted, `lft.md:159` sets the bar: preserve all 65,535 records, recalculate every offset, keep the 4-byte row alignment, and round-trip every mask before calling it compatible. Recorded in `00a-backlog.md`.

## Tests

The preview component against a small synthetic `LftFile`: populated glyph, empty glyph, and a measured sample string. **Do not re-test the parser** — dalib-ts owns and covers it.

## Acceptance criteria

1. Open `national.dat` and select `da.lft`: the header summary appears.
2. Populated glyphs can be browsed, and the grid does not hang on a 65,535-record file.
3. One glyph's bitmap and metrics (`advance`, `left`, `top`, `right`, `bottom`) can be inspected.
4. A typed sample string renders in the client's font with real metrics.
5. Every glyph is labelled by key, with the code page it would be read under stated.
6. All checks green.
