import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.d.ts',
        '**/__tests__/**',
        'src/preload/**',
        '**/*.config.*',
      ],
      // Global floors sit just below current numbers so accidental regressions
      // in tested code trip the gate, but new untested code doesn't block work.
      // Phase 3 will raise these as components/hooks come under coverage.
      thresholds: {
        lines: 6.5,
        branches: 4.5,
        functions: 3.5,
        statements: 6.5,
        // Per-file thresholds lock in the wins for everything covered today.
        'src/main/settingsManager.ts':              { lines: 100, branches: 70, functions: 100, statements: 90 },
        'src/renderer/src/utils/duotone.ts':        { lines: 100, branches: 80, functions: 100, statements: 100 },
        'src/renderer/src/utils/variants.ts':       { lines: 95,  branches: 95, functions: 100, statements: 95 },
        'src/renderer/src/utils/mapEditorTools.ts': { lines: 99,  branches: 90, functions: 100, statements: 99 },
        'src/renderer/src/utils/mapXml.ts':         { lines: 95,  branches: 70, functions: 100, statements: 95 },
        'src/renderer/src/utils/worldMapXml.ts':    { lines: 95,  branches: 90, functions: 100, statements: 95 },
        'src/renderer/src/utils/paletteIO.ts':      { lines: 100, branches: 100, functions: 100, statements: 100 },
        'src/renderer/src/utils/presets.ts':        { lines: 100, branches: 100, functions: 100, statements: 100 },
      },
    },
  },
})
