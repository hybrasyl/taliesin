# Taliesin — work package index

**Read this before any WP.**

Taliesin is the Dark Ages asset viewer and authoring tool, companion to Creidhne. It reads legacy DA archives (`.dat`/`.pak`) and authors `.datf` asset packs for the Brigid client.

## Authoritative references

- **Repo conventions, stack, commands** — `../../CLAUDE.md` in this repo.
- **House working practices** (git, commits, verify-before-commit, PR prep, security posture) — the document repo's `docs/architecture/dev-practices.md`.
- **Electron stack and architecture standard** — the document repo's `docs/architecture/electron-app-skeleton.md`.
- **This layout** — the document repo's `docs/architecture/design-docs.md` (Tier 2), tracked as R-007 in its `docs/architecture/ecosystem-rollout-checklist.md`.
- **`.datf` asset-pack format**, the authoritative `content_type` registry — the document repo's `docs/plans/hybrasyl.client/asset-pack-format.md`.
- **Primary reuse source** — Creidhne, then the wider Electron sibling set (dagda, epona, mabon, oghma, elatha). Port a proven idiom before inventing one.

Taliesin has no Tier-1 design doc of its own; it predates the tier system. The nearest thing is the document repo's `docs/plans/taliesin/audio-pack-authoring.md`, which covers one feature area rather than the app.

## Conventions

- **`NN-slug.md`** is one work package, `NN` zero-padded. Numbers are stable IDs, not build order, and may have gaps.
- **One WP = one branch = one PR.** If two items would sensibly share a branch they are one WP; if a WP needs several PRs it is several WPs.
- **Milestones live here and never get a WP number.**
- **`00a-backlog.md`** is the deferral register — work owed to another repo, work parked behind a trigger, and non-goals. Not a WP.
- **`complete/`** holds shipped WP docs. It also holds thirteen unnumbered docs that predate this system; they are kept as a record, not converted.
- Gate for every WP: `npm run typecheck && npm run lint:check && npm run test:coverage && npm run build`. `npm run dev` and `npm run e2e` need a GUI and are handed to the user.

## Settled decisions (do not relitigate)

1. **The FNT editor is deleted, not replaced in kind** (Sabrael, 2026-07-28). The `eng%02d.fnt` / `han%02d.fnt` loaders have no callers in the 7.41 client. LFT is the live format. See `complete/03-remove-fnt-editor.md`.
2. **LFT is read-only in Taliesin** (Sabrael, 2026-07-28). The client contains no confirmed LFT writer.
3. **The palette dropdown stays** (Sabrael, 2026-07-28). Auto-resolution seeds it; manual override keeps working.
4. **Palette rules live in dalib-ts, not here** (Sabrael, 2026-07-28). A rule that fires wrongly is a dalib-ts fix plus a correction to the document repo's spec.
5. **Custom SOTP travels inside the `static_tiles` pack** (Sabrael, 2026-07-23), superseding the separate `tile_collision` content-type design.

## Milestone — palette resolution, LFT fonts, SOTP adoption, ambient packs

**Baseline 2.8.0. Scope agreed 2026-07-28. Five of seven WPs shipped.**

Taliesin used to show a legacy sprite in the wrong colours until the user guessed a palette, show the client's real font as a hex dump, and ship an editor for a font format the client stopped calling. This milestone makes the Archive Viewer tell the truth about what is in a `.dat`, and retires the part that lies. Five of the seven WPs are read/decode work on legacy client formats; one adds a pack kind.

### Dependency spine

The milestone was written against dalib-ts 2.2.0 and gated three WPs on a release. **That gate is gone** — Taliesin is on `^3.1.0`, so nothing in the milestone is blocked on a dependency.

| Needs                                                                          | Ships in | State     |
| ------------------------------------------------------------------------------ | -------- | --------- |
| `LftFile` + `renderLftText`/`measureLftText`/`drawLftGlyph`/`lftGlyphKeys`     | 3.0.0    | installed |
| `SotpFile`, `Tile`, the `renderTile` ground fix, `renderPalettized` `colorKey` | 3.0.0    | installed |
| `PaletteResolver`, `matchPaletteRule`, `PaletteLookup.getResolvedPaletteForId` | 3.1.0    | installed |

### Work packages

