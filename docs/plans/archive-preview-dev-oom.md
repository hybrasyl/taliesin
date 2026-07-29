# Archive preview: dev-only OOM when the DataArchive is passed as a prop

> **Status: fixed app-wide (2026-07-29), two layers.**
>
> 1. **`src/renderer/src/devPerfTrack.ts` turns the track off.** React
>    feature-detects it once at module scope via `console.timeStamp`; removing
>    that hook before `react-dom` evaluates makes every call site a no-op. This
>    is the layer that fixes the whole app, because **the Archive page was not
>    the only site** — `MapAssets` (all of `TILEA.BMP` plus the `ia.dat` archive)
>    reaches `StaticTileManagerPage` and `ThemeEditorDialog`, `fileBuffer`
>    reaches the map canvases, and `mapFile` changes identity on every Map Maker
>    stroke. A bare `Uint8Array` prop cannot be shielded any other way: its
>    indices are exotic own enumerable properties. Re-enable with
>    `VITE_REACT_PERF_TRACK=1` to profile, and expect the old symptoms.
> 2. **`src/renderer/src/store/archiveStore.ts` keeps the worst object out of
>    props structurally**, so the Archive page survives even with the track
>    switched back on. `ArchivePreview` and `ArchiveEntryList` take an **index**
>    into `archive.entries`, never the entry or archive object.
>
> Layer 1 is a feature-detect that React could change; layer 2 does not depend on
> React's behaviour at all. That is why both exist. See "What actually explodes"
> below — the mechanism is more specific than this plan first assumed, and the
> trigger is switching archives, not previewing a `.tbl`.

## What actually explodes

Read `addObjectDiffToProperties` and `addValueToProperties` in
`node_modules/react-dom/cjs/react-dom-client.development.js` (~lines 3789-4095).
Three facts decide everything:

1. The diff runs **only for props whose identity changed**. An identity-stable
   prop is skipped no matter how large it is. This is why previewing entries
   within one archive was survivable and **switching archives was not**.
2. Recursion is capped at depth 3 — but **breadth is not capped**.
3. Enumeration is `for (var key in object)` with a `hasOwnProperty` guard. A
   `Uint8Array` has own enumerable index properties, so **every byte becomes a
   row**.

The fatal path was `ArchiveEntryList`'s `selected` prop, because that component
stays mounted across archive switches. When `selected` goes from an entry to
`null`, the object-to-object branch does not apply, so React calls
`addValueToProperties(REMOVED, oldEntry, indent 0)`, which walks
`entry → archive → buffer` and enumerates the whole `.dat` at indent 3. For
`ia.dat` that is tens of millions of rows.

`entry` is therefore exactly as dangerous as `archive`; it just reaches the
buffer one level deeper. The rule is: **no `DataArchive` and no
`DataArchiveEntry` in any prop.**

Sub-components *inside* `ArchivePreview.tsx` still receive `entry`/`archive`
objects. That is safe for a stated reason: `ArchivePage` clears the selection
before storing a new archive, so the whole preview subtree unmounts on an
archive switch, and a mount has no previous props to diff. While mounted, the
archive is identity-stable, so entry-to-entry diffs stop at the equal
`entry.archive` reference.

## Context

Previewing archive entries in `npm run dev` (e.g. selecting `stc0006.tbl` or any
`.tbl` in `ia.dat`) hangs and then crashes the renderer with:

```text
Uncaught DataCloneError: Failed to execute 'measure' on 'Performance':
Data cannot be cloned, out of memory.
    at logComponentRender (react-dom_client.js …)
    at commitPassiveMountOnFiber …
```

The heap climbs to ~4 GB and V8 dies (`Ineffective mark-compacts near heap limit`).

**This does not affect the shipped app.** `logComponentRender` is part of React
19.2's **development-build "component performance track"** (it emits a
`performance.measure` per commit for the DevTools Performance panel). It is
compiled out of the production build — confirmed: a local `npm run build:unpack`
build previews the exact same `.tbl` files "smooth as butter". It also reproduces
with React DevTools closed, because the instrumentation lives in the dev
`react-dom`, not the extension. React 18 (an older Taliesin) didn't have this
track, which is why older versions were fine.

