import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.d.ts', '**/__tests__/**', 'src/preload/**', '**/*.config.*'],
      thresholds: {
        // Global floors — ratcheted to just under current coverage so the suite
        // guards against regression. Per-file floors below are set the same way
        // (current actual, small buffer); raise them as coverage improves.
        lines: 30,
        branches: 20,
        functions: 26,
        statements: 30,
        // index.ts is now a thin app-lifecycle shim (Phase 5 refactor).
        // The real handler bodies live in handlers.ts and are tested via
        // both ipc.handlers.test.ts (registry) and integration tests.
        'src/main/index.ts': { lines: 25, branches: 8, functions: 0, statements: 25 },
        'src/main/handlers.ts': { lines: 65, branches: 35, functions: 70, statements: 64 },
        'src/renderer/src/pages/ArchivePage.tsx': {
          lines: 85,
          branches: 69,
          functions: 75,
          statements: 82
        },
        'src/renderer/src/pages/AssetPackPage.tsx': {
          lines: 68,
          branches: 60,
          functions: 60,
          statements: 64
        },
        'src/renderer/src/pages/MusicPage.tsx': {
          lines: 44,
          branches: 35,
          functions: 28,
          statements: 40
        },
        'src/renderer/src/components/music/PacksPanel.tsx': {
          lines: 55,
          branches: 50,
          functions: 40,
          statements: 53
        },
        'src/main/settingsManager.ts': { lines: 98, branches: 92, functions: 93, statements: 95 },
        'src/renderer/src/utils/duotone.ts': {
          lines: 100,
          branches: 80,
          functions: 100,
          statements: 100
        },
        'src/renderer/src/utils/variants.ts': {
          lines: 95,
          branches: 95,
          functions: 100,
          statements: 95
        },
        'src/renderer/src/utils/mapEditorTools.ts': {
          lines: 99,
          branches: 90,
          functions: 100,
          statements: 99
        },
        'src/renderer/src/utils/mapXml.ts': {
          lines: 95,
          branches: 70,
          functions: 100,
          statements: 95
        },
        'src/renderer/src/utils/worldMapXml.ts': {
          lines: 95,
          branches: 90,
          functions: 100,
          statements: 95
        },
        'src/renderer/src/utils/paletteIO.ts': {
          lines: 88,
          branches: 100,
          functions: 85,
          statements: 88
        },
        'src/renderer/src/utils/presets.ts': {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100
        },
        'src/renderer/src/hooks/useCatalog.ts': {
          lines: 95,
          branches: 75,
          functions: 90,
          statements: 90
        },
        'src/renderer/src/hooks/useMusicLibrary.ts': {
          lines: 58,
          branches: 38,
          functions: 75,
          statements: 55
        },
        'src/renderer/src/hooks/useMusicPacks.ts': {
          lines: 92,
          branches: 60,
          functions: 90,
          statements: 90
        },
        'src/renderer/src/hooks/useUnsavedGuard.ts': {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100
        },
        // Now a thin selector wrapper — the state it used to own lives in
        // store/worldIndexStore.ts, which has its own floor below.
        'src/renderer/src/hooks/useWorldIndex.ts': {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100
        },
        'src/renderer/src/store/worldIndexStore.ts': {
          lines: 100,
          branches: 80,
          functions: 100,
          statements: 100
        },
        'src/renderer/src/utils/mapFileRel.ts': {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100
        },
        'src/renderer/src/components/assetpack/PackEditor.tsx': {
          lines: 92,
          branches: 80,
          functions: 88,
          statements: 91
        },
        'src/renderer/src/components/archive/ArchivePreview.tsx': {
          lines: 41,
          branches: 40,
          functions: 37,
          statements: 39
        },
        'src/renderer/src/components/mapmaker/MapEditorCanvas.tsx': {
          // drawDiamond moved out to mapRenderer.ts (now unit-tested there),
          // so this file's ratios shifted down slightly — floors track reality.
          lines: 37,
          branches: 25,
          functions: 32,
          statements: 34
        }
      }
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
            // src/shared holds electron-free predicates main and this project
            // both use. Omitting this glob does not error -- the suite is simply
            // never collected and vitest still reports success.
            'src/shared/**/__tests__/**/*.test.ts',
            'src/renderer/src/utils/__tests__/**/*.test.ts',
            'src/renderer/src/packKinds/__tests__/**/*.test.ts',
            'src/renderer/src/uiforge/__tests__/**/*.test.ts',
            // data/ holds pure model helpers (filename rules, the town subzone
            // registry). It was added in HTOO-344 and matched no glob here, so
            // its suite was collected by neither project and ran for the first
            // time in HTOO-356 -- exactly the silent failure the notes on
            // src/shared and themes/ warn about. Third time; read those notes.
            'src/renderer/src/data/__tests__/**/*.test.ts',
            'scripts/**/*.test.mjs'
          ],
          // mapXml/worldMapXml/panelXml use DOMParser → jsdom project picks them up instead.
          exclude: [
            'src/renderer/src/utils/__tests__/mapXml.test.ts',
            'src/renderer/src/utils/__tests__/worldMapXml.test.ts',
            'src/renderer/src/uiforge/__tests__/panelXml.test.ts'
          ]
        }
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: [
            'src/renderer/src/utils/__tests__/mapXml.test.ts',
            'src/renderer/src/utils/__tests__/worldMapXml.test.ts',
            'src/renderer/src/uiforge/__tests__/panelXml.test.ts',
            'src/renderer/src/__tests__/**/*.test.{ts,tsx}',
            'src/renderer/src/hooks/__tests__/**/*.test.{ts,tsx}',
            'src/renderer/src/store/__tests__/**/*.test.{ts,tsx}',
            'src/renderer/src/components/**/__tests__/**/*.test.{ts,tsx}',
            // Adding a test directory that matches NO glob here fails silently:
            // vitest collects nothing and still reports success. themes/ was
            // uncovered until HTOO-341.
            'src/renderer/src/themes/__tests__/**/*.test.{ts,tsx}'
          ],
          setupFiles: ['./src/renderer/src/__tests__/setup/vitest.setup.ts']
        }
      }
    ]
  }
})