| WP  | Title                                                                                 | Size | Depends on | State                 |
| --- | ------------------------------------------------------------------------------------- | ---- | ---------- | --------------------- |
| WP0 | [Bump dalib-ts 2.2.0 → 3.0.0](complete/00-dalib-ts-3-bump.md)                         | S–M  | —          | ✅ shipped            |
| WP1 | [Auto-resolve palettes in the Archive Viewer](complete/01-palette-auto-resolution.md) | S    | WP0        | ✅ shipped 2026-07-31 |
| WP2 | [LFT glyph browser](complete/02-lft-glyph-browser.md)                                 | M    | WP0        | ✅ shipped            |
| WP3 | [Remove the FNT editor](complete/03-remove-fnt-editor.md)                             | S    | —          | ✅ shipped (PR #25)   |
| WP4 | [Typed `.tbl` views](complete/04-typed-tbl-views.md)                                  | S    | —          | ✅ shipped            |
| WP5 | [Adopt dalib `SotpFile` + `renderTile`](05-sotp-tile-adoption.md)                     | M    | WP0        | planned               |
| WP6 | [`ambient_sounds` pack kind](06-ambient-sounds-pack-kind.md)                          | S    | —          | planned               |

WP5 and WP6 are independent of each other and can land in either order. WP2 and WP4 shipped together, ahead of them, on 2026-08-01.

### What the build learned that the plan could not have

- **WP3 deleted more than its plan scoped, and WP2 pays for it.** The milestone said `FontGlyphGrid` and `FontPixelEditor` would "survive into WP2" and be retargeted at LFT records. WP3 removed `src/renderer/src/components/font/` in full. WP2's glyph grid and glyph inspector are therefore new components, and its size moved from S–M to M. Verified against `main` on 2026-08-01.
- **The ground-tile appearance change belongs to WP0, not WP5.** The `renderTile` diamond/index-0 fix ships in dalib-ts 3.0.0, so ground tiles changed on the bump, whether or not `mapRenderer.ts` was touched. WP5 Part B is therefore pure deduplication, not a visual change.
- **WP0 found a live defect it deliberately did not fix.** `stcani.tbl` is being merged into the wall palette table by `PaletteTable.fromArchive('stc', …)`, silently overriding `stcpal.tbl` for animated walls. Fixing it changes map rendering, which would have contaminated WP0's verification. WP5 owns `mapRenderer.ts` and owns the fix.
- **The archive-preview dev-only OOM was fixed app-wide, not just in the Archive page.** The milestone listed it as a rider on WP1 and WP2. It shipped 2026-07-29 as two independent layers — see `complete/archive-preview-dev-oom.md`.
- **"Keep the `LftFile` out of props" needed a mechanism, not just a rule.** WP2's grid and inspector are separate files and both need the font, so a prop is the ordinary way to pass it. A context (`lftFontContext.ts`) carries it instead and the children take only primitives — the same shape `archiveStore.ts` uses for the `DataArchive`, for the same reason. Filtering to populated glyphs first also made virtualisation unnecessary: a few hundred glyphs page cleanly at 256 a time.
- **"Try each parser in turn" cannot identify a `.tbl`, and WP4 found a fourth format.** Three of the table formats are whitespace-separated integers, so the same line parses cleanly as all three; identification has to lead with the entry name and fall back to line shape, naming the rule it used. WP4 also added a **palette cycling** view its own file map did not list. The dye-table check had to move _after_ the typed reader, not before it — see `complete/04-typed-tbl-views.md`.
- **`PaletteTable` has the same unbounded-allocation hazard `ColorTable` has.** `parseText` expands a `min max palette` line into one map entry per id with no cap, so `1 999999999 5` exhausts the heap. WP4 guards it the same way, by counting the expansion before the parser sees the bytes.

### Milestone verification

Most of this milestone changes pixels rather than return codes, so a green suite is necessary but not sufficient. The hand-to-user list in `npm run dev`:

1. `da.lft` in `national.dat` browses without hanging, and a sample string renders (WP2).
2. `mptpal.tbl`, `gndani.tbl`, `effect.tbl` and a numbered cycling file such as `stc0006.tbl` render as structured tables, and `color0.tbl` still shows dye swatches (WP4).
3. Ground tiles in the Map Maker match the archive tileset preview; walls and the passability overlay are unchanged (WP5).
4. An `ambient_sounds` pack compiles and its `covers` blob matches the contract (WP6).

The WP0 and WP1 items on this list are done; they are recorded in those WPs' own acceptance criteria.
