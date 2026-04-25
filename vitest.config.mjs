import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
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
      thresholds: {
        lines: 21,
        branches: 12,
        functions: 18,
        statements: 19,
        // index.ts is now a thin app-lifecycle shim (Phase 5 refactor).
        // The real handler bodies live in handlers.ts and are tested via
        // both ipc.handlers.test.ts (registry) and integration tests.
        'src/main/index.ts':                        { lines: 25, branches: 8,  functions: 0,  statements: 25 },
        'src/main/handlers.ts':                     { lines: 60, branches: 30, functions: 65, statements: 60 },
        'src/main/settingsManager.ts':              { lines: 100, branches: 70, functions: 100, statements: 90 },
        'src/renderer/src/utils/duotone.ts':        { lines: 100, branches: 80, functions: 100, statements: 100 },
        'src/renderer/src/utils/variants.ts':       { lines: 95,  branches: 95, functions: 100, statements: 95 },
        'src/renderer/src/utils/mapEditorTools.ts': { lines: 99,  branches: 90, functions: 100, statements: 99 },
        'src/renderer/src/utils/mapXml.ts':         { lines: 95,  branches: 70, functions: 100, statements: 95 },
        'src/renderer/src/utils/worldMapXml.ts':    { lines: 95,  branches: 90, functions: 100, statements: 95 },
        'src/renderer/src/utils/paletteIO.ts':      { lines: 100, branches: 100, functions: 100, statements: 100 },
        'src/renderer/src/utils/presets.ts':        { lines: 100, branches: 100, functions: 100, statements: 100 },
        'src/renderer/src/hooks/useCatalog.ts':       { lines: 95,  branches: 75, functions: 90, statements: 90 },
        'src/renderer/src/hooks/useMusicLibrary.ts':  { lines: 58,  branches: 38, functions: 75, statements: 55 },
        'src/renderer/src/hooks/useMusicPacks.ts':    { lines: 92,  branches: 60, functions: 90, statements: 90 },
        'src/renderer/src/hooks/useUnsavedGuard.ts':  { lines: 100, branches: 100, functions: 85, statements: 95 },
        'src/renderer/src/hooks/useWorldIndex.ts':    { lines: 100, branches: 100, functions: 100, statements: 100 },
        'src/renderer/src/components/assetpack/PackEditor.tsx':         { lines: 98, branches: 80, functions: 95, statements: 95 },
        'src/renderer/src/components/archive/ArchivePreview.tsx':       { lines: 58, branches: 48, functions: 43, statements: 52 },
        'src/renderer/src/components/mapmaker/MapEditorCanvas.tsx':     { lines: 38, branches: 25, functions: 33, statements: 35 },
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'src/main/**/__tests__/**/*.test.ts',
            'src/preload/**/__tests__/**/*.test.ts',
            'src/renderer/src/utils/__tests__/**/*.test.ts',
          ],
          // mapXml/worldMapXml use DOMParser → jsdom project picks them up instead.
          exclude: [
            'src/renderer/src/utils/__tests__/mapXml.test.ts',
            'src/renderer/src/utils/__tests__/worldMapXml.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: [
            'src/renderer/src/utils/__tests__/mapXml.test.ts',
            'src/renderer/src/utils/__tests__/worldMapXml.test.ts',
            'src/renderer/src/__tests__/**/*.test.{ts,tsx}',
            'src/renderer/src/hooks/__tests__/**/*.test.{ts,tsx}',
            'src/renderer/src/components/**/__tests__/**/*.test.{ts,tsx}',
          ],
          setupFiles: ['./src/renderer/src/__tests__/setup/vitest.setup.ts'],
        },
      },
    ],
  },
})
