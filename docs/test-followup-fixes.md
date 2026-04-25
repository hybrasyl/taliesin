# Test Follow-Up Fixes

Defects and risks discovered while writing the test suite on the
`chore/test-infrastructure` branch. None of these are caused by the
test work — they were always there; the tests just made them visible.

Tackle these after the test infrastructure lands. Each item lists the
file and line(s), what's wrong, and the test that documents the
current behavior so a fix has a regression target.

---

## ~~1. XML `parsererror` detection is dead code (P1)~~ — FIXED

**Files**: `src/renderer/src/utils/mapXml.ts`, `src/renderer/src/utils/worldMapXml.ts`

Both parsers now check three patterns: `root.tagName === 'parsererror'`,
descendant `querySelector`, and `doc.getElementsByTagName`. Truly
malformed XML now throws with the `<parsererror>` text instead of
silently returning degraded data. jsdom probe confirmed it produces a
`parsererror` documentElement on bad input (matching Chromium), so the
fix is exercised by deterministic tests.

`archiveRenderer.ts` was checked while fixing this — it does not use
DOMParser, so the speculative duplicate noted in the original entry
doesn't exist.

---

## ~~2. `music:deploy-pack` clears destination before validating source (P0)~~ — FIXED

**File**: `src/main/handlers.ts` `musicDeployPack`

`musicDeployPack` now validates every track's source file with `fs.stat`
before touching the destination. If any source is missing it throws with
the offending filenames and leaves the existing deployed pack intact.
Two new positive tests in
[`src/main/__tests__/ipc.handlers.test.ts`](../src/main/__tests__/ipc.handlers.test.ts)
assert the guard (missing track + empty `srcLibDir`).

---

## 3. No path-traversal validation on IPC path arguments (P1)

**Files**: throughout [src/main/index.ts](../src/main/index.ts) — every
handler that takes a path argument (catalog, prefab, palette, theme,
pack, music, sfx, fs).

**Problem**: handlers accept paths from the renderer with no check that
they stay inside the expected library/pack root. A compromised renderer
(or a future feature that takes paths from external input) could read
or overwrite arbitrary files.

**Test reference**: none yet — Phase 4 IPC tests cover happy paths
only. Add traversal-rejection tests as part of the fix.

**Suggested fix**: add a `assertInside(parentDir, candidate)` helper
that resolves both to absolute paths and checks the candidate is a
descendant of the parent. Call it on every path argument that should
be scoped to a known root.

---

## 4. IPC handlers accept `unknown` payloads without schema validation (P2)

**File**: [src/main/index.ts](../src/main/index.ts)

**Problem**: every `ipcMain.handle` callback that receives a non-string
payload types it as `unknown` and trusts the renderer to send
well-formed data. Malformed JSON written to disk could crash later
loads or corrupt user files.

**Test reference**: none — the IPC happy-path tests assume valid input.
Worth a focused round of fuzzing tests after the schemas are in place.

**Suggested fix**: define zod (or similar) schemas for `settings`,
`pack`, `palette`, `prefab`, `theme`, `MusicMeta`, `MusicPack` and
parse at the IPC boundary. Reject + log invalid payloads instead of
writing them through to disk.

---

## ~~5. `mapRenderer` caches dat archives indefinitely (P2)~~ — FIXED

**File**: `src/renderer/src/utils/mapRenderer.ts`

`assetCache` is now LRU-bounded (limit=2) via small `lruTouch` / `lruGet`
helpers. Tile bitmap caches were moved INSIDE `MapAssets` so they're
scoped to a specific client and evicted alongside the assets — this also
fixes a quiet correctness bug where a re-visited client could serve
bitmaps left over from another client. New test file
[`src/renderer/src/utils/__tests__/mapRenderer.test.ts`](../src/renderer/src/utils/__tests__/mapRenderer.test.ts)
covers the LRU semantics directly. The unused `clearTileCache` export
was removed; `clearAllCaches()` is the new explicit reset hook.

---

## ~~6. `musicScan` throws unhandled ENOENT on a missing directory (P2)~~ — FIXED

**File**: `src/main/handlers.ts` `musicScan`

`musicScan` now wraps the top-level `scanMusicDir` call in try/catch
returning `[]` on any failure — same shape as `musicClientScan`. The
`mkdir` workaround in the MusicPackPage integration test has been
removed. Three new positive tests in
[`src/main/__tests__/ipc.handlers.test.ts`](../src/main/__tests__/ipc.handlers.test.ts)
cover missing-dir, empty-dir, and recursive discovery.

---

## 7. `deployTrack` re-encodes every track even when source is already MP3 (P3)

**File**: [src/main/index.ts:370-387](../src/main/index.ts#L370-L387)

**Problem**: deliberate per the inline comment ("MP3→MP3 generation
loss is negligible when downsampling to 64kbps anyway"), but worth
flagging. Re-encoding adds latency and a subtle quality hit on every
deploy.

**Test reference**:
`re-encodes every track through ffmpeg with the requested kbps and
sample rate` in
[`src/main/__tests__/ipc.handlers.test.ts`](../src/main/__tests__/ipc.handlers.test.ts).

**Suggested fix** (optional): when source is `.mp3` AND already at the
target kbps + sample rate, copy directly. Re-encode otherwise. Can
defer indefinitely — current behavior is intentional.

---

## Tracking

When fixing each item:

1. Update the corresponding test from "documents current behavior" to
   "asserts correct behavior" (or add a new positive-case test).
2. Strike the entry through here with the commit SHA: `~~item~~ (sha)`.
3. Once empty, delete this file.
