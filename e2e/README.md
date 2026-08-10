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

Also runs in CI, in its own `e2e` job on `windows-latest` (see `.github/workflows/ci.yml`).
The job is Windows-only for a concrete reason rather than a preference: `src/main/index.ts`
resolves userData from `%LOCALAPPDATA%` on win32 and from `app.getPath('appData')` elsewhere,
so the redirect that makes `launchApp` hermetic does nothing off Windows.

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
- **`ipc-guard.spec.js`** — the IPC guard accepts the real window and refuses everything else.
  The only check that catches a trusted-location lockout.
- **`preload-sandbox.spec.js`** — the preload runs under `sandbox: true`, which a package
  import there breaks in the packaged app only.
- **`settings-persistence.spec.js`** — a theme picked in Settings survives a relaunch, and an
  existing `settings.json` is not clobbered with defaults on startup (the hydration gate).
- **`theme-switch.spec.js`** — all six themes apply with no `pageerror`, each repaints, and the
  `PLAIN_CHROME_THEMES` branch swaps the title bar chrome.

## Adapting / extending

- **`USERDATA_SUBPATH`** in `helpers.js` matches `src/main/index.ts`'s userData dir
  (`['Erisco', 'Taliesin']`).
- The specs rely on these hooks in the renderer: `app-root` (MainLayout), `title-bar` and
  `app-title` (TitleBar), `nav-settings` (NavToolbar), `settings-page` (SettingsPage) and
  `theme-option-<ThemeName>` (ThemePicker). Add a `data-testid` when a spec needs it, not as a
  sweep — a testid with no spec behind it is an untested claim about what matters.
- **Selecting on MUI's own icon testids does not work here.** `createSvgIcon` emits
  `data-testid="CloseIcon"` only when `NODE_ENV !== 'production'`, and these specs run against a
  production build. The jsdom unit suite can use them; e2e cannot.
- **Still open:** filesystem-effecting IPC flows against a temp directory — the handlers
  `pathSafety` protects, none of which is covered end to end. `epona/e2e/` has a reference.
- **Not applicable here:** window-geometry invariants across a relaunch. Taliesin does not
  persist window bounds; `createWindow` opens at a fixed 1280×800 every time and only `maximize`
  touches geometry. There is nothing to survive a restart, so that spec would assert a constant.

## Gotchas

1. `ELECTRON_RUN_AS_NODE` set in env → Electron boots as plain Node and crashes at
   `app.setPath`. `launchApp` strips it.
2. Splash window → `firstWindow()` can grab it. `getMainWindow` selects by the preload bridge.
3. Main window is hidden until the renderer signals `app:ready` → wait for `isVisible()`.
4. Test the **built** app; rebuild after any `src/` change (`npm run e2e` does `build &&` first).
