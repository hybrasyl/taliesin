# Taliesin Efficiency Review

_Repo-wide efficiency swarm over the UI/hooks/data/schema layer (report-only). The
pack subsystem, the three renderers, and the XML/JSON helpers were reviewed
separately and are excluded here. 38 adversarially-verified findings._

**By category:** duplication 26, styling 5, efficiency 4, dead-code 2, simplification 1.
**By severity:** medium 20, low 17, high 1.

**Status:** all 38 findings resolved. The first 35 landed in the 2.6.0 efficiency
sweep; the three deferred follow-ups — **#3** (`useAudioPreview`), **#5** (shared
`ItemsGroup`), **#7** (shared `drawDiamond`) — landed afterward, each
behavior-preserving with added unit/render coverage.

---

## Cross-cutting (patterns spanning files/domains)

Ranked by value-to-effort.

### 1. `formatBytes` + `filenameFromPath` reinvented across the repo

- **`formatBytes`**: byte-identical copies at `music/MusicList.tsx:27`, `music/MusicMetaEditor.tsx:31`, `pages/SfxPage.tsx:35`, exported already at `utils/archiveRenderer.ts:394`; near-copy at `music/ClientMusicView.tsx:35`.
- **`filenameFromPath`**: `path.replace(/\\/g,'/').split('/').pop()` reinvented at `pages/DashboardPage.tsx:267,277`, `pages/MapMakerPage.tsx:120,292`, `palette/BatchView.tsx:276,315`; canonical export at `utils/paletteIO.ts:10`.
- **Proposal:** Add a `utils/format.ts` (formatBytes) and reuse `filenameFromPath` at the 6 matching sites. Exclude `SettingsPage.tsx:462` and `ArchivePage.tsx:48` (different semantics). ~10 deletions, behavior-preserving.

### 2. `useTransientStatus` toast hook duplicated across 4 pages

- `pages/AssetPackPage.tsx:41`, `pages/PalettePage.tsx:17`, `pages/FontEditorPage.tsx:70`, `pages/MapMakerPage.tsx:263` — same `setState + setTimeout(...,2500)`; status `<Typography>` repeated at `AssetPackPage.tsx:197`, `FontEditorPage.tsx:215`, `PalettePage.tsx:70`, `MapMakerPage.tsx:1241`.
- **Proposal:** Extract `useTransientStatus()` + `<StatusMessage>`. Adopt MapMakerPage's ref-guarded variant — it also fixes an overlapping-timeout leak in the other three.

### 3. Blob-URL audio play/stop lifecycle reimplemented 3×

- `mapeditor/MapEditorPanel.tsx:473` (MusicIdField), `mapeditor/MusicPickerDialog.tsx:51`, `archive/ArchivePreview.tsx:395` (AudioPreview) — same `audioRef`/`blobUrlRef`/`createObjectURL`/revoke/`onended` pattern.
- **Proposal:** Add a `useAudioPreview()` hook owning the audio element + blob-URL revoke; replace the three copies.

### 4. `.mus` filename → id parsing scattered (`/^(\d+)\.mus$/i`)

- `mapeditor/MusicPickerDialog.tsx:74` and `MapEditorPanel.tsx:455` both scan+parse into a `Set<number>`; same regex at `useMusicLibrary.ts:119` and `ClientMusicView.tsx:71`.
- **Proposal:** Export `parseFilename`/`scanClientMusicIds(clientPath): Set<number>` from `useMusicLibrary` and reuse everywhere.

### 5. `ItemsGroup` collapsible list-group duplicated map↔world editors

- `mapeditor/MapEditorPanel.tsx:1494` (1485-1588) vs `worldmapeditor/WorldMapEditorPanel.tsx:106-237` — same header/Collapse/List; world is a strict superset (`addDisabled`, `isOrphan`, `onEdit`).
- **Proposal:** Extract one shared `ItemsGroup`/`ItemRow` into `shared/` supporting the superset props. ~130 lines collapse.

### 6. Duotone param defaults + hex utils duplicated across palette

