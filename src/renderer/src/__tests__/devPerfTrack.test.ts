import { describe, it, expect, vi } from 'vitest'

/**
 * Guards the mechanism, not React's behaviour.
 *
 * `devPerfTrack` disables React's dev component performance track by removing
 * `console.timeStamp` before `react-dom` feature-detects it. If someone drops
 * the import from `main.tsx`, moves it below `react-dom`, or changes the env
 * gate, the Archive page and Map Maker become unusable in `npm run dev` again —
 * and nothing else would catch it, because the failure only shows up in a real
 * Electron window with a large `.dat` open.
 *
 * What this cannot catch: React changing how it detects user timing. If that
 * happens the guard silently stops working. The structural defence for the
 * worst offender is `store/archiveStore.ts`, which keeps the archive out of
 * props regardless.
 */
describe('devPerfTrack', () => {
  it('removes the hook React feature-detects, and leaves performance.measure alone', async () => {
    const original = console.timeStamp
    try {
      vi.resetModules()
      await import('../devPerfTrack')

      // React's check is `typeof console.timeStamp === 'function'`.
      expect(typeof (console as { timeStamp?: unknown }).timeStamp).not.toBe('function')
      // It also checks performance.measure, which other tooling uses — leaving
      // that intact is deliberate, so only React's track is affected.
      expect(typeof performance.measure).toBe('function')
    } finally {
      console.timeStamp = original
    }
  })

  it('is imported before react-dom in the renderer entry', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    // jsdom's import.meta.url is not a file URL; resolve from the repo root,
    // which is vitest's cwd.
    const entry = fs.readFileSync(path.join(process.cwd(), 'src/renderer/src/main.tsx'), 'utf8')

    const perfTrack = entry.indexOf("import './devPerfTrack'")
    const reactDom = entry.indexOf("from 'react-dom/client'")

    expect(perfTrack).toBeGreaterThanOrEqual(0)
    expect(reactDom).toBeGreaterThanOrEqual(0)
    // ES modules evaluate in import order. Below react-dom, the delete lands
    // after the feature detection has already run and does nothing.
    expect(perfTrack).toBeLessThan(reactDom)
  })
})
