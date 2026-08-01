# Plan — Complete IPC path-traversal hardening (Category-A handlers)

## Goal

Close out the second half of follow-up #3 from
[`test-followup-fixes.md`](../completed/test-followup-fixes.md). Reject any
renderer-supplied absolute path that doesn't fall inside one of the
known session roots (active library, active pack, music library,
settings dir).

## Context

The first half (Category-B handlers) landed on
`chore/test-followup-fixes`. Those handlers compose a child path from
a known parent dir + a renderer-supplied filename component, and now
guard with [`assertInside`](../../src/main/pathSafety.ts).

Category-A handlers are the remaining surface. They take a full
absolute path with no implicit parent, and currently trust the
renderer:

- `fs:readFile`, `fs:listDir`, `fs:writeFile`, `fs:writeBytes`,
  `fs:exists`, `fs:ensureDir`, `fs:deleteFile`, `fs:listArchive`,
  `fs:copyFile`
- `pack:scan`, `pack:load`, `pack:save`, `pack:delete`, `pack:compile`
- `palette:scan`, `palette:load`, `palette:save`, `palette:delete`,
  `frame:scan`
- `catalog:load`, `catalog:save`, `catalog:scan`
- `index:read`, `index:build`, `index:status`, `index:delete`,
  `library:resolve`
- `music:scan`, `music:client:scan`, `music:metadata:load`,
  `music:metadata:save`, `music:packs:load`, `music:packs:save`,
  `music:readFileMeta`
- `sfx:list`, `sfx:readEntry`, `sfx:index:load`, `sfx:index:save`
- `prefab:list`
- `app:launchCompanion` — **special**, see Risks

A trusted renderer makes this defensive prep, not active threat
mitigation. Worth doing as defence in depth and as forcing function
for cleaning up the trust boundary.

## Shared infrastructure (also needed by `ipc-handler-schemas.md`)

Both this plan and the schemas plan need the same building block: a
notion of "currently allowed roots" tracked in `HandlerContext` and
kept in sync with the renderer.

**Where it lives.** Add to `HandlerContext`:

```ts
export interface HandlerContext {
  // ...existing fields...
  /** Roots the renderer has been authorised to access this session. */
  roots: Set<string>
}
```

The set is mutable. Roots are added when a dialog returns a path
(implicit one-shot bless) AND when settings load surfaces an active
library/pack.

**Channels.**

- `session:setActiveLibrary(path)` — renderer calls when the active
  library changes (or main reads from settingsManager and pushes).
- `session:setActivePack(path)` — same shape for the active asset pack.
- Modify existing dialog handlers (`dialog:openFile`,
  `dialog:openDirectory`) to add their result to `ctx.roots` before
  returning. This bridges the OS-trust gap for paths the user picked.

**Helper.** Extend `pathSafety.ts`:

```ts
export function assertInsideAnyRoot(roots: Iterable<string>, candidate: string): string {
  for (const root of roots) {
    try {
      return assertInside(root, candidate)
    } catch {
      /* try next */
    }
  }
  throw new Error(`Path "${candidate}" is not inside any allowed root`)
}
```

## Phases

### Phase 1 — Active-roots infrastructure

- Extend `HandlerContext` with `roots: Set<string>`.
- Add `assertInsideAnyRoot` to `pathSafety.ts` + unit tests.
- Modify `dialog:openFile` and `dialog:openDirectory` to add results
  to `ctx.roots`.
- Add `session:setActiveLibrary` / `session:setActivePack` channels.
- On startup, hydrate `ctx.roots` from `settingsManager.load()`
  (active library path, asset-pack dir, music library, etc.).
- Always include `ctx.settingsPath` and resource roots that ship with
  the app.

**Exit:** `ctx.roots` contains the right set throughout a typical
session. Roots-management has its own unit tests. No handlers wired
yet.

### Phase 2 — Wire Category-A handlers

For each handler taking a path argument, replace the bare path use
with `assertInsideAnyRoot(ctx.roots, path)`:

```ts
export async function readFile(ctx: HandlerContext, filePath: string) {
  return fs.readFile(assertInsideAnyRoot(ctx.roots, filePath))
}
```

Existing handlers will need their signatures updated to take `ctx`.
That's a fan-out edit — register sites in `registerHandlers` need
plumbing for the closure capture.

**Exit:** every handler in the Context list above validates its path
arg. IPC tests still green (existing tests pass paths the test fixture
seeds into `ctx.roots`).

### Phase 3 — Tests

- Add a traversal-rejection test per Category-A handler. Pattern from
  Category-B: invoke with a path outside `ctx.roots` and expect
  `Path` rejection.
- Add positive tests confirming `dialog:openFile` results work in the
  next handler call (the implicit-bless mechanism).

**Exit:** every Category-A handler has at least one rejection test;
positive flow through dialog → fs:readFile is covered.

## Risks

### `dialog:openFile` results need to "bless" their paths

The renderer is supposed to call `fs:readFile(path)` after a dialog
returns. If the file is outside any pre-existing root, the read
fails. Two options:

1. **One-shot bless on dialog result** (recommended). Each dialog
   handler adds its result to `ctx.roots` before returning. The path
   stays valid for the rest of the session.
2. **Session token.** Dialog returns a `{ path, token }` and the
   renderer passes the token to subsequent handlers. More plumbing,
   stronger isolation.

Go with (1). Simple, matches user mental model ("I picked it, of
course I can read it"), and dialogs are user-initiated so a
compromised renderer can't forge them.

### `app:launchCompanion`

Different concern — this is `spawn(exePath)`, not file read. The
threat model is "renderer launches a malicious binary", not "renderer
escapes the sandbox". `assertInsideAnyRoot` doesn't apply. Either:

- Whitelist a single configured companion-exe path in settings and
  refuse anything else. Best.
- Skip — current trust model assumes the renderer hasn't been
  compromised. Document the gap.

### Performance

Each handler call now does up to N string comparisons (one per root,
typically 4–6 roots). Negligible. No measurement needed.

### Test fixture path normalisation

`assertInside` uses `normalize`+`join` to avoid pulling in `cwd`. Test
fixtures are POSIX-style; production paths are Windows-style. The
helper handles both. New tests should mirror the existing pattern in
[`pathSafety.test.ts`](../../src/main/__tests__/pathSafety.test.ts).

## Exit criteria

- Every Category-A handler validates its path argument against
  `ctx.roots`.
- Dialog results auto-bless and the next handler call works without
  extra plumbing.
- Traversal-rejection tests exist for every Category-A handler.
- `test-followup-fixes.md` entry #3 changes from PARTIAL to FIXED.
- Nothing in the renderer broke (manual smoke: open archive, edit
  map, deploy music pack — all flows still work).

## Sequencing

Independent of the schemas plan, but they both rely on the
**Shared infrastructure** section above. If you do this first, the
schemas plan inherits `ctx.roots` and adds a `z.string().refine(p =>
isInsideAnyRoot(ctx.roots, p))` shape on top. If you do schemas
first, this plan can drop the helper and just use the zod refinement.

**Cheaper path:** bundle them — see Sequencing in the schemas plan.

## Effort estimate

- Phase 1: ~half a day (infrastructure + helper + tests).
- Phase 2: ~half a day (mechanical fan-out across ~20 handlers).
- Phase 3: ~half a day (one rejection test per handler).
- Total: ~1.5 days, single-track.
