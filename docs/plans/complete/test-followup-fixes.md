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
[`src/main/__tests__/ipc.handlers.test.ts`](../../src/main/__tests__/ipc.handlers.test.ts)
assert the guard (missing track + empty `srcLibDir`).

---

## ~~3. No path-traversal validation on IPC path arguments (P1)~~ — FIXED

**Files**: `src/main/pathSafety.ts`, `src/main/handlers.ts`,
`src/main/index.ts`, `src/main/settingsManager.ts`

**Category-B (handler composes path = parent + filename)** — already
landed earlier with `assertInside`:

- prefab: `prefabLoad/Save/Delete/Rename` (filename, oldName, newName)
- pack: `packAddAsset/RemoveAsset/Compile` (targetFilename, filename, assetFilenames[])
- palette: `paletteCalibrationLoad/Save` (paletteId)
- theme: `themeLoad/Save/Delete` (filename)
- music: `musicDeployPack` (track.sourceFile, ${musicId}.mus)

**Category-A (handler takes a full absolute path)** — closed out by
introducing a session-scoped allowed-root set in `HandlerContext`:

- `pathSafety.ts` adds `assertInsideAnyRoot(roots, candidate)` and
  predicate `isInsideAnyRoot` for use in zod schema refinements.
- `HandlerContext` carries `settingsRoots: Set<string>` (derived from
  user settings: clientPath, activeLibrary, activeMapDirectory,
  musicLibraryPath, activeMusicWorkingDir, packDir) and
  `blessedRoots: Set<string>` (one-shot consent from OS dialog returns).
- `applySettingsRoots(ctx, settings)` refreshes the settings-derived
  set at startup and after every `saveSettings`. Dialog blessings
  persist across that refresh.
- Every Category-A handler now validates its path argument against
  `allRoots(ctx)` via `assertInsideAnyRoot` — `fs:*`, `catalog:*`,
  `music:*`, `sfx:*`, `bik:convert`, `index:*`, `library:resolve`,
  `prefab:*`, `pack:*`, `palette:*`, `frame:scan`, `tileScan:analyze`.
