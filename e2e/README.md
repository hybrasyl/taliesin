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
- **`theme-switch.spec.js`** — all eight themes apply with no `pageerror`, each repaints, and the
  `PLAIN_CHROME_THEMES` branch swaps the title bar chrome.
- **`pack-filesystem.spec.js`** — a write-effecting IPC flow against a temp dir: creating a pack
  writes its project file and asset directory through `pack:save` + `fs:ensureDir`, and a path
  outside every allowed root is refused. Seeding `packDir` in settings makes it an allowed root
  (`applySettingsRoots`), which is what keeps the OS directory picker out of the way.
- **`nav-pages.spec.js`** — clicks every page in `PAGES` (`store/uiStore.ts`) and asserts its `page-<page>` marker, no error-boundary fallback and no `pageerror`. A failure names the page. A new page is covered with no edit (HTOO-393). A page with no nav button (the theme gallery) is in its `SUBPAGES` list.
- **`title-bar.spec.js`** — the title bar's layout per platform: the macOS stoplight inset, and the window controls elsewhere.
- **`theme-gallery.spec.js`** — opens Settings → Appearance → Theme gallery, selects each theme, and reads every measured contrast. It fails on a sample it cannot measure, not on a low ratio. It writes each low ratio to `theme-gallery.json` in the test's output folder (HTOO-572).
- **`app-menu.spec.js`** — macOS only: the installed application menu, and a Go command's round trip through the renderer.
- **`page-toolbar.spec.js`** — at the minimum window (1024 px), every control of the Maps and World Maps page toolbars is inside the toolbar, and the map canvas is at least 400 px wide. It seeds a world with one map and one world map, and opens each, so the item actions show at their enabled widths (HTOO-633, from Creidhne's HTOO-628 spec).
- **`map-staging.spec.js`** — stages a map and checks the move on disk, with the dialog that lists a live referrer. Then it renames the staged map, and checks that the warp in a staged map is repaired and marked staged in the dialog. Then it releases the map (HTOO-634, HTOO-635).
- **`index-caches.spec.js`** — Settings → World indexes finds the old index caches and removes only those.

### What automation cannot reach

- **A page's body behind a client path or a library.** The specs run with an empty profile, so most pages render their "nothing set" state. `nav-pages.spec.js` catches a fault on every path a page takes with no settings: the component's top, its hooks, its empty state. It does not reach code that runs only when real Dark Ages files are loaded. For a Node global there, `src/renderer/src/__tests__/rendererNodeGlobals.test.ts` reads the source. For any other fault there, a person opens the page with a real client.

## Adapting / extending

- **`USERDATA_SUBPATH`** in `helpers.js` matches `src/main/index.ts`'s userData dir
  (`['Erisco', 'Taliesin']`).
- The specs rely on these hooks in the renderer: `app-root` (MainLayout), `title-bar` (the house TitleBar; the wordmark is its one `h6`), `nav-<page>` on every page button (NavToolbar), `page-<page>` (PageRenderer), `error-boundary-fallback` (ErrorBoundary), `settings-page` (SettingsPage), `theme-gallery-page` (ThemeGallery), `gallery-ratio` (each measured sample in the gallery) and `theme-option-<ThemeName>` (ThemePicker). Add a `data-testid` when a spec needs it, not as a sweep — a testid with no spec behind it is an untested claim about what matters.
- **Prefer a role or label selector where one exists**; reach for a testid when it does not. If a
  control has no accessible name to select by, that is usually worth fixing rather than working
  around — `pack-filesystem.spec.js` turned up a `Select` with no `labelId`, which screen readers
  announced as its value alone.
- **Selecting on MUI's own icon testids does not work here.** `createSvgIcon` emits
  `data-testid="CloseIcon"` only when `NODE_ENV !== 'production'`, and these specs run against a
  production build. The jsdom unit suite can use them; e2e cannot.
- **Not applicable here:** window-geometry invariants across a relaunch. Taliesin does not
  persist window bounds; `createWindow` opens at a fixed 1280×800 every time and only `maximize`
  touches geometry. There is nothing to survive a restart, so that spec would assert a constant.

## Gotchas

1. `ELECTRON_RUN_AS_NODE` set in env → Electron boots as plain Node and crashes at
   `app.setPath`. `launchApp` strips it.
2. Splash window → `firstWindow()` can grab it. `getMainWindow` selects by the preload bridge.
3. Main window is hidden until the renderer signals `app:ready` → wait for `isVisible()`.
4. Test the **built** app; rebuild after any `src/` change (`npm run e2e` does `build &&` first).
