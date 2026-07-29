/**
 * Disables React's development-only "component performance track" unless it is
 * explicitly asked for.
 *
 * **This module must be imported before `react-dom`.** ES modules evaluate in
 * import order, so the first import in `main.tsx` runs this file's body before
 * `react-dom/client` is evaluated. That ordering is the whole mechanism — see
 * below.
 *
 * ## Why
 *
 * React 19.2's development build emits a `performance.measure` per commit for
 * the DevTools "Components ⚛" track. To build each measure's detail it **diffs
 * the props of every re-rendered component**: any prop whose identity changed is
 * walked to a depth of 3, and the walk enumerates own keys with `for...in`.
 *
 * Taliesin's props carry Dark Ages binaries. A `Uint8Array` has own enumerable
 * index properties, so that walk emits **one row per byte** — for `ia.dat`, tens
 * of millions of rows, twice (removed + added). The renderer heap reaches ~4 GB
 * and V8 dies. Smaller payloads (a `.map` file buffer, a `MapFile`'s tile array)
 * do not crash but stall every commit.
 *
 * Affected props are spread across the app — `MapAssets` (which holds all of
 * `TILEA.BMP` plus the `ia.dat` archive), `fileBuffer` on the map canvases,
 * `mapFile` on the Map Maker canvas. A bare `Uint8Array` prop cannot be hidden
 * from the walk by any local trick: its indices are exotic own enumerable
 * properties. Turning the track off is the only fix that covers all of them.
 *
 * ## How
 *
 * React feature-detects the track once, at module scope:
 *
 * ```js
 * supportsUserTiming =
 *   typeof console !== 'undefined' && typeof console.timeStamp === 'function' &&
 *   typeof performance !== 'undefined' && typeof performance.measure === 'function'
 * ```
 *
 * `console.timeStamp` is an optional, non-standard profiling hook that nothing
 * in this app uses. Removing it before `react-dom` loads makes the detection
 * fail, and every call site in the track becomes a no-op. **No React internals
 * are patched** — we simply do not offer an API it probes for. `performance.measure`
 * is left alone; other tooling uses it.
 *
 * ## Getting the track back
 *
 * Run with `VITE_REACT_PERF_TRACK=1`. Expect the Archive page and the Map Maker
 * to be slow or to crash the renderer — that is the bug this guard exists for,
 * not a regression.
 *
 * ## Production
 *
 * A no-op. The instrumentation only exists in React's development build, and
 * `import.meta.env.DEV` is false in a packaged app, so this never runs there.
 *
 * See `docs/plans/archive-preview-dev-oom.md`.
 */

// `lib.dom` types `timeStamp` as required, so narrow through a local view of the
// console rather than augmenting the global interface.
type OptionalTimeStamp = { timeStamp?: (label?: string) => void }

if (import.meta.env.DEV && !import.meta.env.VITE_REACT_PERF_TRACK) {
  const c = console as unknown as OptionalTimeStamp
  if (typeof c.timeStamp === 'function') delete c.timeStamp
}

export {}
