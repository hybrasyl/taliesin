# Backlog — the deferral register

Not a work package, and it never becomes one. This file accrues for the life of the project. Read `00-overview.md` first.

Three kinds of entry: work **owed to another repo** (real, but not this repo's code), work **parked behind a named trigger**, and **non-goals with no trigger** (recorded so they are not re-proposed as cleanups).

**Owed is not parked.** An item is owed — and belongs in a milestone section of `00-overview.md`, not here — if it was promised to a date or specified by a shipped WP and never built. Everything else is parked.

---

## Owed to another repo

### Folder picker on save → Creidhne

Taliesin's map XML and world map editors do recursive `listSection` enumeration, folder-grouped file lists and subfolder-preserving rename/archive — matching Creidhne's `feat/recursive-subdirectory-support` — **plus** a destination folder picker on save, which Creidhne deliberately left out. The Taliesin side is shipped; the handoff for grafting the last part onto Creidhne's 14 editor pages is `complete/folder-picker-on-save.md`. Three small pieces: `folderOptions(files)`, `normalizeFolder(input)` and the `FolderSelect` component. **This can never be a Taliesin WP** — the code lives in Creidhne.

### Server-side SOTP overlay → hybrasyl-server

The SOTP overlay, bounds-check and native tile attributes on the server side. Named as out of scope by [WP5](complete/05-sotp-tile-adoption.md); it is `hybrasyl-server`'s code.

### A public reader for one palette cycling file → dalib-ts

`PaletteTable.parseCyclingText` is private and reachable only through `PaletteTable.fromArchive`, which merges a whole family of `.tbl` files and keys each one by the number in its name. There is no public entry point that takes one entry's bytes, so [WP4](complete/04-typed-tbl-views.md) reproduces the grammar — three integers per line — in `src/renderer/src/utils/tblTables.ts` to preview a single `mpt001.tbl`. A `PaletteCyclingTable.fromEntry` (or an exported parse) in dalib-ts would let Taliesin delete that reader. Small, and not blocking: the grammar is three integers and is covered by Taliesin's own tests.

### Palette rule corrections → dalib-ts and the document repo

Per settled decision 4, palette resolution rules live in dalib-ts and are specified by the document repo's `docs/architecture/palette-resolution.md`. A rule that fires wrongly is a dalib-ts fix plus a spec correction, never a Taliesin patch.

---

## Parked behind a named trigger

### Custom-SOTP authoring UI and the Brigid client consumer

**Trigger: FIRED.** [WP5](complete/05-sotp-tile-adoption.md) shipped 2026-08-10 and the Part C seam exists. WP5 records where the layer plugs in — the `static_tiles` covers schema, a `packResolveSotp` IPC method, and the merge point in `loadMapAssets` — and stopped there. Because Part A made `SotpFile` the single source, the merge is one localised change and every consumer reflects pack SOTP without being touched again. Deliberately unnumbered: it is a feature on top of the foundation, and its shape depends on what WP5 found. Tracked as HTOO-153; it needs a milestone and a WP number before it is work.

### Ambient interval scheduling

**Trigger:** the document repo's `docs/plans/hybrasyl.client/ambient-audio-pipeline.md` promotes it past §4. [WP6](complete/06-ambient-sounds-pack-kind.md) shipped the loop flag only, as the negative `no_loop` — beds loop by default, so only one-shots are written down. The `covers` blob is keyed by numeric id, which is what lets `{ "mode": "interval", "play": 180, "silence": 120 }` arrive with no schema bump, and `entrySchema` already accepts those fields without authoring them. A pack written by a later Taliesin therefore opens in this one rather than failing validation.

### The remaining `.datf` pack kinds

**Trigger:** the release after the current milestone. `effects`, `projectiles`, `display_sprites`, `aisling_body`, `bundle`, `fonts`, `cutscenes` and `skeletal_animations` are scoped in the document repo with no Taliesin kind yet. They are candidates, not scope creep for the current milestone.

### 2× static tiles

**Trigger:** the Brigid client's virtual-resolution rebase. Recorded in `complete/static-tile-manager.md`; the Static Tile Manager shipped at 1×.

### `packImport.test.ts` flakes under full-suite load

**Trigger:** it fails a run that matters, or someone is in that file anyway. `packImport — basics > extracts a compiled .datf into a fresh project + asset files` intermittently exceeds vitest's 5 s default. Observed 2026-08-01 at 5429 ms in a full `test:coverage` run; the same test passes in **684 ms** when run alone (`npx vitest run --project node src/main/__tests__/packImport.test.ts`). It builds real `.datf` bytes through `archiver` and reads them back through `unzipper`, so it is genuinely the slowest node test and loses to contention rather than to a defect. The fix is a per-test timeout, not a global one.

### `loadFiles` should be a `useCallback` in the two file-list pages

**Trigger:** the next substantial change to either page's loading path. `MapEditorPage.tsx` and `WorldMapPage.tsx` both call a body-declared `loadFiles()` from an effect keyed on `activeLibrary`. Listing `loadFiles` as a dependency would re-scan the library filesystem on **every render**, so both carry a justified `eslint-disable` instead. Satisfying the rule honestly means wrapping `loadFiles` in `useCallback` with its own dependency set, which reaches into how each page tracks selection and editing state — worth doing, not worth doing blind. `MapCatalogEditor.tsx` carries a third disable that is **not** this: reading `entry.width`/`entry.height` without depending on them is correct there, because the picker writes those values back and the effect would re-read the file.

---

## Non-goals with no trigger

- **No LFT writing.** The 7.41 client contains no confirmed LFT writer (`lft.md:159`). If one is ever wanted, the bar is: preserve all 65,535 records, recalculate every offset, keep the 4-byte row alignment, and round-trip every mask before calling it compatible.
- **No palette rule layer in Taliesin.** See _Owed_ above; this is the flip side of the same decision.
- **No legacy binary editing.** Taliesin reads legacy archives and authors `.datf`. Writing back into `.dat`/`.pak` was dropped as a goal.
- **No `tile_collision` content type.** Superseded by settled decision 5 — custom SOTP travels inside the `static_tiles` pack. Its design doc was deleted in `12c91b8`.
- **No `dependabot.yml`.** A house-wide decision (`electron-app-skeleton.md` §7), not an oversight. It was tried and produced noise rather than signal; dependency and action bumps are done by hand when a deprecation or advisory surfaces one.
- **No PR or issue templates.** A house-wide decision (Sabrael, 2026-07-31). Templates are overhead for a repo with one maintainer and an internal audience, and the in-app Report Issue module already builds a structured, scrubbed report.
