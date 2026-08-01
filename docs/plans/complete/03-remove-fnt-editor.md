# WP3 — Remove the FNT editor

**Size: S.** No dependency. **Shipped** — PR #25, branch `chore/remove-font-editor`, merged to `main` in `f291995`.

**Depends on:** nothing. Read `../00-overview.md` first.

## Goal

Taliesin shipped an editor for a font format the 7.41 client stopped calling. It wrote files nothing loads. Delete it rather than fix it, and let [WP2](../02-lft-glyph-browser.md) replace it with a browser for the format the client actually reads.

## Decisions (Sabrael, 2026-07-28)

1. **The FNT editor is deleted, not fixed.** `darkages-741-re/docs/file-formats/fnt.md` and `docs/rendering/text.md:86-92` establish that the `eng%02d.fnt` / `han%02d.fnt` loaders have no callers and are not in the `FontImageLib` vtable. `Darkages.cfg` still stores `EngFont` and `HanFont` indexes, which is what makes the format look live. dalib-ts 3.0.0 reached the same conclusion independently and documents `FntFile` as the dormant font format.

## File map

- `src/renderer/src/pages/FontEditorPage.tsx` *(deleted)* — 363 lines.
- `src/renderer/src/components/font/` *(deleted in full)* — `FontBlockView.tsx`, `AddGlyphDialog.tsx`, `glyph.ts`, **and also `FontGlyphGrid` and `FontPixelEditor`**.
- `src/renderer/src/store/uiStore.ts` — dropped `'fonteditor'` from `Page`.
- `src/renderer/src/components/{NavToolbar,PageRenderer}.tsx` — dropped the nav button and the route arm.
- `src/renderer/src/components/archive/ArchivePreview.tsx`, `utils/archiveRenderer.ts` — dropped the `'font'` preview type and its `FntFile` import.
- Tests referencing the page or the `.fnt` preview.

> **This WP deleted more than its plan said it would, and WP2 inherited the cost.** The milestone doc scoped `FontGlyphGrid` and `FontPixelEditor` to "survive into WP2" and be retargeted at LFT records. The whole `components/font/` directory went. WP2 therefore builds its glyph grid from scratch rather than retargeting one, and its size moved from S–M to M. Recorded in [WP2](../02-lft-glyph-browser.md) as well, because the correction belongs in the WP that pays for it.

## Acceptance criteria

1. No route, nav entry or preview type reaches the deleted editor.
2. `CHANGELOG.md` carries a `### Removed` entry that states **why** — that the format is dormant in the 7.41 client, not that the feature was unpopular. A user who authored `.fnt` files with it deserves to know they were never loaded.
3. All checks green.
