# Update scope — palette resolution, LFT fonts, SOTP adoption, ambient packs

**Status (2026-07-28): scope agreed, not started.** Baseline is 2.8.0.

Six work packages. Five of them are read/decode work on legacy client formats; one adds a pack
kind. **Three are gated on the same dalib-ts release**, so the dependency bump is the spine of
this update, not an afterthought.

## Goal

Taliesin shows a legacy sprite in the wrong colours until the user guesses a palette, shows the
client's real font as a hex dump, and ships an editor for a font format the client stopped
calling. This update makes the Archive Viewer tell the truth about what is in a `.dat`, and
retires the part that lies.

## Decisions (Sabrael, 2026-07-28)

1. **The FNT editor is deleted, not fixed.** `darkages-741-re/docs/file-formats/fnt.md` and
   `docs/rendering/text.md:86-92` establish that the `eng%02d.fnt` / `han%02d.fnt` loaders have no
   callers and are not in the `FontImageLib` vtable. `Darkages.cfg` still stores `EngFont` and
   `HanFont` indexes, which is what makes the format look live. The editor writes files the 7.41
   client cannot read. dalib-ts 3.0.0 reached the same conclusion independently and now documents
   `FntFile` as the dormant font format.
2. **LFT replaces it, read-only.** LFT is the active format. `lft.md:159` records that the client
   contains no confirmed LFT writer, so Taliesin browses LFT and does not author it.
3. **The palette dropdown stays.** Auto-resolution seeds it with the correct palette. Selecting a
   different palette by hand keeps working exactly as it does today.
4. **`ambient_sounds` is included**, although it is a pack kind rather than a legacy-format
   feature. It has an assigned phase and a gate in the document repo's
   `docs/plans/hybrasyl.client/ambient-audio-pipeline.md` §4.

## Dependency spine — read this first

Taliesin has `@eriscorp/dalib-ts` **2.2.0** installed. Almost everything this update needs already
shipped in **3.0.0** (published 2026-07-24); only the palette resolver is still in flight.

| Needs | Ships in | State |
| --- | --- | --- |
| `LftFile` + `renderLftText`/`measureLftText`/`drawLftGlyph`/`lftGlyphKeys` | 3.0.0 | **published** |
| `SotpFile`, `Tile`, the `renderTile` ground fix, `renderPalettized` `colorKey` | 3.0.0 | **published** |
| `PaletteResolver`, `matchPaletteRule`, `PaletteLookup.getResolvedPaletteForId` | 3.1.0 | written, unreleased |

**WP0 (the bump) unblocks WP2 and WP5 today.** Only WP1 waits, and only for the 3.1.0 publish.
WP3, WP4 and WP6 never needed a bump at all.

Order: **WP0 first** — it is a major bump with real output changes (below), so it wants its own
verification pass rather than riding inside a feature PR. Then WP2, WP3, WP4, WP5, WP6 in any
order, and WP1 when 3.1.0 lands.

## WP0 — Bump dalib-ts 2.2.0 → 3.0.0

**Size: S to M — small diff, wide blast radius.** No dependency.

3.0.0 removes no API. The major bump is driven by **decode fixes that change rendered output**,
which is exactly the kind of change a feature PR should not hide. Each of these touches something
Taliesin draws:

