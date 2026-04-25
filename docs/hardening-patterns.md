# Hardening Patterns

Patterns and reusable helpers extracted while closing the
`chore/test-followup-fixes` branch. The defects fixed there were generic
shapes that creidhne (and any future Electron/Node main-process app)
will hit too. This is the durable reference; port the patterns when
they're needed.

The original defect log is in
[`test-followup-fixes.md`](./completed/test-followup-fixes.md). This doc is the
distilled "what we learned, what to copy."

---

## 1. Path-traversal guard for IPC handler arguments

**Problem.** Any handler that takes a renderer-supplied filename
component and joins it to a known parent dir (themes/`<name>`,
prefabs/`<name>`, packs/`<id>`/\_palettes/`<id>`.json, etc.) is one
`../../etc/passwd` away from reading or overwriting arbitrary files. A
trusted renderer doesn't excuse this — defence in depth, plus the
threat model changes the moment a future feature accepts external input.

**Helper.** [`src/main/pathSafety.ts`](../src/main/pathSafety.ts) ships
`assertInside(parent, candidate)`:

- Uses `normalize` + `join` (no `path.resolve` — that drags in `cwd` and
  on Windows produces drive-letter-prefixed paths that don't compare
  cleanly against POSIX-style test fixtures).
- Comparison uses `parent + sep` so a sibling like `/parent-evil/x`
  doesn't pass a naive `startsWith(parent)` check.
- Returns the resolved absolute path so callers don't re-normalize.

```ts
import { isAbsolute, join, normalize, sep } from 'path'

export function assertInside(parent: string, candidate: string): string {
  const absParent = normalize(parent).replace(/[\\/]+$/, '')
  const absCandidate = isAbsolute(candidate)
    ? normalize(candidate)
    : normalize(join(absParent, candidate))
  const parentWithSep = absParent + sep
  if (absCandidate !== absParent && !absCandidate.startsWith(parentWithSep)) {
    throw new Error(`Path traversal rejected: "${candidate}" escapes "${parent}"`)
  }
  return absCandidate
}
```

**Where to apply it.** Every handler that composes `join(parentDir,
userSuppliedComponent)`. In Taliesin: prefab/pack/palette-calibration/
theme/musicDeploy. The pattern is "Category B" handlers — those that
take a known parent dir + a component the renderer chose.

**Where it does NOT apply.** Handlers that take a full absolute path
chosen by the renderer with no implicit parent (`fs:readFile`,
`fs:listDir`, `pack:load`, `index:build`, etc.). For those see §10:
session-scoped allowed-root sets. The two layers stack — Category-A
handlers run `assertInsideAnyRoot` first, then any further
`assertInside` against an internal subdir.

**Test pattern.** A small unit test of the helper (12 cases in
`pathSafety.test.ts`) plus a one-line traversal-rejection test per
wired handler:

```ts
it('prefab:save rejects a traversal in filename', async () => {
  await expect(
    invoke('prefab:save', '/lib/world/xml', '../../escape.json', { x: 1 })
  ).rejects.toThrow(/Path traversal/)
})
```

**Gotcha.** If the handler wraps `fs.unlink` in a `try/catch` to ignore
"already gone" ENOENT, lift `assertInside` OUT of the try/catch:

```ts
// WRONG — try/catch swallows the traversal error
export async function packRemoveAsset(packDir, filename) {
  try {
    await fs.unlink(assertInside(packDir, filename))
  } catch {}
}

// RIGHT
export async function packRemoveAsset(packDir, filename) {
  const target = assertInside(packDir, filename)
  try {
    await fs.unlink(target)
  } catch {}
}
```

---

## 2. Validate sources before mutating destinations

**Problem.** A "deploy" or "publish" operation that clears the
destination first and then copies sources will wipe the user's data if
ANY source fails — missing files, stale references, path-traversal
rejection.

**Pattern.** Validate (or stat) every source up front. Only touch the
destination if validation passes for every entry.

