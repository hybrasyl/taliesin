# Security

## What Taliesin is

An offline, single-user desktop tool. It reads legacy Dark Ages archives (`.dat`/`.pak`) off local disk and authors `.datf` asset packs. It has **no server, no account, no network listener, and no multi-user state**. The only outbound network traffic is a browser handoff — opening a link or a prefilled GitHub issue in the user's own browser.

That shape decides what a vulnerability in it can even be. There is no session to steal and no other user to reach. The realistic threat is a **malicious or malformed file**: a `.dat`, a `.datf` pack, or a world XML that the user opens, which then reaches something outside the directory it came from, or persuades the app to hand the operating system something it should not.

## Reporting a vulnerability

Open a private security advisory on [hybrasyl/taliesin](https://github.com/hybrasyl/taliesin/security/advisories), or contact the maintainer directly. Do not open a public issue for a security report.

For non-security bugs, use the in-app **Report Issue** dialog — it builds a scrubbed diagnostic report and files it to the shared public intake repo.

## Trust boundaries

One row per surface that takes input we do not control, and what guards it. A surface with no answer here is a finding, not an omission.

| Surface | Input it takes | Guard |
| --- | --- | --- |
| **Renderer → main IPC** | Any argument the renderer sends, on ~85 channels | `guardIpc` in `src/main/windowSecurity.ts` wraps `ipcMain` at the single `registerHandlers` call site, so every handler inherits a sender check by construction. An IPC is accepted only from the **top frame** of a **registered** window at a **trusted location**. Fails closed: nothing is trusted until `initWindowSecurity` runs. |
| **Filesystem paths crossing IPC** | Absolute paths chosen by the renderer | `assertInside` / `assertInsideAnyRoot` in `src/main/pathSafety.ts`, against settings-derived roots plus roots "blessed" by an OS dialog in this session. Validated in main, never in the renderer. This is the strongest control in the app and predates the IPC guard; the two are independent. |
| **Payload shapes crossing IPC** | Settings, pack manifests, palettes, themes, prefabs, catalogs | Zod schemas in `src/main/schemas/`. Failures are logged to a file beside settings by `schemaLog.ts` rather than thrown at the user. **Partial — see Known gaps.** |
| **Window navigation** | A URL the renderer tries to navigate to | `hardenWindow`'s `will-navigate` handler denies anything that is not our own bundle, and hands a safe URL to the OS browser instead of dropping it silently. |
| **Child windows** | `window.open` / `target="_blank"` from renderer content | `setWindowOpenHandler` returns `{ action: 'deny' }` unconditionally. No renderer content can create a window. |
| **External links** | A URL handed to `shell.openExternal` | `isSafeExternalUrl` in `src/shared/externalUrl.ts` — `http`/`https`/`mailto` only, parsed with `URL`, malformed refused rather than repaired. `shell.openExternal` honours `file:`, `smb:`, `ms-msdt:` and any custom scheme registered on the machine, so an ungated call is an OS-level open primitive. Both call sites (the window-open handler and the Report Issue prefill) go through it. |
| **The preload bridge** | Nothing — it is the boundary itself | `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, all stated explicitly. The preload imports `electron` and nothing else; the built `out/preload/index.js` emits exactly one `require`. Adding a package import there re-breaks the sandbox **in the packaged app only** — it builds and lints clean. `e2e/preload-sandbox.spec.js` guards it. |
| **The shipped binary** | Environment variables and CLI arguments | `electronFuses` in `electron-builder.yml`: `runAsNode`, `enableNodeCliInspectArguments` and `enableNodeOptionsEnvironmentVariable` off; `onlyLoadAppFromAsar` on. These land on the packaged binary only — nothing in CI exercises them. |
| **Legacy archive parsing** | Arbitrary `.dat`/`.pak`/`.epf`/`.hpf`/`.mpf` bytes | Delegated to `@eriscorp/dalib-ts`, which owns bounds validation. Taliesin does not hand-roll binary decode. A parser defect is a dalib-ts fix. **See Known gaps for the one place this is not yet true.** |
| **`.datf` pack import** | A zip archive chosen by the user | Extracted through `unzipper` in `src/main/assetPacks.ts`, with the destination validated by `pathSafety`. Manifest validated against `contentTypeSchema`. |
| **On-disk state** | `settings.json` and the JSON stores | Crash-safe write (tmp → backup → rename) with EPERM/EACCES retry; load falls back primary → backup → defaults. Corruption heals rather than throwing. |
| **Diagnostic reports** | Paths, usernames and machine details from the environment | `src/main/report/scrub.ts` scrubs **once, at capture, in main** — emails, IPv4, deep paths, home directory, bare username. The full report always reaches the clipboard before any URL opens, so a truncated URL never loses it. |

## Deliberately not guarded

- **The directories the user points Taliesin at.** Naming a client install, a world library or a pack output directory *is* the feature. Those paths are trusted by design once chosen, and become "blessed roots" for the session. The guard is that they must be chosen through an OS dialog or settings, not supplied by renderer content.
- **The splash window's own HTML.** `resources/splash.html` is deliberately **not** a trusted location. It has no preload, so it has no bridge and cannot send IPC, and it is never registered as a trusted window. `will-navigate` does not fire for the main-process `loadFile` that loads it.
- **Content of the files a user authors.** Taliesin will happily write a pack that the Brigid client rejects. Validating game-design intent is not a security boundary.

## Known gaps

Recorded so an unguarded surface reads as pending work rather than as an oversight.

1. **Zod validation is applied at a minority of IPC handlers.** Six `parse`/`safeParse` call sites across ~85 handlers. Path arguments are covered everywhere by `pathSafety`, which is the surface that matters most, but structured payloads are not uniformly schema-checked. Widening this is worthwhile and untracked.
2. **`mapRenderer.ts` still hand-decodes the SOTP collision nibble** rather than using dalib-ts's `SotpFile`, so one binary-parsing path is not delegated. Tracked as [WP5](docs/plans/05-sotp-tile-adoption.md).
3. **`ColorTable.parseText` has no allocation cap**, so a crafted 40 KB `.tbl` can exhaust the heap. Currently mitigated by a sniff-before-parse guard at the one call site (`tryParseColorTable`); [WP4](docs/plans/04-typed-tbl-views.md) must apply the same shape to each new table parser it adds.
4. **The renderer's CSP is a `<meta>` tag only**, not a `session.webRequest` response header, and `resources/splash.html` carries none at all. Both load `file://` content we ship, so the exposure is low.
5. **No single-instance lock.** Two copies can run against the same settings directory. The crash-safe write makes this survivable rather than safe.
6. **No auto-update.** `publish:` is configured for release publishing only; nothing in the app checks for or installs updates. A user on an old version stays there until they download a new one.

## Verifying the boundary

The unit and e2e suites cover most of this, but two things are reachable only from a real package.

```
npm run test:coverage     # windowSecurity + externalUrl + splash backstops
npm run e2e               # needs a GUI: ipc-guard.spec.js proves both directions
```

Fuses, against a packaged build (`npm run build:win`), from PowerShell:

```powershell
$env:ELECTRON_RUN_AS_NODE = 1
.\dist\win-unpacked\taliesin.exe -e "console.log('FUSE_MARKER')"   # must print NOTHING
.\dist\win-unpacked\taliesin.exe                                    # must still open normally
```

Absence of the marker proves `runAsNode: false`. The second launch proves the fuse did not brick the ordinary path — and it is also the app becoming immune to the `ELECTRON_RUN_AS_NODE` trap, in which an exported variable makes a healthy app exit 0 with no window, indistinguishable by eye from a missing runtime dependency.

## Dependencies

There is **no `dependabot.yml`, and that is a decision rather than an oversight.** It was tried house-wide and produced noise instead of signal. Dependency and action-version bumps are done by hand when a deprecation or an advisory surfaces one.

Production dependencies are audited with `npm audit --omit=dev --audit-level=high`. The narrowing is deliberate: eslint and electron-builder do not ship, so an advisory in one is something to schedule rather than something that should red an unrelated PR. A gate that cries wolf gets deleted, and then there is no gate. The dev tree is handled by hand instead.
