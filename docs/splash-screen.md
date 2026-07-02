# Startup splash screen

On launch the main `BrowserWindow` is created hidden (`show: false`) and takes a
few seconds to become visible while the renderer bundle evaluates, React mounts,
and the async `loadSettings()` / `loadPacks()` work settles. Without a splash the
user sees **nothing at all** during that window and then the app pops in — which
reads as a hang.

The splash shows a small branded window **immediately** at boot and holds the
main window back until the renderer reports it has hydrated its settings, so the
first visible frame of the real UI is already populated (no flash of an empty
dashboard filling in).

## How it works

```
app.whenReady()
  ├─ createSplashWindow()   → frameless/transparent window, shown instantly
  └─ createWindow()         → main window, show: false, loads the bundle
        ⋯ a few seconds ⋯
  renderer settles loadSettings() → window.api.appReady()   (renderer → main)
  ipcMain.on('app:ready')  → ctx.onAppReady()  → revealMainWindow()
        └─ mainWindow.show() + focus(); splashWindow.destroy()
```

`revealMainWindow()` is guarded by a `mainWindowRevealed` flag so it runs once. A
**safety timeout** (`setTimeout(revealMainWindow, 15000)`) backstops a renderer
that throws before it can signal `app:ready`, so the app can never be left
permanently invisible.

Dismissal is deliberately tied to the **app-hydrated signal**, not the window's
`ready-to-show` event — `ready-to-show` fires as soon as the renderer paints its
first (empty) frame, which would defeat the "no empty flash" goal.

## Touch points

| File | Change |
| --- | --- |
| [`resources/splash.html`](../resources/splash.html) | Self-contained splash markup (inline CSS, no JS). References `./taliesin.png` (lives alongside it in `resources/`). |
| [`src/main/splash.ts`](../src/main/splash.ts) | `createSplashWindow()` — frameless, transparent, always-on-top, `skipTaskbar` window that `loadFile`s `splash.html`. |
| [`src/main/index.ts`](../src/main/index.ts) | Module-level `mainWindow` / `splashWindow` refs + `revealMainWindow()`; splash created before the main window in `whenReady`; the old `ready-to-show → show()` is removed; `ctx.onAppReady = revealMainWindow`; 15s safety timeout. |
| [`src/main/handlers.ts`](../src/main/handlers.ts) | `HandlerContext.onAppReady?` field + `ipcMain.on('app:ready', () => ctx.onAppReady?.())`. |
| [`src/preload/index.ts`](../src/preload/index.ts) | `appReady: () => ipcRenderer.send('app:ready')`. |
| [`src/renderer/src/env.d.ts`](../src/renderer/src/env.d.ts) | `appReady: () => void` on `TaliesinAPI`. |
| [`src/renderer/src/App.tsx`](../src/renderer/src/App.tsx) | Calls `window.api.appReady()` in the `loadSettings().then(...)` chain, right after `settingsLoaded.current = true`. |

Tests: `appReady` is listed in the mock API channel set
(`src/renderer/src/__tests__/setup/mockApi.ts`) and the preload channel-contract
snapshot (`src/preload/__tests__/preload.test.ts`); the latter also verifies the
`app:ready` send has a matching `ipcMain.on` handler.

## Packaging

No build config changes are needed. `resources/**` is already bundled and
`asarUnpack`ed (`electron-builder.yml`), and `publicDir: resolve('resources')`
copies it into `out/renderer/` too. The main process loads the splash with the
same `join(__dirname, '../../resources/...')` convention already proven by the
window icon, so the path resolves in both dev and packaged builds.

## Porting to Creidhne

Creidhne uses the same Electron + electron-vite + preload/contextBridge stack,
so the pattern drops in with minimal changes:

1. Copy `src/main/splash.ts` and `resources/splash.html` verbatim.
2. Swap the logo (`./taliesin.png` → Creidhne's logo in `resources/`) and the
   `TALIESIN` title in `splash.html`; adjust the palette if desired.
3. Add the `app:ready` IPC channel: `ipcMain.on('app:ready', …)` in the main
   handler module, `appReady: () => ipcRenderer.send('app:ready')` in the
   preload, and the type on the renderer API interface.
4. In the main window bootstrap, create the splash before the main window, remove
   any `ready-to-show → show()` auto-show, reveal on `app:ready`, and add the
   15s safety timeout.
5. Call `window.api.appReady()` once the renderer has loaded its settings.
6. Update the equivalent mock-API / preload snapshot tests.