- **`renderTile` ground tiles.** Index 0 is now opaque and everything outside the isometric
  diamond is masked to transparent; padding no longer shows as garbage. dalib verified this
  against `TILEA.BMP`: ~417k index-0 pixels across 1,143 tiles, and 1,100 stray padding bytes
  across 65 tiles. **This lands in the archive `.bmp` tileset preview only**
  (`ArchivePreview.tsx:553` is Taliesin's sole `renderTile` caller). The map is unaffected —
  `mapRenderer.ts` still uses its local `pixelsToImageData` for both ground and walls, which is
  precisely the divergence WP5 Part B closes.
- **SPF `left`/`top`/`pitch` are honoured.** Sprite previews that were subtly misplaced move.
- **`ControlFile` no longer invents UI frames** — `<IMAGE>` is an ordered list. Affects UI Layout
  Forge prefab import (`uiforge/prefabImport.ts`).
- **`HeaFile` masks run intensity with `& 0x3F`.** Affects the darkness preview.
- **`MapFile` reads tile IDs as unsigned** and tolerates trailing bytes. Affects map loading.
- **`PaletteTable` strips `//` comments.** Affects map tile palette lookups.

**Verify each of these deliberately.** A green test suite is necessary but not sufficient — most
of them change pixels, not return codes. The `npm run dev` list at the end of this document exists
mostly for WP0.

---

## WP1 — Auto-resolve palettes in the Archive Viewer

**Size: S.** Depends on dalib-ts **3.1.0**. **Build against the local checkout — do not wait for
the npm publish** (Sabrael, 2026-07-28). Publishing 3.1.0 after Taliesin has exercised it is the
point: this is the integration test.

### Developing against local dalib-ts

```bash
cd <repos>/dalib-ts && npm run build && npm link      # dist/, then register
cd <repos>/taliesin  && npm link @eriscorp/dalib-ts   # symlink node_modules entry
```

Verified working 2026-07-28: `node_modules/@eriscorp/dalib-ts` resolves to the checkout at 3.1.0,
Taliesin typechecks, all 1061 tests pass, and `npm run build` succeeds against it.

Four things about this setup that will otherwise cost someone an afternoon:

1. **`npm link` does not touch `package.json`.** That is the reason to prefer it over a `file:`
   dependency — there is no bad version spec to accidentally commit. It also means the manifest
   still says `^3.0.0` while you are building against 3.1.0, so **the manifest is lying for the
   duration**. WP1 does not merge until 3.1.0 is published and the manifest says `^3.1.0`.
2. **The link points at `dist/`, not `src/`.** Re-run `npm run build` in dalib-ts after every
   change there, or Taliesin keeps compiling against the previous build.
3. **Any `npm install` or `npm ci` in Taliesin silently drops the link** and restores registry
   3.0.0. The symptom is a confusing "`PaletteResolver` is not exported" at a point where nothing
   you changed touches the import. Re-run the second command above. Check with
   `node -e "console.log(require('fs').realpathSync('node_modules/@eriscorp/dalib-ts'))"`.
4. **CI has no link.** WP1 will fail CI until 3.1.0 publishes. That is expected, not a defect —
   keep WP1 out of a merge queue until then.

Before publishing 3.1.0, verify the *packaged* artifact rather than the symlink: `npm pack` in
dalib-ts and install the tarball into Taliesin once. A symlink reads the working tree, so it
cannot catch a `files`/`exports` mistake that would ship a broken tarball.

The specification is the document repo's `docs/architecture/palette-resolution.md`. Taliesin
consumes the resolver; it does not implement the rules. The shipped API matches the spec:

```ts
new PaletteResolver(archiveName, archive, provider).resolve(entry, frameIndex?)
  // → { palette, paletteNumber, luminanceBlended, kind, ruleId } | null
```

It never throws and caches every palette source — including failed builds — for the life of the
instance, so **construct one per open archive and keep it**, rather than one per preview.

Today `ArchivePreview.tsx:73-99` lists every `.pal` in the archive and defaults to `names[0]` —
the first palette in archive order, which is almost never right.

- `src/renderer/src/pages/ArchivePage.tsx` *(edit)* — `auxArchives` becomes the resolver's
  `ArchiveProvider`. It loads exactly one sibling today (`khanpal.dat`, lines 64-79); the rules
  also need `legend.dat` for `national.dat`, `misc.dat` and khan pants. A missing sibling stays
  non-fatal.
- `src/renderer/src/components/archive/ArchivePreview.tsx` *(edit)* — call the resolver on entry
  change and preselect the result. The `<Select>` becomes a manual override. Show the returned
  `ruleId` beside it, so the user can see which rule fired and report a wrong one.
- `src/renderer/src/utils/archiveRenderer.ts` *(edit)* — `renderEntry` accepts the resolved
  palette. The `.epf` branch stops returning null merely because the caller guessed nothing.

**Acceptance:** open `legend.dat`, `setoa.dat`, a `khan*.dat` and `roh.dat`. Sprites render in
correct colours with no user action. The dropdown still changes the palette. An entry with no
matching rule falls back to today's behaviour rather than showing nothing.

## WP2 — LFT glyph browser

**Size: S to M.** Depends on WP0 only. **No parser work — dalib-ts 3.0.0 ships `LftFile`.**

`da.lft` and `lod.lft` live in `national.dat` and are the client's active font. `classifyEntry`
in `archiveRenderer.ts:253-290` has no `.lft` case, so they fall through to `hex`.

dalib-ts gives you the decode and the text layer:

- `LftFile.fromEntry(entry)` → `nominalWidth`, `nominalHeight`, `glyphs[]`, `bitmapData`, plus
  `isValidKey`, `getGlyph`, `getAdvance`, `getGlyphPixels(key)`.
- Helpers `lftGlyphWidth`, `lftGlyphHeight`, `lftRowStride`.
- `Graphics`: `renderLftText`, `measureLftText`, `drawLftGlyph`, `lftGlyphKeys` (with a DBCS
  lead-byte path).

**That last group is worth more than the glyph grid.** A "type a string, see it rendered in the
client's real font, with real per-glyph metrics" box is a few lines on top of `renderLftText`, and
it is the thing that actually tells an author whether a label will fit.

- `src/renderer/src/utils/archiveRenderer.ts` *(edit)* — add `'lft'` to `PreviewType` and a
  `.lft` case to `classifyEntry`.
- `src/renderer/src/components/archive/LftPreview.tsx` *(new)* — header summary, a jump-to-key
  box, a glyph grid, and a sample-text field driven by `renderLftText`.
- `src/renderer/src/components/font/` *(move/edit)* — keep `FontGlyphGrid` and `FontPixelEditor`
  (read-only mode) and retarget them at LFT records. Delete the rest with WP3.

Two things this file makes non-obvious. (Bounds validation is no longer one of them — `LftFile`
owns it.)

1. **65,535 records at 3.4 MB per entry.** The grid must be virtualised or paged. Do not render
   every key. Most records have `bitmap_offset == 0` and draw nothing — filtering to populated
   glyphs is the useful default view. This is also the case the OOM rider below cares about: do
   not put the `LftFile` in a React prop.
2. **Keys are not Unicode.** `lft.md:155-159` is explicit: the index is the raw ANSI or DBCS byte
   value, and its meaning depends on the code page the client had selected. Label the browser by
   **key**, never by character name, and say which code page a key would be read under
   (`text.md:43-52` maps language mode → font entry → code page).
**Acceptance:** open `national.dat`, select `da.lft`, see the header, browse populated glyphs,
inspect one glyph's bitmap and metrics (`advance`, `left`, `top`, `right`, `bottom`), and render a
sample string. No hang.

## WP3 — Remove the FNT editor

**Size: S.** No dependency. Land early.

- `src/renderer/src/pages/FontEditorPage.tsx` *(delete)* — 363 lines.
- `src/renderer/src/components/font/{FontBlockView,AddGlyphDialog}.tsx`, `glyph.ts` *(delete)*.
  `FontGlyphGrid` and `FontPixelEditor` survive into WP2.
- `src/renderer/src/store/uiStore.ts` *(edit)* — drop `'fonteditor'` from `Page`.
- `src/renderer/src/components/{NavToolbar,PageRenderer}.tsx` *(edit)* — drop the nav button and
  the route arm.
- `src/renderer/src/components/archive/ArchivePreview.tsx`, `utils/archiveRenderer.ts` *(edit)* —
  drop the `'font'` preview type and its `FntFile` import.
- Tests referencing the page or the `.fnt` preview *(edit)*.

**CHANGELOG needs a `### Removed` entry that states why** — that the format is dormant in the 7.41
client, not that the feature was unpopular. A user who authored `.fnt` files with it deserves to
know they were never loaded.

## WP4 — Typed `.tbl` views

**Size: S.** No dependency.

`.tbl` files render as raw text unless they parse as a dye `ColorTable`
(`ArchivePreview.tsx:308-328`). dalib-ts already ships `PaletteTable`, `TileAnimationTable` and
`EffectTable` in the installed 2.2.0 — no bump needed.

- `src/renderer/src/components/archive/TblPreview.tsx` *(new)* — try each parser in turn and show
  the first that succeeds: palette table (id ranges → palette number, plus male/female overrides
  and cycling entries), tile animation table (id → tile sequence + interval), effect table
  (effect id → frame sequence). Fall back to the existing text view.

**Keep the existing guard.** `tryParseColorTable` exists because `ColorTable.parseText` allocates
`colorsPerEntry` objects per entry with no cap and no EOF stop — a 40 KB file can exhaust the heap.
Apply the same shape of check to each new parser: sniff the header, then parse.

Discriminating by name is a reasonable first pass (`*pal.tbl`, `gndani.tbl`/`stcani.tbl`,
`effect.tbl`), but sniff-and-try is what handles the archives that do not follow the convention.

**Acceptance:** `mptpal.tbl`, `gndani.tbl` and `effect.tbl` each render as a structured table.
`color0.tbl` still shows dye swatches. An unrecognised `.tbl` still shows text.

## WP5 — Adopt dalib `SotpFile` + `renderTile`

**Size: M.** Depends on WP0. **Plan already written:** `docs/plans/dalib-sotp-tile-adoption.md` —
Part A (`SotpFile` as the single SOTP source), Part B (`renderTile`/`renderHpf` for the legacy
decode), Part C (the seam for pack-carried SOTP, direction only). Execute it as written; do not
re-derive it here.

**Its "Precondition — dalib-ts next release" section is satisfied.** That release is 3.0.0 and it
is published. Read the plan with that resolved.

### Found during WP0 — `stcani.tbl` is being merged into the wall palette table

`mapRenderer.ts:142` builds the wall palette table with `PaletteTable.fromArchive('stc',
iaArchive)`. That pattern matches **every** `stc*.tbl` in `ia.dat`, and `PaletteTable.fromArchive`
routes each match by whether its name has a numeric identifier: numeric names become cycling
files, non-numeric names are **merged as palette mapping tables**.

`stcani.tbl` has no numeric identifier. It is the foreground *animation* table, and it is being
merged as if it were a palette table. Its lines are tile sequences, so `PaletteTable.parseText`
reads a 3-plus-token line as a **range entry** and runs
`for (i = min; i <= mid; i++) entries.set(i, third)` — assigning an arbitrary palette number to
every wall id in the animation sequence's numeric span, silently overriding `stcpal.tbl`.

Ground is unaffected: `fromArchive('mpt', seoArchive)` does not match `gndani.tbl`. **Only walls,
and only animated ones**, which is why it has gone unnoticed.

The fix is not a straight pattern swap. `fromArchive('stcpal')` drops the numeric `stc###.tbl`
cycling files, and `tileEligibility.ts` depends on those through `getCyclingEntries` /
`isPaletteCycled`. Build the palette mapping from `stcpal` and merge the cycling files separately,
or use the two-pattern form the way dalib's own resolver does.

**Left unfixed in WP0 deliberately** — it is pre-existing, unrelated to the bump, and fixing it
changes map rendering, which would contaminate WP0's verification. WP5 owns `mapRenderer.ts`;
it fixes this. Confirm against a real `ia.dat` before changing anything: the impact above is
derived from the parsers, not yet observed on screen.

### Risks in this WP

Two points that bear repeating:

- **The ground-tile appearance change is WP0's, not WP5's.** The plan attributes it to Part B, but
  the `renderTile` fix ships in 3.0.0 — ground tiles change the moment the dependency is bumped,
  whether or not `mapRenderer.ts` is touched. Confirm it during WP0. Part B then becomes what it
  should have been all along: **pure deduplication** of a local blit against the library.
- **`wallWalkability` must keep its out-of-range branch.** dalib returns 0 (passable) past the end
  of the table; the allocator needs `'unknown'`. Gate on `sotp.maxTileId`.

Note that commit `12c91b8` reads like this work but is docs-only. Nothing has been adopted yet.

## WP6 — `ambient_sounds` pack kind

**Size: S.** No dependency. Contract is the document repo's
`docs/plans/hybrasyl.client/ambient-audio-pipeline.md` §4.

Follow the four-step recipe in `packKinds/index.ts`:

1. `src/renderer/src/packKinds/ambientSounds.ts` *(new)* — model on `soundEffects.ts` (flat numeric
   namespace). Emit `amb_{id:D4}.{ext}`, ids auto-assigned from 1.
2. `src/renderer/src/packKinds/index.ts` *(edit)* — register in `PACK_KINDS`.
3. `src/renderer/src/packKinds/types.ts` *(edit)* — add to the `ContentType` union and
   `ALL_CONTENT_TYPES` (13 kinds today).
4. `src/main/schemas/pack.ts` *(edit)* — add to `contentTypeSchema`.

Per-entry metadata goes through the existing `assetMetaFields()` → `reduceCoversFromMeta()` →
`covers` pipeline. `itemIconsDye.ts` is the working precedent — the checkbox column and manifest
folding come free through `PackEditor`. **v1 carries one field, `Loop`.** Shape the covers blob so
the deferred interval fields need no schema bump:

```json
{ "1": { "loop": true } }
{ "1": { "mode": "interval", "play": 180, "silence": 120 } }
```

Manifest stays `schema_version: 1`. This `covers.ambient_sounds` shape **is** the contract the
client's `AmbientPack` reads — do not improvise it.

---

## Also fixed in this update

**Archive preview dev-only OOM.** `docs/plans/archive-preview-dev-oom.md` — `ArchivePreview` still
takes `DataArchive` as a React prop, and React 19.2's dev-build component performance track tries
to serialise it, climbing to ~4 GB. It does not affect the shipped build. **WP1 and WP2 edit that
component anyway**, so move the archive behind a ref or context while it is open.

## Non-goals (stop-lines)

- **No LFT writing.** Read-only, per Decision 2. If a writer is ever wanted, `lft.md:159` sets the
  bar: preserve all 65,535 records, recalculate every offset, keep the 4-byte row alignment, and
  round-trip every mask before calling it compatible.
- **No palette rule layer in Taliesin.** It lives in dalib-ts. A rule that fires wrongly is a
  dalib-ts fix and a correction to the document repo's spec.
- **No pack-carried SOTP authoring.** WP5 Part C records the seam and stops there.
- **No ambient interval scheduling.** Deferred in the pipeline doc; v1 is the loop flag.
- **No other new pack kinds.** `effects`, `projectiles`, `display_sprites`, `aisling_body`,
  `bundle`, `fonts`, `cutscenes` and `skeletal_animations` are scoped in the document repo with no
  Taliesin kind. They are the candidates for the release after this one, not scope creep for this
  one.

## Verification

Gate for every WP: `npm run typecheck && npm run lint:check && npm run test:coverage &&
npm run build`.

Tests to add or change:

- WP1 — resolver wiring against a fixture archive; assert the preselected palette and that a
  manual change still overrides it.
- WP2 — the preview component against a small synthetic `LftFile`: populated glyph, empty glyph,
  and a measured sample string. **Do not re-test the parser** — dalib-ts owns and covers it.
- WP4 — one fixture per table type, plus the existing dye-table guard cases.
- WP5 — the existing SOTP unit tests move from raw `Uint8Array` to `SotpFile`. **Assert identical
  passable/blocking/unknown results**, so the refactor is proven behaviour-preserving.
- WP6 — kind registration and `covers` folding, modelled on the `itemIconsDye` tests.

Hand to the user in `npm run dev` (none of these can be verified headless). **The first five are
WP0** — the bump changes pixels in five places, and only eyes can confirm them:

1. **Archive tileset preview** (`tilea.bmp` in `seo.dat`): tiles are opaque diamonds with no holes
   and no garbage padding. The map editor is expected to still look different — that gap is WP5's.
2. **SPF sprite previews sit where they should** now that `left`/`top`/`pitch` are honoured.
3. **UI Layout Forge prefab import** still produces the right frames after the `ControlFile`
   `<IMAGE>` ordering fix.
4. **The darkness preview** (`.hea`) after the `& 0x3F` intensity mask.
5. **A map still loads** after the `MapFile` unsigned-id and trailing-bytes change, and tile
   palettes still resolve after `PaletteTable` comment stripping.
6. `da.lft` in `national.dat` browses without hanging, and a sample string renders (WP2).
7. Sprites in `legend.dat`, `setoa.dat`, `khan*.dat` and `roh.dat` render correctly with no palette
   picking (WP1).
8. An `ambient_sounds` pack compiles and its `covers` blob matches the shape above (WP6).
