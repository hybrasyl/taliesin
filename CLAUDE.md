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
  `docs/plans/brigid/reference/asset-pack-format.md` — the authoritative registry of `content_type`s.

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

npm 12+ runs a dependency's install script only when `package.json` `allowScripts` approves it. Approve **by name**, not `pkg@version`: a pinned approval stops matching at the next bump (HTOO-542). Since Electron 42 the `electron` package has no install script, so the project's own `postinstall` runs `install-electron` to download the binary (`electron-vite dev` does not download it on first use). If `node_modules/electron/dist` is missing, `npm run dev`, `e2e` and `build:win` fail: run `npx install-electron`. After a dependency change, `npm install-scripts ls` must report nothing unreviewed.

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
              assetPacks.ts (.datf read/write), pathSafety.ts (assertInside*), schemas/ (Zod), splash.ts,
              portableSweep.ts (removes the %TEMP% unpack folders a killed portable launch leaves;
              takes `original-fs`, never `fs`, which opens a leftover's app.asar and locks it)
  preload/    index.ts — typed contextBridge contract exposed as window.api. Imports `electron`
              and NOTHING else — any package import here breaks `sandbox: true` in the packaged
              app only (it builds and lints clean). See src/preload/index.ts.
  shared/     electron-free code main, the renderer and the vitest node project use: externalUrl.ts,
              appIdentity.ts (Report Issue + update check), updateVersion.ts (update-check module),
              types.ts (ThemeName, THEME_NAMES)
  renderer/src/
    App.tsx       ThemeProvider + CssBaseline; hydrates settingsStore then calls window.api.appReady()
    components/ pages/ hooks/ utils/ data/
    store/        zustand — settingsStore (owns persistence + hydration gate), uiStore
    themes/       6 DA themes, copied from the house template (see below)
    lib/          contrast.ts (the house WCAG helper the theme and chrome tests use)
    packKinds/    the .datf content_type registry (see below)
    uiforge/      UI Layout Forge (ui_panels WYSIWYG editor)
```

Aliases: `@renderer` → `src/renderer/src` and `@shared` → `src/shared`, in `electron.vite.config.mjs`, `tsconfig.web.json` and `vitest.config.mjs`. App code imports relatively in practice; the house modules (themes, title bar, theme gallery) import through the aliases, because they are copied from the template with no edit. **`src/shared/` holds only electron-free code**: no electron or node imports, because main, the renderer (relative imports; `tsconfig.web.json` includes it) and the vitest **node** project all load it. `appIdentity.ts` is there because `scripts/publish-version.mjs` reads `updateKey` from `src/shared/appIdentity.ts`. `ThemeName` and `THEME_NAMES` live in `src/shared/types.ts`, because the house modules import them from `@shared/types`; `store/settingsStore.ts` re-exports them. `PLAIN_CHROME_THEMES` lives in `components/titleChrome.ts` (HTOO-572). Both tsconfigs include `src/shared/**` already; a test there is collected only by the `src/shared/**/__tests__` glob in `vitest.config.mjs`'s node project (**silent** if a new layout misses it — the suite is never collected and vitest still reports success).

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
- **The renderer never reads a Node global.** The window runs `sandbox: true`, so `process`, `Buffer`, `require`, `__dirname` and `__filename` are undefined there, and a page that reads one throws on render. vitest runs in Node, where they exist, so no unit test sees it. Two checks do (HTOO-393): `src/renderer/src/__tests__/rendererNodeGlobals.test.ts` reads the source, and `e2e/nav-pages.spec.js` opens every page in `PAGES` in the built app. The renderer reads the platform from `window.api.platform`, which the preload sets (the document repo's `docs/architecture/macos-chrome.md`).
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
- **Six themes** — `hybrasyl` (default), `chadul`, `danaan`, `grinneal`, plus the two corporate themes `mundanes` / `dubhaimid`. They are the house template's files, byte for byte (HTOO-572), with `filledControls.ts`, `augmentation.ts`, `baseTypography.ts`, `plainTypography.ts` and `index.ts`. Each theme adds one line: `...taliesinOverrides` after `...filledControls`. Taliesin's own overrides are in `themes/taliesinOverrides.ts` (today the tooltip as a card), and `taliesinOverrides.test.ts` checks that each theme carries them. An override must not set `MuiButtonBase` or `MuiAlert`. To take a new palette, copy the template's files again and put the spread line back. The template's palette, chip, filled-control and chrome tests are copied too: change the template first, then port.
- **The title bar is the house title-bar v1 module**: `components/TitleBar.tsx` and `components/titleChrome.ts`, copied with no edit. `components/AppTitleBar.tsx` wires it to the theme, `taliesin.webp`, the product name, `window.api.platform` and the window calls. The corporate themes are "plain chrome" (`PLAIN_CHROME_THEMES`, in `titleChrome.ts`): flat MUI window icons and no text-shadow. The four decorated themes have dark bars with light text and a black keyline; danaan's bar is bronze and grinneal's brown. Nothing is engraved. The close button hovers to `error.main`. The nav bar (`NavToolbar.tsx`) is Taliesin's own second bar. The title bar paints `secondary.main` and the nav bar `tertiary.main` (HTOO-629), so the two read as two bars; the nav bar's text and icons keep `secondary.contrastText`, which `tertiary.contrastText` repeats (`themes/__tests__/tertiary.test.ts`). Each button takes the house `navButtonSx(chromeKind(theme), isCurrent)` from `titleChrome.ts` (the bar's text colour, the house hover, and the current-page mark: a light wash and an inset ring), and keeps only its own glyph size and spacing. `navBarContrast.test.tsx` checks it, and fails on any faded part of the bar.
- **The editor shell is the house editor-shell v1 module**: `components/editorShell/` (`EditorPageShell.tsx`, `EditorHeader.tsx`, `EditorAlerts.tsx`, `selectionActions.ts` and their tests), copied from the template with no edit (HTOO-637). Change the template first, then copy the files again. Taliesin's own parts are thin wrappers: `components/shared/EditorFileListPanel.tsx` gives the shell Taliesin's list (filter, set headers, folder tree, arrow keys) and the open file as a selection of one, and `components/shared/EditorHeader.tsx` gives the header Taliesin's `FolderSelect`. The Maps and World Maps pages use the wrappers. The header's default save sentence is Taliesin's: a save moves the file.
- **Call-site rules for the palette**: `secondary` is the bar colour, a fill only — never text or an outline on the page. A bar's text is `secondary.contrastText`. `primary.light` is not text on a light theme; use `primary.main`. A status fill is `main` with `contrastText`; a `.dark` fill takes `getContrastText(.dark)`. **Settings → Appearance → Theme gallery** (`pages/ThemeGallery.tsx`) shows each control in the active theme with its measured contrast; `e2e/theme-gallery.spec.js` writes the low ratios to `theme-gallery.json`.

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
user, who runs the dev server themselves.

Run `npm run e2e` (Playwright + Electron) yourself as part of the work, on the Windows dev box: it launches and closes its own windows, and needs no click from the user. Unset `ELECTRON_RUN_AS_NODE` first (the agent shell sets it). A throwaway script under Electron goes through `node scripts/run-electron.mjs <script>`, which removes the variable itself (HTOO-612). An npm script that runs a script under Electron calls that helper, never a bare `electron <script>`, because npm runs scripts through cmd.exe on Windows and cmd.exe has no `unset`. Hand only the Linux and Mac runs to the user, in the end-of-release pass. An agent on the Mac or Linux box follows `docs/release-checks-mac-linux.md`. CI runs e2e in a Windows-only `e2e` job.

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