```ts
// musicDeployPack — validate every source before clearing destDir
const resolved = pack.tracks.map((track) => ({
  src: assertInside(srcLibDir, track.sourceFile),
  dst: assertInside(destDir, `${track.musicId}.mus`),
  original: track.sourceFile
}))
const missing: string[] = []
await Promise.all(
  resolved.map(async (r) => {
    try {
      await fs.stat(r.src)
    } catch {
      missing.push(r.original)
    }
  })
)
if (missing.length > 0) {
  throw new Error(`Cannot deploy: missing source(s): ${missing.join(', ')}`)
}
// Only now safe to clear the destination
await fs.mkdir(destDir, { recursive: true })
// ... etc
```

**Stronger variant.** Write to a temp dir and rename atomically. Avoids
even the "dest cleared, copies underway, machine crashes" window.
Overkill for a music-pack deploy; right for anything where the dest is
load-bearing during normal app operation.

---

## 3. Graceful degrade for missing-directory scans

**Problem.** A scanner that does `fs.readdir(rootDir)` without a
try/catch surfaces ENOENT as an unhandled rejection if `rootDir`
doesn't exist (deleted folder, unmounted drive, fresh install pointing
at a placeholder). The renderer's auto-load hook then trips the React
error boundary instead of showing an empty state.

**Pattern.** Wrap the top-level scan in `try { ... } catch { return [] }`.
Errors INSIDE the scan (a single bad file under a valid root) should
still surface — only the missing-root case degrades silently.

```ts
export async function musicScan(dirPath: string) {
  try {
    return await scanMusicDir(dirPath)
  } catch {
    return []
  }
}
```

The recursive `scanMusicDir` itself does NOT have a try/catch, so a
permission error half-way down the tree still throws.

**Where to apply.** Any handler whose results feed an auto-loading
hook in the renderer. `musicClientScan` already had this pattern —
it's now consistent across the music handlers.

---

## 4. Bounded LRU cache for expensive loads

**Problem.** A module-level `Map<key, expensiveResource>` that's never
evicted leaks memory in proportion to distinct keys seen across a
session. Switching libraries / clients / packs during a long editing
session is exactly the access pattern that hits this.

**Helpers.** Two small pure functions in
[`src/renderer/src/utils/mapRenderer.ts`](../src/renderer/src/utils/mapRenderer.ts)
(`lruTouch`, `lruGet`):

```ts
export function lruTouch<K, V>(map: Map<K, V>, key: K, value: V, limit: number): void {
  if (map.has(key)) map.delete(key)
  map.set(key, value)
  while (map.size > limit) {
    const oldest = map.keys().next().value
    if (oldest === undefined) break
    map.delete(oldest)
  }
}

export function lruGet<K, V>(map: Map<K, V>, key: K): V | undefined {
  const v = map.get(key)
  if (v === undefined) return undefined
  map.delete(key)
  map.set(key, v)
  return v
}
```

JavaScript's `Map` preserves insertion order, so delete + re-set is the
"bump to MRU" trick. No external LRU library, no class, easy to test
directly (11 cases in `mapRenderer.test.ts`).

**Choosing the limit.** For per-client/per-library caches, `limit: 2`
is usually right — covers the common "switch back and forth between
two clients while testing" pattern without growing.

---

## 5. Per-asset caches over module-level caches

**Problem.** Module-level caches keyed by an inner ID (e.g. `tileIndex`)
that's only meaningful within a specific asset bundle. Switching
bundles invalidates the meaning, but the cache doesn't know — bitmap
for tile 5 from client A leaks into a client-B render.

**Pattern.** Move the cache INSIDE the asset bundle's data structure.
Now its lifetime is tied to the bundle; eviction of the bundle evicts
the cache automatically; cross-contamination is impossible by
construction.