- `app:launchCompanion` is locked down separately: only the exact path
  stored in `settings.companionPath` may be spawned (process exec is a
  bigger blast radius than file read, so root-membership isn't enough).
- `settingsManager` gained the previously-stripped `companionPath` and
  `packDir` fields — without them the launcher whitelist and pack roots
  couldn't survive a settings reload.

24 unit tests in [`pathSafety.test.ts`](../../src/main/__tests__/pathSafety.test.ts)
cover the helpers (12 for `assertInside`, 6 for `assertInsideAnyRoot`,
3 for `isInsideAnyRoot`). 50+ traversal-rejection tests in
[`ipc.handlers.test.ts`](../../src/main/__tests__/ipc.handlers.test.ts)
exercise every Category-A handler — the throwing ones via
`expect(...).rejects.toThrow()`, and the swallowing ones (`fs:exists`,
`music:scan`, `music:client:scan`, `music:readFileMeta`, `palette:scan`,
`palette:delete`, `pack:scan`) by asserting they return their empty
shape rather than touching the filesystem. Two positive tests verify
the dialog auto-bless flow: a path picked via `dialog:openFile` /
`dialog:openDirectory` becomes immediately readable through `fs:readFile`
without any extra "set active" round-trip.

---

## ~~4. IPC handlers accept `unknown` payloads without schema validation (P2)~~ — FIXED

**Files**: `src/main/schemas/` (new), `src/main/schemaLog.ts` (new),
`src/main/handlers.ts`

Added zod 4.x and a per-payload schema module under `src/main/schemas/`:
`settings`, `palette` (+ `calibrationFile`), `prefab`, `music`
(`MusicMetaData`, `MusicPackArray`, `DeployPack`), `pack`
(`PackProject`, `PackManifest`, `PackCompileFilenames`), `catalog`,
`sfx`, `theme` (`TileTheme`).

`schemaLog.ts` exposes `parseOrLog(ctx, channel, schema, payload)`. On
rejection it (a) appends a one-line breadcrumb to
`<settingsPath>/ipc-validation.log` (rotates at 256KB → `.old.log`)
and (b) throws `Invalid <channel> payload: <issues>`. The log write is
best-effort and never blocks the real IPC failure.

Wired through every save-side handler:

- `settings:save` → `taliesinSettingsSchema`
- `catalog:save` → `catalogDataSchema`
- `music:metadata:save` → `musicMetaDataSchema`
- `music:packs:save` → `musicPackArraySchema`
- `music:deploy-pack` (pack arg) → `deployPackSchema`
- `sfx:index:save` → `sfxIndexSchema`
- `prefab:save` → `prefabSchema` (also enforces `tiles.length === w*h`)
- `pack:save` → `packProjectSchema`
- `pack:compile` → `packManifestSchema` + `packCompileFilenamesSchema`
- `palette:save` → `paletteSchema` (hex-color regex on shadow/highlight)
- `palette:calibrationSave` → `calibrationFileSchema`
- `theme:save` → `tileThemeSchema`

Load-side handlers don't need IPC schemas — they return data we wrote
ourselves earlier, and existing try/catch returns an empty shape on
unreadable disk content.

32 unit tests in
[`src/main/__tests__/schemas.test.ts`](../../src/main/__tests__/schemas.test.ts)
exercise each schema with happy + rejection cases. 12 handler-level
"rejects malformed input" tests in
[`ipc.handlers.test.ts`](../../src/main/__tests__/ipc.handlers.test.ts)
verify the IPC boundary throws `Invalid <channel> payload`, plus one
positive test confirms the breadcrumb actually lands in
`ipc-validation.log` under settingsPath.

---

## ~~5. `mapRenderer` caches dat archives indefinitely (P2)~~ — FIXED

**File**: `src/renderer/src/utils/mapRenderer.ts`

`assetCache` is now LRU-bounded (limit=2) via small `lruTouch` / `lruGet`
helpers. Tile bitmap caches were moved INSIDE `MapAssets` so they're
scoped to a specific client and evicted alongside the assets — this also
fixes a quiet correctness bug where a re-visited client could serve
bitmaps left over from another client. New test file
[`src/renderer/src/utils/__tests__/mapRenderer.test.ts`](../../src/renderer/src/utils/__tests__/mapRenderer.test.ts)
covers the LRU semantics directly. The unused `clearTileCache` export
was removed; `clearAllCaches()` is the new explicit reset hook.

---

## ~~6. `musicScan` throws unhandled ENOENT on a missing directory (P2)~~ — FIXED

**File**: `src/main/handlers.ts` `musicScan`

`musicScan` now wraps the top-level `scanMusicDir` call in try/catch
returning `[]` on any failure — same shape as `musicClientScan`. The
`mkdir` workaround in the MusicPackPage integration test has been
removed. Three new positive tests in
[`src/main/__tests__/ipc.handlers.test.ts`](../../src/main/__tests__/ipc.handlers.test.ts)
cover missing-dir, empty-dir, and recursive discovery.

---

## ~~7. `deployTrack` re-encodes every track even when source is already MP3 (P3)~~ — FIXED

**File**: `src/main/handlers.ts` `deployTrackFn`

`deployTrackFn` now reads the source's bitrate + sample rate via
`music-metadata` when the source is `.mp3`. If both already match the
deploy target, it `fs.copyFile`s directly — saving an ffmpeg roundtrip
per track and avoiding the subtle MP3→MP3 generation loss. Any parse
failure (corrupt mp3, unsupported codec) falls through to the safe
re-encode path.

`music-metadata` is now imported once at the start of `musicDeployPack`
and the `parseBuffer` reference is passed into `deployTrackFn` — when
done as parallel `await import('music-metadata')` calls, Vitest's mock
substitution races and one of the parallel callers falls through to
the real module. One import per pack also avoids redundant module
initialization.

Four new tests in
[`src/main/__tests__/ipc.handlers.test.ts`](../../src/main/__tests__/ipc.handlers.test.ts):
fast-path hit, bitrate mismatch, parse failure, non-mp3 source.

---

## Tracking

When fixing each item:

1. Update the corresponding test from "documents current behavior" to
   "asserts correct behavior" (or add a new positive-case test).
2. Strike the entry through here with the commit SHA: `~~item~~ (sha)`.
3. Once empty, delete this file.
