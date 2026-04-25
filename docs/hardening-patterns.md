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
`fs:listDir`, `pack:load`, `index:build`, etc.). For those you need a
different mechanism — track the active library/settings/app roots in
your handler context and reject any path that doesn't fall inside one.
That work is more invasive; defer until there's a concrete threat
model.

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

## Porting to creidhne

When you start a similar pass on creidhne:

1. Copy `src/main/pathSafety.ts` verbatim — no taliesin-specific
   coupling.
2. The LRU helpers are pure utilities — copy as-is or extract to a
   shared package if you want them reused without copy/paste.
3. `.gitattributes` — copy and adjust the binary list to creidhne's
   asset types.
4. The patterns in §2, §3, §5, §6, §8, §9 are conceptual — re-implement
   case by case.
5. If creidhne has a deploy-style "publish to game client" handler,
   audit it for the §2 mistake first. That was the one P0 bug we
   found and it's an obvious copy candidate.
