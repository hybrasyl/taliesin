import '@testing-library/jest-dom/vitest'
import 'vitest-canvas-mock'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

// vitest-canvas-mock doesn't polyfill toBlob; component tests that exercise
// PNG export expect a valid Blob. Provide a minimal one.
if (typeof HTMLCanvasElement !== 'undefined' && !HTMLCanvasElement.prototype.toBlob) {
  HTMLCanvasElement.prototype.toBlob = function (callback: BlobCallback) {
    callback(new Blob([new Uint8Array([0])], { type: 'image/png' }))
  }
} else if (typeof HTMLCanvasElement !== 'undefined') {
  // Override even if present, to ensure tests get a deterministic Blob
  HTMLCanvasElement.prototype.toBlob = function (callback: BlobCallback) {
    callback(new Blob([new Uint8Array([0])], { type: 'image/png' }))
  }
}
