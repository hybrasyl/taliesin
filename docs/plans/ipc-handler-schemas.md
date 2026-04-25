# Plan — Schema validation across the IPC surface

## Goal

Close out follow-up #4 from
[`test-followup-fixes.md`](../test-followup-fixes.md). Every
`ipcMain.handle` callback that receives a non-string payload validates
that payload against a schema and rejects malformed input, instead of
trusting the renderer to send well-formed data.

## Context

Today, every handler that takes a complex argument types it as
`unknown` and trusts the structure:

```ts
export async function settingsSave(ctx: HandlerContext, settings: unknown) {
  return ctx.settingsManager.save(settings as ...)  // <-- cast, no validation
}
```

A renderer bug, a corrupted state, or (in a future feature) external
input could send malformed JSON. The handler writes it to disk
unchallenged. Later loads then crash, corrupt user files, or silently
return garbage.

Affected payload types (rough inventory):

- `Settings` — `settingsManager`
- `Pack`, `PackData` — `data/packData.ts`
- `Palette`, `PaletteEntry`, `CalibrationFile` —
  `renderer/src/utils/paletteTypes.ts`
- `Prefab` — `data/prefabData.ts`
- `Theme` — `renderer/src/data/themeData.ts`
- `MusicMeta`, `MusicPack`, `MusicTrack` — `data/musicData.ts`
- `MapData`, `WorldMapData` — `data/mapData.ts`,
  `data/worldMapData.ts` (XML-derived; only need IPC schemas if they
  flow data→IPC)

## Shared infrastructure (also needed by `ipc-handler-roots.md`)

Both plans depend on the same `ctx.roots` infrastructure described in
[`ipc-handler-roots.md`](./ipc-handler-roots.md) (§Shared
infrastructure). For the schemas plan, the roots set lets a path-typed
schema field include a `.refine()` that the path is inside an allowed
root — co-locating shape validation and authorisation in one schema.

## Library choice

**Recommend zod 3.x.** Mature, widely understood, type inference is
the gold standard, schema-as-source-of-truth pattern is well-trodden.
Bundle size is non-trivial (~50KB min+gzip) but main-process bundle
size doesn't matter and the renderer can use the same schemas via the
shared `data/` files.

Alternatives:

- **valibot** — ~5x smaller, modular, similar API. Fine if bundle
  size matters in renderer. Less ecosystem.
- **arktype** — fast, TS-native syntax. Newer, less ecosystem.
- **effect/schema** — overkill for an IPC validation layer.

Pick zod unless there's a renderer bundle-size constraint that
demands valibot.

## Phases

### Phase 1 — Add zod, define schemas

- `npm install zod`.
- For each payload type, write a schema that mirrors the TS
  interface. Co-locate with the type definition:

  ```ts
  // src/data/packData.ts
  import { z } from 'zod'

  export const packSchema = z.object({
    id: z.string(),
    name: z.string(),
    contentType: z.enum(['skill', 'spell', /* ... */]),
    assets: z.array(z.object({ /* ... */ })),
    // ...
  })
  export type Pack = z.infer<typeof packSchema>  // replace existing interface
  ```

- Use `z.infer<>` to derive TS types from schemas — single source of
  truth. Existing interfaces become aliases or get replaced.
- Tests: `pack.schema.test.ts` etc. Happy path + a few rejection
  cases per schema (missing field, wrong type, extra field if strict
  mode).

**Exit:** every payload type has a zod schema with tests; TS types
are derived from schemas; nothing wired into IPC handlers yet.

### Phase 2 — Wire schemas into handlers

For every handler taking a non-string complex payload, parse at the
boundary:

```ts
import { packSchema } from '../data/packData'

export async function packSave(filePath: string, data: unknown) {
  const parsed = packSchema.parse(data)  // throws ZodError on invalid
  await fs.writeFile(filePath, JSON.stringify(parsed, null, 2), 'utf-8')
}
```

Use `.parse()` (throws on invalid) for handlers where rejection is
the right answer. Use `.safeParse()` if you need to log + continue.

For handlers with mixed args (`packSave(filePath, data)`), keep the
path arg as a separate `string` and only schema-parse the payload.

