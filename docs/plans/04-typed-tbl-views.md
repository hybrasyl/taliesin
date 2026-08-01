# WP4 — Typed `.tbl` views

**Size: S.** **Not started.**

**Depends on:** nothing. Read `00-overview.md` first.

## Goal

`.tbl` files render as raw text unless they parse as a dye `ColorTable`. dalib-ts already ships parsers for the other three table types, so the Archive Viewer can name what it is looking at instead of showing a wall of numbers.

## New dependency

None. `PaletteTable`, `TileAnimationTable` and `EffectTable` shipped in dalib-ts 2.2.0, and Taliesin is on ^3.1.0.

## File map

- `src/renderer/src/components/archive/TblPreview.tsx` *(new)* — try each parser in turn and show the first that succeeds:
  - **palette table** — id ranges → palette number, plus male/female overrides and cycling entries,
  - **tile animation table** — id → tile sequence + interval,
  - **effect table** — effect id → frame sequence,
  - falling back to the existing text view.
- `src/renderer/src/components/archive/ArchivePreview.tsx` *(edit)* — route `.tbl` entries through it.

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