```ts
// Before
const groundBitmapCache = new Map<number, ImageBitmap>()

// After
export interface MapAssets {
  // ...other fields...
  groundBitmapCache: Map<number, ImageBitmap>
}
```

Callers move from `groundBitmapCache.get(idx)` to
`assets.groundBitmapCache.get(idx)`. Same access pattern, correct
scoping.

---

## 6. XML parsererror — three-pattern detection

**Problem.** `root.querySelector('parsererror')` only searches
DESCENDANTS of `documentElement`. When XML is truly malformed, browsers
(Chromium and jsdom both) return a document where `parsererror` IS the
`documentElement`. The descendant-only search misses that case, so
malformed XML silently produces empty/default data instead of throwing.

**Pattern.** Check three patterns:

```ts
if (
  root.tagName === 'parsererror' ||
  root.querySelector('parsererror') ||
  doc.getElementsByTagName('parsererror').length > 0
) {
  const errEl = root.tagName === 'parsererror' ? root : doc.getElementsByTagName('parsererror')[0]
  throw new Error(`XML parse error: ${errEl.textContent ?? ''}`)
}
```

**Verification.** Probe the actual DOMParser behavior in the test
runtime before writing tests. jsdom and Chromium agree on this for
malformed XML — `tagName === 'parsererror'` fires. Don't trust a memory
that says "jsdom is too lenient to test this" without re-checking.

---

## 7. `.gitattributes` for cross-platform line endings

Without it, Windows contributors get noisy warnings on every commit:

```
warning: in the working copy of '...', LF will be replaced by CRLF the next time Git touches it
```

The minimal config that silences the noise and locks repo blobs to LF:

```
* text=auto eol=lf

# Binary asset types
*.png   binary
*.gif   binary
# ...
```

Commit this once at the start of a project. With autocrlf=true on the
contributor's machine, working copies still get CRLF on checkout, but
the repo is consistent.

---

## 8. Vitest parallel-import race for mocked modules

**Problem.** Two parallel `await import('some-mocked-module')` calls
race in Vitest's mock substitution. One of them gets the mock, the
other can fall through to the real module and throw a real-library
error. We hit this in `musicDeployPack` running parallel
`deployTrackFn` calls that each dynamically imported `music-metadata`.

**Pattern.** Import once at the orchestrator level and pass the
function in:

```ts
// Inside musicDeployPack
const { parseBuffer } = await import('music-metadata')
await Promise.all(resolved.map((r) =>
  deployTrackFn(parseBuffer, r.src, r.dst, ...)
))

async function deployTrackFn(parseBuffer: ParseBuffer, ...) {
  const meta = await parseBuffer(...)
  // ...
}
```

Side benefit: one module init per deploy instead of one per track.

**Heuristic.** Any time you have `Promise.all(items.map(item =>
asyncFn(item)))` and `asyncFn` does `await import(...)`, hoist the
import out of the loop.

---

## 9. Capturing defects discovered during testing

**Workflow.** When writing tests for an existing codebase, you'll find
defects — the tests exist precisely because the code was untested. Two
options:

1. **Stop and fix each one** — leads to scope creep; never finish the
   test suite.
2. **Document and continue** — keep moving; tackle the defects on a
   focused branch after the test infra lands.

We picked (2). The test work was on `chore/test-infrastructure`; the
follow-up fixes were on `chore/test-followup-fixes`. The tracking
document `test-followup-fixes.md` has one entry per defect:

- File and line(s)
- Problem statement
- Test reference (the test that documents the current behavior, so
  the fix has a regression target)
- Suggested fix

When the fix lands, the entry is struck through with a brief
"what was done." Once empty, delete the file.

This kept the test branch focused and produced a queue of
self-contained, well-scoped follow-up commits.

---

## 10. Session-scoped allowed-root sets (Category-A handlers)

