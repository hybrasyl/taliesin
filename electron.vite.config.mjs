import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    // './' is required for file:// in production; '/' is required for HMR in dev
    base: command === 'build' ? './' : '/',
    // No publicDir. The scaffold pointed it at resources/, which copied that
    // whole tree verbatim into out/renderer -- and because electron-builder also
    // asarUnpacks resources/**, every file in it shipped twice. The renderer
    // references nothing there: splash.html and the window icon are loaded by
    // the MAIN process via join(__dirname, '../../resources/...'), which reads
    // the asarUnpacked copy, and the renderer's own logo is imported from
    // src/renderer/src/assets/ and hashed into the bundle by vite.
    // Do not re-add a publicDir pointed at resources/ -- it silently restores
    // the double-ship. See the document repo's ecosystem-rollout-checklist.md R-002.
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      hmr: true
    },
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        external: []
      }
    }
  }
}))
