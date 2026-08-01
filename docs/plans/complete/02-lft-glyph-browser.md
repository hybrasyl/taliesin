# WP2 — LFT glyph browser

**Size: M. ✅ Shipped 2026-08-01.** Grew from S–M — see _Correction_ below.

**Depends on:** [WP0](00-dalib-ts-3-bump.md) (shipped). Read `../00-overview.md` first.

## What shipped, against this plan

The three planned components, plus a fourth file the plan implied but did not name.

**`lftFontContext.ts` is how "do not put the `LftFile` in a React prop" is actually enforced.** The
plan states the rule; it does not say by what mechanism, and the mechanism is not obvious once the
grid and the inspector are separate files — they need the font, and a prop is the ordinary way to
give it to them. A context carries it instead, and the children take only primitives (a key, a page
number, a zoom). This is the same shape `archiveStore.ts` uses for the `DataArchive`, for the same
reason: `bitmapData` is a multi-megabyte `Uint8Array`, and React 19.2's dev build enumerates a
changed prop's own keys, which for a typed array is one row per byte.

**Paged, not virtualised.** The plan allowed either. Filtering to populated glyphs first is what
makes the choice easy: `da.lft` has 65,535 records and only a few hundred draw anything, so the
browsed list is small and a page of 256 costs exactly one canvas. `@tanstack/react-virtual` is in
the repo and was not needed here.

**Cells are sized to the widest and tallest glyph on the page, never below the nominal box.** A
glyph's `left + width` can reach past `nominalWidth`; sizing cells to the nominal box would clip
real ink and misreport the font.

**Code page, stated in the UI.** Single-byte keys are read under the client's ANSI code page
(Windows-1252 on the Western client); two-byte keys are DBCS pairs read under code page 949
(EUC-KR). Sourced from the document repo's `plans/hybrasyl.client/font-architecture.md` §4 and
`font-modernization-findings.md`, which record the legacy `GetKoreanGlyphIndex` EUC-KR path.

Acceptance criterion 4 — the typed sample string — is served by `renderLftText` plus
`measureLftText`, and the measured advance and ink box are shown beneath it. As the plan predicted,
that box was a few lines and is the most useful part of the view.

Files: `src/renderer/src/components/archive/LftPreview.tsx`, `LftGlyphGrid.tsx`,
`LftGlyphInspector.tsx`, `lftFontContext.ts` (all new), plus the `'lft'` `PreviewType`.

---

_Original plan follows._

## Goal

`da.lft` and `lod.lft` live in `national.dat` and are the client's active font. `classifyEntry` in `archiveRenderer.ts` has no `.lft` case, so they fall through to a hex dump. This WP makes the Archive Viewer show the client's real font as a font — the other half of the trade [WP3](03-remove-fnt-editor.md) opened by deleting the FNT editor.

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

1. **65,535 records at 3.4 MB per entry.** The grid must be virtualised or paged. Do not render every key. Most records have `bitmap_offset == 0` and draw nothing, so filtering to populated glyphs is the useful default view. This is also the case the OOM finding cares about: **do not put the `LftFile` in a React prop** — see `archive-preview-dev-oom.md`, and follow `archiveStore.ts`, which passes an index rather than the object.
2. **Keys are not Unicode.** `lft.md:155-159` is explicit: the index is the raw ANSI or DBCS byte value, and its meaning depends on the code page the client had selected. Label the browser by **key**, never by character name, and say which code page a key would be read under (`text.md:43-52` maps language mode → font entry → code page).

## Non-goals (stop-lines)

- **No LFT writing.** Per Decision 1. If a writer is ever wanted, `lft.md:159` sets the bar: preserve all 65,535 records, recalculate every offset, keep the 4-byte row alignment, and round-trip every mask before calling it compatible. Recorded in `../00a-backlog.md`.

## Tests

The preview component against a small synthetic `LftFile`: populated glyph, empty glyph, and a measured sample string. **Do not re-test the parser** — dalib-ts owns and covers it.

## Acceptance criteria

1. Open `national.dat` and select `da.lft`: the header summary appears.
2. Populated glyphs can be browsed, and the grid does not hang on a 65,535-record file.
3. One glyph's bitmap and metrics (`advance`, `left`, `top`, `right`, `bottom`) can be inspected.
4. A typed sample string renders in the client's font with real metrics.
5. Every glyph is labelled by key, with the code page it would be read under stated.
6. All checks green.