**Problem.** A handler like `fs:readFile(path)` takes a full absolute
path with no implicit parent dir, so `assertInside` from §1 doesn't
apply. The renderer can address arbitrary disk locations unless main
process maintains its own notion of "paths the user has authorised
this session." Trust model breaks the moment a renderer compromise (or
a future feature accepting external input) tries to read
`/etc/passwd` or write into a system dir.

**Pattern.** Track two root sets on `HandlerContext`:

- `settingsRoots: Set<string>` — derived from current settings (active
  library, active map dir, music library, pack dir, client install,
  etc.). Refreshed at startup and after every `saveSettings`.
- `blessedRoots: Set<string>` — paths the user explicitly picked
  through an OS dialog this session. Persistent across settings
  refreshes (the user just picked it; don't drop it just because they
  also touched Settings).

`allRoots(ctx)` yields settingsPath + both sets. Every Category-A
handler validates via `assertInsideAnyRoot(allRoots(ctx), path)` before
any I/O.

```ts
// src/main/pathSafety.ts
export function assertInsideAnyRoot(roots: Iterable<string>, candidate: string): string {
  let rootCount = 0
  for (const root of roots) {
    rootCount++
    try {
      return assertInside(root, candidate)
    } catch {
      /* try next */
    }
  }
  if (rootCount === 0) throw new Error(`Path "${candidate}" rejected: no allowed roots configured`)
  throw new Error(`Path "${candidate}" is not inside any allowed root`)
}

// src/main/handlers.ts
export interface HandlerContext {
  settingsPath: string
  settingsRoots: Set<string> // derived from settings
  blessedRoots: Set<string> // dialog-picked, session-scoped
  // ...
}

export function applySettingsRoots(ctx: HandlerContext, settings: TaliesinSettings): void {
  ctx.settingsRoots.clear()
  if (settings.clientPath) ctx.settingsRoots.add(settings.clientPath)
  if (settings.activeLibrary) ctx.settingsRoots.add(settings.activeLibrary)
  // ...etc
}

export async function saveSettings(ctx: HandlerContext, settings: unknown) {
  const parsed = parseOrLog(ctx, 'settings:save', taliesinSettingsSchema, settings)
  await ctx.settingsManager.save(parsed)
  applySettingsRoots(ctx, parsed) // re-derive immediately
}
```

**Dialog auto-bless.** Modify `dialog:openFile`/`openDirectory` to add
the picked path to `blessedRoots` before returning. The renderer can
then read/write the picked path without a separate "set active"
round-trip — matches the user's mental model ("I picked it, of course
I can read it").

```ts
ipcMain.handle('dialog:openDirectory', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  const picked = r.filePaths[0] ?? null
  if (picked) ctx.blessedRoots.add(picked)
  return picked
})
```

**Test fixture trick.** Production tests that pre-date this hardening
pass synthetic paths that aren't in any settings-derived root. Seed
`ctx.blessedRoots.add('/')` in `beforeAll` to make every absolute path
acceptable; per-test rejection blocks override locally to verify the
rejection path actually works. Export `ctx` from `index.ts` so tests
can reach it directly — production code never imports it.

**Gotcha.** Route Category-A through `assertInsideAnyRoot` BEFORE any
internal `assertInside`. Some handlers do both: an asset-pack handler
takes a full `packDir` (Category-A check) and then composes
`packDir/<asset.png>` from a renderer-supplied component (Category-B
check). Two stacked guards.

**Gotcha #2.** Some handlers wrap their body in try/catch to return
`[]` on missing-dir errors (`musicScan`, `prefabList`, `packScan`,
`paletteScan`). Decide deliberately whether root rejection should:
**(a)** swallow into the empty shape (renderer can't read anything,
sees the same UX as missing dir), or **(b)** propagate so the renderer
sees an explicit auth error. We picked (a) for "scan/list" handlers —
move the assert INSIDE the try — and (b) for everything else. Mixed
behavior is fine but the choice should be conscious.

---

## 11. Whitelist exe spawn against a settings-stored path

