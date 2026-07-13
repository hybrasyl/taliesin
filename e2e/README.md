# E2E (Playwright + Electron)

End-to-end specs that drive the **built** app via Playwright's `_electron` launcher — the
house standard for cross-boundary behavior Vitest can't reach (disk round-trips, real window
geometry, full themed renders). Full rationale + patterns:
`Comhaigne/docs/architecture/e2e-playwright-electron.md`.

## Running

```bash
npm run e2e        # builds (electron-vite) then runs all specs
npm run e2e:only   # runs specs against the existing out/ build
```

Local-only for now. CI would need a virtual display (headed/xvfb), so this isn't in the
`release.yml` validate job yet.

## What's here

- **`helpers.js`** — the reusable harness:
  - `launchApp({ seedSettings?, localAppData? })` — launches the built app, strips
    `ELECTRON_RUN_AS_NODE`, and redirects `%LOCALAPPDATA%` to a temp dir so runs are hermetic.
    Reuse `localAppData` across two launches to test persistence.
  - `getMainWindow(app, { bridge? })` — skips the splash and returns the real main window. It
    finds it by the `window.electron` toolkit bridge (present on every sibling's preload, absent
    on the splash), then waits for `[data-testid="app-root"]`.
  - `readGeometry(app, page, selector?)` — native window bounds + a DOM element's on-screen
    left edge, for measuring layout/offsets (see the offset-spec pattern in the house doc).
- **`app-boot.spec.js`** — smoke: splash → main window revealed → hydrated UI on screen.

## Adapting / extending

- **`USERDATA_SUBPATH`** in `helpers.js` matches `src/main/index.ts`'s userData dir
  (`['Erisco', 'Taliesin']`).
- The specs rely on two hooks in the renderer: `data-testid="app-root"` (MainLayout root) and
  `data-testid="title-bar"` (TitleBar). Add more `data-testid`s as you add specs.
- **Not yet ported:** a settings-persistence spec (change theme → write hits disk → relaunch →
  hydrated). The template's version targets a different settings API and a Home theme selector;
  Taliesin exposes `window.api.loadSettings()` and sets the theme on the Settings page, so that
  spec needs a Taliesin-specific rewrite. Good future candidates (all have an `epona/e2e/`
  reference): settings persistence, theme-switch smoke (all themes render, no `pageerror`),
  window-geometry invariants, filesystem-effecting IPC flows against a temp dir.

## Gotchas

1. `ELECTRON_RUN_AS_NODE` set in env → Electron boots as plain Node and crashes at
   `app.setPath`. `launchApp` strips it.
2. Splash window → `firstWindow()` can grab it. `getMainWindow` selects by the preload bridge.
3. Main window is hidden until the renderer signals `app:ready` → wait for `isVisible()`.
4. Test the **built** app; rebuild after any `src/` change (`npm run e2e` does `build &&` first).
