# WP4 — Typed `.tbl` views

**Size: S. ✅ Shipped 2026-08-01.**

**Depends on:** nothing. Read `../00-overview.md` first.

## What shipped, against this plan

Four typed views, not three: **palette cycling tables** (`mpt001.tbl`, `stc0006.tbl`) were not in
the file map but are a distinct format that this WP would otherwise have shown as a palette mapping
table, because the two are the same three-integer grammar. Only the entry name separates them.

Two corrections the build found:

1. **Identify by name first, structure second — and never test for a dye table first.** The plan
   said "try each parser in turn and show the first that succeeds". That does not work: three of the
   formats are whitespace-separated integers, so `1 5 2` parses cleanly as a palette range, a
   cycling entry and an animation sequence alike. Identification is therefore a ladder — entry name,
   then line shape — and the rule that fired is shown to the user, as WP1 does for palettes.
   Ordering also bit the dye table: a short `effect.tbl` opens with a low count line, which is
   exactly what `tryParseColorTable`'s header sniff accepts, so checking for a dye table up front
   misread every small effect table as one. A dye table now reaches the text view by the typed
   reader **declining** it, which it always will — `r,g,b` lines are not whitespace-separated
   integers.
2. **`PaletteTable` carries the same class of allocation hazard as `ColorTable`.** `parseText`
   expands `min max palette` into one map entry per id with no cap, so a single malformed line
   (`1 999999999 5`) exhausts the heap. The guard counts the ids a file would expand to **before**
   the buffer reaches the parser, capped at `MAX_PALETTE_IDS`.

`dalib-ts` keeps the id maps of `PaletteTable` and the entry map of `TileAnimationTable` private, so
display rows are read back from each class's own `toText()` rather than from a second parse of the
file. `EffectTable` enumerates properly via `count` + `tryGetEntry`. `PaletteTable.parseCyclingText`
is private with no single-entry entry point, so the three-integer cycling grammar is reproduced in
`tblTables.ts` — recorded as a dalib-ts follow-up in `../00a-backlog.md`.

Files: `src/renderer/src/utils/tblTables.ts` (new, the reader),
`src/renderer/src/components/archive/TblPreview.tsx` (new, the view),
`src/renderer/src/components/archive/TextPreview.tsx` (new — extracted whole from
`ArchivePreview.tsx` so the fallback import does not cycle), plus the `'tbl'` `PreviewType`.

---

_Original plan follows._

## Goal

`.tbl` files render as raw text unless they parse as a dye `ColorTable`. dalib-ts already ships parsers for the other three table types, so the Archive Viewer can name what it is looking at instead of showing a wall of numbers.

## New dependency

None. `PaletteTable`, `TileAnimationTable` and `EffectTable` shipped in dalib-ts 2.2.0, and Taliesin is on ^3.1.0.

## File map

- `src/renderer/src/components/archive/TblPreview.tsx` _(new)_ — try each parser in turn and show the first that succeeds:
  - **palette table** — id ranges → palette number, plus male/female overrides and cycling entries,
  - **tile animation table** — id → tile sequence + interval,
  - **effect table** — effect id → frame sequence,
  - falling back to the existing text view.
- `src/renderer/src/components/archive/ArchivePreview.tsx` _(edit)_ — route `.tbl` entries through it.

Discriminating by name is a reasonable first pass (`*pal.tbl`, `gndani.tbl`/`stcani.tbl`, `effect.tbl`), but sniff-and-try is what handles the archives that do not follow the convention.

## Keep the existing guard

`tryParseColorTable` exists because `ColorTable.parseText` allocates `colorsPerEntry` objects per entry with no cap and no EOF stop — **a 40 KB file can exhaust the heap.** Apply the same shape of check to each new parser: sniff the header, then parse. Do not remove the existing guard on the way past it.

## Non-goals (stop-lines)

- **No editing.** These views are read-only. Authoring a `.tbl` is not in this milestone.

## Tests

One fixture per table type, plus the existing dye-table guard cases.

## Acceptance criteria

1. `mptpal.tbl`, `gndani.tbl` and `effect.tbl` each render as a structured table.
2. `color0.tbl` still shows dye swatches.
3. An unrecognised `.tbl` still shows text.
4. A malformed or oversized `.tbl` is refused by the sniff rather than exhausting the heap.
5. All checks green.