**Problem.** A handler that spawns an external binary (`spawn(exePath)`)
has a much larger blast radius than file I/O — it's code execution
outside the Electron sandbox. The §10 root check isn't sufficient: a
malicious renderer that also blessed a download dir could drop
`malware.exe` and call `launchCompanion('/Users/x/Downloads/malware.exe')`.
The path is "inside an allowed root" but executing it is a big deal.

**Pattern.** Lock the spawn target to one specific path stored in
settings. Refuse anything else.

```ts
export async function launchCompanion(ctx: HandlerContext, exePath: string): Promise<boolean> {
  const settings = await ctx.settingsManager.load()
  const allowed = settings.companionPath
  if (!allowed || exePath !== allowed) return false
  try {
    await fs.access(exePath)
    spawn(exePath, [], { detached: true, stdio: 'ignore' }).unref()
    return true
  } catch {
    return false
  }
}
```

**UX implication.** The user has to set the path in Settings before
the launcher works at all. Acceptable for a tool with one launcher
target. Refuse the temptation to whitelist a directory + filename
allowlist — that re-opens the §10 trap.

---

## 12. Schema validation at the IPC boundary (zod)

**Problem.** `ipcMain.handle` callbacks type complex payloads as
`unknown` and trust the renderer to send well-formed data. A renderer
bug, a corrupted state, or (in a future feature) external input could
push malformed JSON to disk. Later loads then crash or silently
return garbage.

**Pattern.** zod schemas owned by main, parsed at the IPC boundary.
Schemas live under `src/main/schemas/` (one module per payload type)
and are re-exported from `src/main/schemas/index.ts`. The renderer keeps
its plain TS interfaces — schemas are an IPC-boundary concern, not a
renderer-side type system.

`parseOrLog(ctx, channel, schema, payload)` is the single entry every
save-side handler uses. On rejection it (1) appends a one-line
breadcrumb to `<settingsPath>/ipc-validation.log` (rotates at 256KB)
so the user has something to attach to a bug report, and (2) throws
`Invalid <channel> payload: <issues>`. Logging is best-effort —
swallowed on error so the real IPC failure isn't blocked.

```ts
// src/main/schemaLog.ts
export function parseOrLog<T>(
  ctx: { settingsPath: string },
  channel: string,
  schema: ZodSchema<T>,
  payload: unknown
): T {
  const result = schema.safeParse(payload)
  if (!result.success) {
    void logSchemaFailure(ctx.settingsPath, channel, result.error)
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid ${channel} payload: ${issues}`)
  }
  return result.data
}

// any save-side handler
export async function packSave(ctx: HandlerContext, filePath: string, data: unknown) {
  const safe = assertInsideAnyRoot(allRoots(ctx), filePath)
  const parsed = parseOrLog(ctx, 'pack:save', packProjectSchema, data)
  await fs.writeFile(safe, JSON.stringify(parsed, null, 2), 'utf-8')
}
```

**Where to apply.** Every handler that takes a non-string complex
payload — save/write side. Skip the load side: those return data we
wrote ourselves earlier, and existing try/catch already returns an
empty shape on unreadable disk content. Validating loads would mostly
catch our own past write bugs, which schema-on-save prevents going
forward.

**Schema design notes.**

- Default zod (non-strict) shape — extra fields pass through. Strictness
  on save is not the same as completeness, and extra renderer state
  (e.g. UI hints) shouldn't fail validation.
- Use `.refine()` for cross-field invariants (e.g. `prefab.tiles.length
=== width * height`). Catches a class of renderer-side bugs that
  pure shape validation misses.
- Use regex refinements where the format is contractual — palette
  shadow/highlight colors must be `#RRGGBB` because the MonoGame client
  parses them that way.
- Use `.min(1)` on `name` / `id` fields where empty strings would
  silently break rendering or storage.

**Test pattern.** Two layers:

