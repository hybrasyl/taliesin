// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RgbaFrame } from '@eriscorp/dalib-ts'
import { scaleNearest, exportFrameAsPng } from '../artExport'

vi.mock('../../utils/imageLoader', () => ({
  pixelBufferToPngBytes: vi.fn(
    async (buf: { width: number; height: number }) =>
      // Fake PNG bytes that encode the scaled dimensions so the test can assert them.
      new Uint8Array([buf.width, buf.height])
  )
}))

// A 2×1 frame: red pixel then green pixel.
const frame: RgbaFrame = {
  width: 2,
  height: 1,
  data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255])
} as RgbaFrame

describe('scaleNearest', () => {
  it('returns a 1× copy for scale 1', () => {
    const out = scaleNearest(frame, 1)
    expect(out.width).toBe(2)
    expect(out.height).toBe(1)
    expect(Array.from(out.data)).toEqual([255, 0, 0, 255, 0, 255, 0, 255])
  })

  it('duplicates each pixel by the scale factor (nearest neighbor)', () => {
    const out = scaleNearest(frame, 2)
    expect(out.width).toBe(4)
    expect(out.height).toBe(2)
    // Row 0: red, red, green, green
    expect(Array.from(out.data.slice(0, 16))).toEqual([
      255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255
    ])
    // Row 1 is identical to row 0 (vertical duplication).
    expect(Array.from(out.data.slice(16))).toEqual(Array.from(out.data.slice(0, 16)))
  })

  it('clamps a fractional/zero scale up to 1×', () => {
    expect(scaleNearest(frame, 0).width).toBe(2)
    expect(scaleNearest(frame, 0.5).width).toBe(2)
  })
})

describe('exportFrameAsPng', () => {
  beforeEach(() => {
    ;(window as unknown as { api: { writeBytes: ReturnType<typeof vi.fn> } }).api = {
      writeBytes: vi.fn(async () => undefined)
    }
  })

  it('scales the chosen frame and writes the PNG to destPath', async () => {
    await exportFrameAsPng([frame], 0, 4, '/pack/extstats_icon_normal.png')
    const writeBytes = (window as unknown as { api: { writeBytes: ReturnType<typeof vi.fn> } }).api
      .writeBytes
    expect(writeBytes).toHaveBeenCalledOnce()
    const [path, bytes] = writeBytes.mock.calls[0]
    expect(path).toBe('/pack/extstats_icon_normal.png')
    // Fake encoder returned [scaledWidth, scaledHeight] = [8, 4].
    expect(Array.from(bytes as Uint8Array)).toEqual([8, 4])
  })

  it('throws when the frame index is out of range', async () => {
    await expect(exportFrameAsPng([frame], 3, 1, '/pack/x.png')).rejects.toThrow(/out of range/)
  })
})
