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
npm run e2e            # build, then Playwright-for-Electron specs (local only; needs a GUI)
npm run build:win:portable   # packaged portable Windows build
```

Gate before committing: `npm run typecheck && npm run lint:check && npm run test:coverage && npm run build`.

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
  preload/    index.ts — typed contextBridge contract exposed as window.api (+ window.electron toolkit bridge)
  renderer/src/
    App.tsx       ThemeProvider + CssBaseline; hydrates settingsStore then calls window.api.appReady()
    components/ pages/ hooks/ utils/ data/
    store/        zustand — settingsStore (owns persistence + hydration gate), uiStore
    themes/       6 DA themes (see below)
    packKinds/    the .datf content_type registry (see below)
    uiforge/      UI Layout Forge (ui_panels WYSIWYG editor)
```

Alias: `@renderer` → `src/renderer/src`. There is **no `src/shared`** — cross-cutting types
(e.g. `ThemeName`, `THEME_NAMES`, `PLAIN_CHROME_THEMES`) live in `store/settingsStore.ts`.

## Load-bearing house patterns (don't reinvent)

- **Main owns all disk/IPC I/O; the renderer only calls the typed `window.api`.** The preload
  bridge is the contract — a new feature = handler → preload method → renderer call. `window.api`
  is **flat** (`window.api.loadSettings()`, `window.api.saveSettings()`, `window.api.appReady()`).
- **`pathSafety.ts`**: validate every renderer-supplied path against allowed roots before touching
  the FS. Never trust a path from the renderer.
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
user, who runs the dev server themselves. `npm run e2e` (Playwright + Electron) also needs a GUI
and is local-only.

## Releasing

Notes are authored in `CHANGELOG.md` under `## [Unreleased]`, not hand-edited on GitHub. Cutting a
release promotes that section and tags `vX.Y.Z`; `release.yml` runs `scripts/changelog-extract.mjs`
to seed the release body. See README "Releasing".

## MUI v9 gotchas

Prop APIs differ from v5–v7 and fail typecheck cryptically:

- `ListItemText` has no `primaryTypographyProps` — use `slotProps={{ primary: { … } }}`.
- `Stack`: `alignItems`/`justifyContent` go in `sx`, not top-level props.
- Icons v9 drops deprecated base names (e.g. use `HelpOutlineOutlined`, not `HelpOutline`).

When unsure of a v9 prop shape, grep a sibling app (creidhne/elatha/oghma `src/renderer`) for the
working idiom rather than guessing.