1. Per-schema unit tests (happy + rejection per field) in a dedicated
   `schemas.test.ts`. ~3 cases per schema.
2. Per-handler "rejects malformed input" tests in the IPC test file —
   one `it.each` block driving every save channel with a deliberately
   malformed payload, asserting `/Invalid .* payload/`.

Plus one positive test that the breadcrumb actually lands in
`ipc-validation.log` under settingsPath. Mock `fs.appendFile` if your
in-memory test fs doesn't have it.

**Gotcha.** Existing happy-path tests often pass minimal synthetic
payloads (`{ name: 'foo' }` for a save handler). They WILL break when
schemas land — the laziness was masking the lack of validation. Update
each to send a schema-valid shape; the cleanup is itself useful since
those tests stop using cast hacks.

---

## 13. The `withDefaults` allowlist trap

**Problem.** A settings loader that returns `withDefaults(parsed)` —
where `withDefaults` constructs a new object from a fixed list of
known fields — silently strips any field not in its allowlist. Add a
new setting in renderer code, save it, and on next load it vanishes.
We hit this with `companionPath` and `packDir`: both were referenced
all over the renderer and persisted on save, but `withDefaults` didn't
list them, so users got a "set this field every session" experience
that nobody noticed because the defaults felt fine.

**Pattern.** Two options:

1. **Spread + explicit defaults** for known fields, preserving unknown
   fields.

   ```ts
   function withDefaults(data: Partial<Settings>): Settings {
     return { ...DEFAULTS, ...data } // extras pass through
   }
   ```

2. **Allowlist + automated round-trip test.** If you want the strict
   shape (e.g. for security or storage-format stability), keep the
   field-by-field literal but add a test that round-trips every
   documented field through save → load → assertEqual:

   ```ts
   it('round-trips every field', async () => {
     const sample: Settings = {
       /* every field set to a non-default value */
     }
     await save(sample)
     const loaded = await load()
     expect(loaded).toEqual(sample)
   })
   ```

   The test fails the moment someone adds a `Settings` field but forgets
   to wire it through `withDefaults`.

**What to do when you find the bug.** Adding the missing field to
`withDefaults` is the obvious fix. The non-obvious follow-up: any
session where the user set the field and the loader stripped it — that
field's value is gone forever. Worth a one-shot migration that pulls
the raw setting from `settings.bak.json` (which was written before the
strip ran on a previous load cycle), if you need to recover.

---

## Porting to creidhne

When you start a similar pass on creidhne:

1. Copy `src/main/pathSafety.ts` verbatim (both `assertInside` AND
   `assertInsideAnyRoot` + `isInsideAnyRoot`). No taliesin-specific
   coupling.
2. Copy `src/main/schemaLog.ts` and the `src/main/schemas/` directory
   layout. Schemas are payload-shape-specific; you'll write new ones,
   but the `parseOrLog` helper and the log rotation policy port as-is.
3. Build `HandlerContext.settingsRoots` + `blessedRoots` infrastructure
   (§10) before wiring per-handler validation. The two-set split lets
   settings reloads refresh without dropping dialog blessings; getting
   that wrong is annoying to debug after the fact.
4. The LRU helpers are pure utilities — copy as-is or extract to a
   shared package if you want them reused without copy/paste.
5. `.gitattributes` — copy and adjust the binary list to creidhne's
   asset types.
6. The patterns in §2, §3, §5, §6, §8, §9 are conceptual — re-implement
   case by case.
7. **Audit candidates.** Before you start the equivalent rounds, scan
   creidhne for these exact shapes:
   - **§2 (deploy-validates-source):** any handler that clears a
     destination before iterating sources. P0 if found.
   - **§11 (exe spawn):** any handler that calls `spawn(...)` with a
     renderer-supplied path. Lock to a settings-stored whitelist.
   - **§13 (withDefaults trap):** the settings loader. Round-trip every
     field of the settings interface; whatever doesn't survive is
     silently being stripped.