- **Default params** `{dark0.3, light0.3, midLow0.25, midHigh0.75}`: `CustomVariantDialog.tsx:29`, `VariantOverrideEditor.tsx:23`, `PaletteEntryEditor.tsx:91`, `PaletteManagerView.tsx:50`.
- **Hex utils** `HEX_RE` + `rgbToHex`: `PaletteEntryEditor.tsx:19`, `ColorSwatchPicker.tsx:12` (re-implements the inverse of `duotone.ts`'s `parseHex`).
- **Proposal:** Export `DEFAULT_DUOTONE_PARAMS` from `utils/variants.ts`; move `HEX_RE`/`rgbToHex` next to `parseHex` in `utils/duotone.ts`.

### 7. Iso diamond-path helper reimplemented 3× (mapmaker)

- `mapmaker/MapEditorCanvas.tsx:1165` (`drawDiamond`) inlined again at `TabMapPopup.tsx:78` and `ExportMapDialog.tsx:128`.
- **Proposal:** Export `drawDiamond(ctx, cx, cy, scale)` from `utils/mapRenderer.ts` and import in all three.

### 8. Map-prefix `id >= 30000 ? hyb : lod` rule in 3 places

- `data/mapData.ts:117`, `useCatalog.ts:218` (`xmlPrefix`, exported+tested), `mapeditor/MapEditorPanel.tsx:627`.
- **Proposal:** Route the other two through `xmlPrefix` so the threshold lives once.

### 9. Width/Height 1–512 clamp field pair copy-pasted across 3 map dialogs

- `NewMapDialog.tsx:35`, `ResizeMapDialog.tsx:62`, `GenerateMapDialog.tsx:130`.
- **Proposal:** Extract `clampMapDim(v)` + a small `<MapDimensionFields>` component.

### 10. Palette rescan-on-active effect shared BatchView↔ColorizeView

- `palette/BatchView.tsx:59` == palette half of `palette/ColorizeView.tsx:108`; palette-load effect also near-shared.
- **Proposal:** Extract `usePalettesOnActive(packDir, active)` (keep ColorizeView's calibration load separate).

### 11. `RawPreview` ≈ `DuotonePreview` (canvas paint, differs by one `applyDuotone` line)

- `palette/RawPreview.tsx:11` vs `palette/DuotonePreview.tsx:17`.
- **Proposal:** Extract `<PixelBufferCanvas>`; DuotonePreview computes `applyDuotone` then delegates.

### 12. Midpoint-slider clamp handler duplicated (palette)

- `CustomVariantDialog.tsx:53` == `VariantOverrideEditor.tsx:50` (same guard, 0.05 constant, min/max).
- **Proposal:** `clampMidpoints(value)` in `utils/variants.ts`.

### 13. Repeated container/heading sx across pack panels

- `assetpack/UiSpriteSourcesPanel.tsx:17`, `ItemIconsPanel.tsx:18`, `NpcPortraitsPanel.tsx:27` — identical container sx + bold caption.
- **Proposal:** Shared `PanelContainer` wrapper (move the heading in too).

### 14. Working-dir toolbar + empty-state screen duplicated across pages

- **Toolbar:** `PalettePage.tsx:49` == `AssetPackPage.tsx:177` (plus verbatim `handleSetDir`).
- **Empty-state "Open Settings":** `PalettePage.tsx:27`, `AssetPackPage.tsx:154`, `CatalogPage.tsx:46`.
- **Proposal:** Extract `<WorkingDirToolbar>` (right-slot for AssetPack's refresh/count) and `<EmptyStateSettings>`.

### 15. Glyph-grid container sx repeated (font)

- `font/FontGlyphGrid.tsx:23` == `font/FontBlockView.tsx:99` (56px auto-fill).
- **Proposal:** Hoist `GLYPH_GRID_SX` const; spread in both.

### 16. Shared type/schema duplication (build-time)

- **Tile atlas types** re-declared: `utils/tileThemeTypes.ts:3` vs `scripts/buildTileAtlas.ts:30-53` → `import type` from the shared module.
- **`deployPackSchema`** duplicates `musicPackSchema` field-for-field: `main/schemas/music.ts:45` → `musicPackSchema.extend({ createdAt/updatedAt optional })`.
- **`listDats`** walk duplicated: `scripts/discoverArchiveExtensions.ts:19` vs `scripts/extractByExt.ts:12` → shared `scripts/lib` helper.

---

## Localized (single-file)

Ranked by value-to-effort.

### L1. Transparent PNG export renders the entire map twice ⚠ high

- `mapmaker/ExportMapDialog.tsx:77` — `renderMap` at 83 then again at 90; the `clearRect` at 89 discards the first (both passes fill black anyway).
- **Proposal:** Render once. Eliminates a full redundant iso pass with per-tile bitmap decodes per transparent export.

### L2. Dead `isOrphan` ternary — both branches identical

- `worldmapeditor/WorldMapEditorPanel.tsx:196` — both branches render `<DeleteIcon sx={{ fontSize: 13 }} />`.
- **Proposal:** Collapse to a single `<DeleteIcon>`.

### L3. `useMusicLibrary.ts` internal dedup (3 findings)

- **`metaToDraft`** 4-field draft literal 4×: lines `290/305/358/425` → extract helper.
- **`applyOverflowTags`** merge loop duplicated: `cleanupMeta` (55-71) vs `mergeEnriched` (166-183).
- **`doScan`**: auto-scan effect (252-261) ≈ manual `scan()` (264-277) → shared `doScan()` helper.

### L4. Two no-op `void archive`/`void entry` in effect

- `archive/ArchivePreview.tsx:708` — both already used at 693 and in dep array. Delete both lines.

### L5. Redundant `pptFinal` recompute

- `mapeditor/MapRenderCanvas.tsx:266` — identical to `ppt` at 236, already in scope. Use `ppt`, delete `pptFinal`.

### L6. `markers` array rebuilt every render → forces overlay redraw

- `mapeditor/MapEditorPanel.tsx:1023` — fresh array is a dep of MapRenderCanvas's tile-iterating overlay effect (`:385`).
- **Proposal:** `useMemo` keyed on `data.warps/npcs/signs/reactors`.

### L7. Unused-library-entries filter recomputed 3× per render

- `music/PacksPanel.tsx:336` — same `.filter` at 337/348/350. Hoist to one `const available`.

### L8. Canvas error-draw block copy-pasted twice

- `catalog/DimensionPickerDialog.tsx:165` and `:185` identical but message text. Extract local `drawCanvasError(canvas, msg)`.

### L9. Glyph bit-decode loop duplicated (font)

- `font/FontGlyphTile.tsx:42` vs `font/FontPixelEditor.tsx:30` — same `(byte >> (7-x)) & 1`; `GLYPH_WIDTH/HEIGHT` redeclared. Extract `decodeGlyphBits(glyph)` + shared constants.

### L10. `rectOutline`/`circleOutline` dedup closure copy-pasted

- `utils/mapEditorTools.ts:119` and `:163` — same `seen`/`add`. Extract `pushUnique(coords, seen, tx, ty)`.

### L11. Active vs archived map file rows nearly identical

- `pages/MapEditorPage.tsx:377` (active) vs `:433` (archived) — differ only by muted color. Extract `renderFileRow(f, { muted })`.

### L12. Collision-popup legend rows repeated verbatim (3×)

- `mapmaker/TabMapPopup.tsx:168` — map over `[{color,label}]`.

### L13. `ALL_BOARD_TYPES` typed `string[]` with casing drift

- `data/mapData.ts:112` — `'Messageboard'` vs `BoardType` union `'MessageBoard'`. Retype as `BoardType[]` to surface the drift (verify serializer casing — XML canonical is `MessageBoard`).

---

## Suggested first wave

Highest value-per-effort, mostly mechanical and behavior-preserving:

1. **L1 — Transparent PNG double-render** (`ExportMapDialog.tsx:77`) — only `high` severity; deletes a full redundant render pass.
2. **L2 — Dead `isOrphan` ternary** (`WorldMapEditorPanel.tsx:196`) — 5 lines, zero risk.
3. **#1 — Consolidate `formatBytes` + `filenameFromPath`** — kills the most widespread copy-paste; existing exports to reuse.
4. **#2 — `useTransientStatus` hook** — dedups 4 pages _and_ fixes a real timeout leak.
5. **L7 — Hoist `PacksPanel` filter** + **L4/L5 void & `pptFinal`** — trivial one-file efficiency/cleanups.
6. **L3 — `useMusicLibrary` internal dedup** — 3 findings, one file, covered by existing tests.
7. **#3 — `useAudioPreview()` hook** — collapses 3 hand-rolled audio lifecycles (moderate effort, high payoff).
8. **#16 — Build-time type/schema dedup** (`tileThemeTypes`, `music.ts` schema, `listDats`) — safe, no runtime impact.
