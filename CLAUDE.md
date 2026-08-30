# Taliesin

Dark Ages asset viewer + authoring tool — companion to Creidhne. It reads legacy DA archives
(`.dat`/`.pak` etc.) and **authors `.datf` asset packs** consumed by the Brigid client. Built on
the house Erisco/Hybrasyl Electron standard (this repo predates and partly seeded that template).

## Canonical references (read these first)

- **House-wide working practices** — git/commit discipline, PR prep, verify-before-commit,
  security posture: the **document repo**'s `docs/architecture/dev-practices.md`.
- **Electron stack & architecture standard** — stack versions, directory layout, IPC/preload/
  settings/theming patterns: the document repo's `docs/architecture/electron-app-skeleton.md`.
- **`.datf` asset-pack format** (content types, `covers`, filename contracts): the document repo's
  `docs/plans/hybrasyl.client/asset-pack-format.md` — the authoritative registry of `content_type`s.

## Commands

```bash
npm run dev            # electron-vite dev — launches the app; needs a GUI (see Verifying)
npm test               # vitest run (node + jsdom projects)
npm run test:coverage  # vitest with the coverage-floor gate (enforced in CI)
npm run typecheck      # tsc --build
npm run lint:check     # eslint, no writes
npm run lint           # eslint --fix
npm run format         # prettier --write .
npm run build          # electron-vite build (main + preload + renderer)
npm run e2e            # build, then Playwright-for-Electron specs (needs a GUI; CI: Windows only)
npm run build:win            # both Windows artifacts: nsis installer + portable
npm run build:win:portable   # the portable exe only
```

Gate before committing: `npm run typecheck && npm run lint:check && npm run test:coverage && npm run build`.

npm 12+ blocks install scripts unless `package.json` `allowScripts` names the package **at its
exact version**. Electron's postinstall is what downloads the Electron binary, so a blocked script
means `npm run dev`, `e2e` and `build:win` fail with no `node_modules/electron/dist`. After a bump
of `electron`, `electron-winstaller` or `esbuild`, run `npm install-scripts ls` and
`npm install-scripts approve <pkg>` to update the pins, then `npm ci` again.

## Stack

electron-vite · React 19 (classic JSX runtime — `import React`; return `React.ReactElement`) ·
TypeScript strict · MUI v9 + Emotion (style via `sx`, never styled-components) · Zustand ·
Zod · Vitest (dual node/jsdom projects). Core domain deps: **`@eriscorp/dalib-ts`** (DA binary
formats) and **`@eriscorp/hybindex-ts`** (world index). Package manager: **npm**.

## Layout

```text
src/
  main/       main process — the only code that touches disk. index.ts (lifecycle + userData
              path resolution), handlers.ts (+ registry), settingsManager.ts, jsonStore.ts,
              assetPacks.ts (.datf read/write), pathSafety.ts (assertInside*), schemas/ (Zod), splash.ts
  preload/    index.ts — typed contextBridge contract exposed as window.api. Imports `electron`
              and NOTHING else — any package import here breaks `sandbox: true` in the packaged
              app only (it builds and lints clean). See src/preload/index.ts.
  shared/     electron-free predicates main and the vitest node project both use (externalUrl.ts)
  renderer/src/
    App.tsx       ThemeProvider + CssBaseline; hydrates settingsStore then calls window.api.appReady()
    components/ pages/ hooks/ utils/ data/
    store/        zustand — settingsStore (owns persistence + hydration gate), uiStore
    themes/       6 DA themes (see below)
    packKinds/    the .datf content_type registry (see below)
    uiforge/      UI Layout Forge (ui_panels WYSIWYG editor)
```

Alias: `@renderer` → `src/renderer/src`. **`src/shared/` holds only electron-free predicates**
shared by main and the vitest **node** project (currently `externalUrl.ts`). Cross-cutting
_renderer_ types (`ThemeName`, `THEME_NAMES`, `PLAIN_CHROME_THEMES`) still live in
`store/settingsStore.ts` — do not migrate them. Adding a file there needs two glob edits:
`tsconfig.node.json` (loud — TS6307) and `vitest.config.mjs`'s node project (**silent** — the
suite is simply never collected and vitest still reports success).

## Load-bearing house patterns (don't reinvent)

- **`windowSecurity.ts` single-sources the renderer-boundary policy** (R-006). Three guards:
  a scheme allowlist on anything handed to `shell.openExternal`, a `will-navigate` guard that
  denies navigation away from our own bundle and denies every child window, and an `ipcMain`
  `Proxy` that accepts an IPC only from the top frame of a **registered** window at a **trusted**
  location. Three things follow. `registerHandlers` is the **only** call site that takes
  `guardIpc(ipcMain)` — a handler registered on the raw `ipcMain` silently opts out. Windows are
  registered **before** they load, because the guard fails closed. Trusted locations are built
  with `pathToFileURL`, never string concatenation — the failure mode is a **lockout** (every IPC
  refused, app dead on arrival), and `e2e/ipc-guard.spec.js` is the only thing that catches it.
- **Main owns all disk/IPC I/O; the renderer only calls the typed `window.api`.** The preload
  bridge is the contract — a new feature = handler → preload method → renderer call. `window.api`
  is **flat** (`window.api.loadSettings()`, `window.api.saveSettings()`, `window.api.appReady()`).
