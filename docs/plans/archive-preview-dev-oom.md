# Archive preview: dev-only OOM when the DataArchive is passed as a prop

## Context

Previewing archive entries in `npm run dev` (e.g. selecting `stc0006.tbl` or any
`.tbl` in `ia.dat`) hangs and then crashes the renderer with:

```
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