### Why it happens

`ArchivePage` passes the whole `DataArchive` to `<ArchivePreview archive={archive} …>`
(and down to each preview). For `ia.dat` that object is **23,875 entries and
circular** — every `DataArchiveEntry.archive` points back to the archive, which
holds all entries plus the full raw `.dat` buffer. React 19.2's dev render track
walks/serialises component props (`fiber.memoizedProps`) to build its measure
`detail`; on this massive self-referential graph that work explodes the heap.
The entry contents are irrelevant (an 11-byte `.tbl` triggers it) — the cost is
in the `archive` prop, not the file.

Not the cause (ruled out): the `.tbl`/`ColorTable` parsing (parses in 0 ms), the
recent MUI v9 upgrade, or a render loop (production has no loop and is smooth).

## Goal

Make `npm run dev` usable for archive previews again by keeping the large,
circular `DataArchive` out of the props React's dev instrumentation serialises —
without changing preview behaviour.

## Approach

Stop threading the `DataArchive` (and `auxArchives`) through component props.
Instead:

- In `src/renderer/src/pages/ArchivePage.tsx`, hold the open archive + aux
  archives in a **React context** (or a `useRef` + a tiny context) — e.g.
  `ArchiveContext` exposing `{ archive, auxArchives }`.
- Pass `ArchivePreview` only lightweight, stable props: the selected
  `entryName` (string) — or an index — instead of the `DataArchiveEntry`/archive
  objects. Resolve the actual `entry`/`archive` inside the preview via the
  context + `archive.get(entryName)`.
- The preview sub-components (`SpritePreview`, `TextPreview`, `TilesetPreview`,
  …) read `archive`/`auxArchives` from context rather than props. Their
  `memoizedProps` then contain only primitives, so React's dev track has nothing
  huge/circular to serialise.

Critical files:

- `src/renderer/src/pages/ArchivePage.tsx` — provide the context; pass a string key.
- `src/renderer/src/components/archive/ArchivePreview.tsx` — consume context;
  change `Props` from `{ entry, archive, auxArchives }` to `{ entryName }` (or
  keep `entry` but drop `archive`/`auxArchives` from props — `entry` alone is
  small, but note it still back-references the archive, so prefer passing the
  string key and resolving `entry` from context too).
- `src/renderer/src/components/archive/ArchiveEntryList.tsx` — unaffected
  (already keyed by entry); confirm `onSelect` can hand back a string key.

### Alternative / smaller mitigations (fallbacks, not preferred)

- Wrap the archive in a non-enumerable holder (`{ current: archive }` via ref)
  so a shallow prop walk can't recurse — brittle vs. React internals.
- Globally disable React's component performance track in dev — no supported
  public flag; not worth a monkeypatch.

The context refactor is the clean, durable fix and also removes needless prop
churn.

## Verification

- `npm run dev`, open `ia.dat`, select `stc0006.tbl`, `stspal.tbl`, and a few
  sprites — all preview without the heap climbing (watch the renderer's memory in
  DevTools; it should stay flat).
- `npm test` — existing `ArchivePreview.test.tsx` still passes (update the mock
  to provide the context wrapper).
- `npm run build:unpack` still previews fine (regression guard for production).

## Notes

- Keep the `.tbl` parse hardening already added to `ArchivePreview.tsx`
  (`tryParseColorTable` header sanity check, 256 KB text cap, 512-row swatch cap).
  It guards a genuinely malformed/hostile dye-table header from OOMing the parser
  — a separate, real risk — even though it was not this crash.
- Companion upstream cleanup lives in `dalib-ts/docs/plans/dalib-ts-followups.md`
  (clamp `ColorTable.parseText`'s `colorsPerEntry`, break at EOF).