- **`pathSafety.ts`**: validate every renderer-supplied path against allowed roots before touching
  the FS. Never trust a path from the renderer.
- **Every IPC channel accounts for its payload.** A new handler either parses it —
  `parseOrLog(ctx, '<channel>', <schema>, payload)`, schemas in `src/main/schemas/` — or is added
  to `EXEMPT` in `src/main/__tests__/ipcSchemaCoverage.test.ts` with a category and a reason.
  That test reads `handlers.ts` and fails on an unclassified channel, so this is a decision you
  make, not one you can skip. The channel argument must be a **literal**; a variable is invisible
  to the check. The rule is whether the payload is written or executed, not whether it is a string.
- **Three tests read source rather than behaviour**, all in `src/main/__tests__/`, all for rules that
  are cheap to break, invisible in a diff and silent in every other gate. `ipcSchemaCoverage` (above);
  `clientFileCaseCoverage` — no Dark Ages archive name may be joined into a path, use
  `resolveClientFile` from `fsCase` so the casing comes from the directory (HTOO-287); and
  `editorRenameCoverage` — every editor offers rename, and no rename branch pre-checks with
  `window.api.exists`, because on Windows that answers case-insensitively and refuses a case-only
  rename (HTOO-379). Each asserts its walk found something: a glob matching nothing passes for the
  wrong reason. If you add one, prove it red by planting the fault, and make the failure name the file.
- **A client file is opened under the casing the disk uses.** `fsCase.ts` exists in both processes —
  `resolveClientFile(dir, name)` asks the directory. The installer writes `Legend.dat`; unpackers
  fold. Windows hides the difference, Linux and macOS do not, and the read usually throws into a
  `catch` that means "not present", so the feature degrades silently instead of failing.
- **Settings** live under `%LOCALAPPDATA%\Erisco\Taliesin` (win32 resolves `LOCALAPPDATA`
  directly; a legacy `%APPDATA%` dir is migrated on first run). `settingsStore` owns a **hydration
  gate**: persistence is blocked until the first disk load completes (guards against HMR /
  first-frame writes clobbering `settings.json` with defaults).
- **Splash + `app:ready` reveal handshake**: the main window is hidden until the renderer hydrates
  settings and calls `window.api.appReady()`.
- **Six themes** — `hybrasyl` (default), `chadul`, `danaan`, `grinneal`, plus the two corporate
  themes `mundanes` / `dubhaimid`. Corporate themes are "plain chrome" (`PLAIN_CHROME_THEMES`):
  the title bar swaps the gamified skull glyphs for flat MUI window icons and drops the text-shadow.
  All themes are wrapped in `responsiveFontSizes()`.

## Adding a `.datf` content type

The pack-kind system is data-driven — CreatePackDialog / PackEditor / AssetPackPage / IPC are all
kind-agnostic. To add one (checklist also in `packKinds/index.ts`):

1. Create `src/renderer/src/packKinds/<kind>.ts` exporting a `PackKind` (label, description,
   `dimension`, `parseSlot`, `nextAssetPath`, `coversSchema`, …). Model on a sibling: `staticTiles.ts`
   (numeric IDs), `worldMaps.ts` (named/prompted identity), `soundEffects.ts` (flat numeric namespace).
2. Register it in `packKinds/index.ts` (`PACK_KINDS`).
3. Add the literal to the `ContentType` union **and** `ALL_CONTENT_TYPES` in `packKinds/types.ts`.
4. Add the literal to `contentTypeSchema` in `src/main/schemas/pack.ts` (main-process validation).

No edits to the editor/dialog/IPC layers are needed.

## Verifying changes

`npm run dev` launches a real Electron window and **cannot run headless/sandboxed** — verify via
`npm run test:coverage`, `npm run typecheck`, and `npm run build`; hand GUI click-throughs to the
user, who runs the dev server themselves. `npm run e2e` (Playwright + Electron) also needs a GUI,
so hand it to the user too — CI runs it in a Windows-only `e2e` job.

## Releasing

Notes are authored in `CHANGELOG.md` under `## [Unreleased]`, not hand-edited on GitHub. Cutting a
release promotes that section and tags `vX.Y.Z`; `release.yml` runs `scripts/changelog-extract.mjs`
to seed the release body. See README "Releasing".

## MUI v9 gotchas

Prop APIs differ from v5–v7 and fail typecheck cryptically:

- `ListItemText` has no `primaryTypographyProps` — use `slotProps={{ primary: { … } }}`.
- `Stack`: `alignItems`/`justifyContent` go in `sx`, not top-level props.
- Icons v9 drops deprecated base names (e.g. use `HelpOutlineOutlined`, not `HelpOutline`).
- `Autocomplete`'s `renderInput` params carry **`slotProps`** (v5–v7 used `InputProps` +
  `inputProps`). Setting your own `slotProps` on the inner `TextField` _replaces_ that object and
  silently drops the classes/refs Autocomplete styles itself through — the field renders ~12px
  taller than a plain `size="small"` one and the popup anchors wrong. Always spread:
  `slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps?.htmlInput, … } }}`.

When unsure of a v9 prop shape, grep a sibling app (creidhne/elatha/oghma `src/renderer`) for the
working idiom rather than guessing.