**Exit:** every IPC handler that takes a non-string arg parses
through a schema. Existing happy-path tests still pass (they send
well-formed data).

### Phase 3 — Path-aware schema refinement

Combine with `ctx.roots` from the roots plan. A path field that
should be a session-allowed root gets a refinement:

```ts
// schema factory bound to a context
export const fileReadArgsSchema = (roots: Set<string>) => z.object({
  path: z.string().refine(p => isInsideAnyRoot(roots, p), {
    message: 'Path is not inside an allowed root',
  }),
})
```

This collapses #3 (path-traversal) and #4 (schema validation) at the
call site — one parse step does both.

**Exit:** path-typed schema fields enforce both shape and
authorisation. Path-traversal tests from #3 still pass.

### Phase 4 — Reject + log on schema failure

By default, zod throws `ZodError` with structured details. Decide:

- **Reject** (default): the renderer sees the error, surfaces a
  toast.
- **Reject + log**: write the parse failure to a log channel so the
  user can ask for support without reproducing the issue.
- **Reject + telemetry**: more invasive; defer.

Recommended: reject + log to a single `ipc-validation.log` under
`ctx.settingsPath`. Append-only, rotate on size cap.

**Exit:** schema failures land in the log; users have a breadcrumb to
include in bug reports.

## Risks

### Renderer–main schema drift

If the renderer constructs payloads that don't match the schema, you
get rejections at the IPC boundary that were previously silent. This
will surface real bugs — that's the point. But you'll need to fix
them all to ship.

**Mitigation:** put the schemas in `src/data/` (shared), import on
both sides, parse on the renderer too before sending. Then the same
shape error fails on the renderer first with a better stack trace.

### Existing data on disk that doesn't match strict schemas

Older saved files might have shapes the schema rejects (extra fields,
missing optional fields, slightly different enum values). On load, a
strict `parse` throws and the file appears broken.

**Mitigation:**

- Use `z.object({...}).passthrough()` for load schemas (keep
  unknowns).
- Add migration paths via `.transform()` for known older shapes.
- On load failure, fall back to defaults rather than crashing.
  Pattern from `catalogLoad`:

  ```ts
  try { return packSchema.parse(JSON.parse(raw)) } catch { return defaults }
  ```

### Test churn

Existing happy-path tests pass payloads that may not match strict
schemas (`{ x: 1 } as unknown as CalibrationFile`). They'll start
failing.

**Mitigation:** as you add schemas, update test payloads to be
schema-valid. The cleanup is itself useful — tests stop using cast
hacks.

### Bundle size

zod is ~50KB min+gzip. In renderer this is non-trivial.

**Mitigation:** if it bites, switch to valibot. The schema files use
a small enough subset that swap-out is mechanical (~`z.object` →
`v.object`, `z.string` → `v.string`, etc.).

## Exit criteria

- Every IPC handler that takes a non-string payload parses it
  through a zod schema.
- Schemas are colocated with TS type definitions and `z.infer<>` is
  the source of truth.
- Each schema has unit tests for happy + rejection cases.
- Each handler has an "rejects malformed input" test.
- Schema-validation log file exists at `ctx.settingsPath/ipc-validation.log`.
- `test-followup-fixes.md` entry #4 strikes through.

## Sequencing

Independent of the roots plan, but they share the `ctx.roots` infra.

**Cheapest path: bundle them.** Build `ctx.roots` once (Phase 1 of
roots plan), use it both as the auth layer for Category-A handlers
(roots plan Phases 2–3) AND as the source for path-refined schemas
(this plan Phase 3). Each handler gets touched once instead of
twice.

**If splitting:**

- Roots first → schemas adds a refinement on top of an existing
  helper.
- Schemas first → the path-traversal work re-touches every Category-A
  handler when roots lands. More churn.

Doing roots first is the lower-churn split.

## Effort estimate

- Phase 1: ~1 day (schemas for ~10 types + tests).
- Phase 2: ~1 day (wire across ~25 handlers).
- Phase 3: ~half a day if roots is already there; merges into the
  roots phase if bundled.
- Phase 4: ~half a day (logging hook + rotation).
- Total: ~3 days standalone, ~2 days bundled with the roots plan.
