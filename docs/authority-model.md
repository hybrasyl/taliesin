# Authority model

This document tells how Taliesin's main process decides which folders and programs the renderer may use. It fixes HTOO-673, HTOO-674 and HTOO-675. A sibling Electron app with the same finding (Creidhne HTOO-679, Epona HTOO-685) can port it.

## The rule

The renderer writes settings.json. So settings.json is not the record of what the renderer may touch. Main keeps that record in `grants.json`, and only main writes it.

## The parts

| Part                | Where                                                   | What it holds                                                                                      |
| ------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `grants.json`       | Beside settings.json (`%LOCALAPPDATA%\Erisco\Taliesin`) | `version`, `dirs` (granted folders), `executables` (ffmpeg, companion: path, size, mtime, SHA-256) |
| `ctx.blessedRoots`  | Memory, this session only                               | Every path a native dialog returned                                                                |
| `ctx.settingsRoots` | Memory                                                  | The settings paths that a grant or a session dialog result covers                                  |
| `allRoots(ctx)`     | `handlers.ts`                                           | The BIK cache, `settingsRoots`, `blessedRoots`. Not the settings folder.                           |

## How a folder gets authority

1. The user chooses it in a native dialog (`dialog:openDirectory`, `dialog:openFile`, `dialog:saveFile`). Main adds the result to `blessedRoots`.
2. The renderer saves settings that name the folder. `settings:save` keeps a settings path only when it is inside a grant or inside `blessedRoots`. It then sets `grants.dirs` to the settings paths it kept, and writes `grants.json`. So a folder that the settings no longer name loses its grant.
3. At the next start, main loads `grants.json` before it applies the settings roots. `settings:load` and `settings:save` wait for that load (`ctx.authorityReady`).

A path that main computes itself (the suggested Brigid assets folder) is added to `blessedRoots` when main offers it.

A settings path with no grant is saved, but it is not a root. Main logs it.

## The one-time migration

When `grants.json` does not exist, main reads the paths and programs in settings.json, grants them, and writes `grants.json`. This happens once, at the first start of the version that has this model. It happens before the renderer loads. A `grants.json` that does not parse gives an empty grant set (fail closed), and main logs it.

## Programs

No IPC channel takes a program path.

- `exec:choose(kind)`: main shows the dialog, measures the file (size, mtime, SHA-256) and records it in `grants.json`. A directory (a macOS `.app` bundle) is recorded without a hash.
- `exec:clear(kind)`: main removes the record. ffmpeg then comes from PATH, and the companion from discovery.
- Before each run, main checks the record. When the size and the mtime are the same, the file runs. When either changed, main hashes the file again. If the hash is different, the file does not run, and the user must choose it again.
- `bik:convert(bytes)` and `music:deploy-pack(src, pack, dest, kbps, sampleRate)` take no program and no cache folder. Main chooses both.
- `settings:load` returns the program paths from `grants.json`. `settings:save` replaces the renderer's program paths with them. The fields in settings.json are only a copy for display.

## Path checks

`authorizePath(ctx, p)` checks every path the renderer sends:

1. The path is inside a root, as a string.
2. Its real path (junctions and symlinks resolved; for a new path, the real path of its nearest existing parent) is inside the real path of a root. A link from one root into another root passes. A root that is itself a link passes, because the user chose it.
3. Its real path is not in the settings folder (except the BIK cache), and is not an approved program.

A file name joined under a checked folder takes `assertRealInside(folder, name)`, which does the string and the real-path test against that folder.

## What stays open

- **A race.** A folder can change into a link between the check and the I/O. The check closes every case where the link exists first, which is the case the review showed.
- **A macOS `.app` companion** is recorded without a hash. Main checks only that it is still a directory.
- **Typed paths.** The Settings fields are display-only. A user who wants a path that the dialog cannot reach has no other way to set it.

## Tests

`src/main/__tests__/authority.test.ts` drives the real handlers through `guardIpc`, on a real temporary filesystem with real junctions. `grants.test.ts` and `pathSafetyReal.test.ts` test the parts. `e2e/settings-authority.spec.js` checks the migration and the display-only fields in the built app.
