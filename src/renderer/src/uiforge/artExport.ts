import type { RgbaFrame } from '@eriscorp/dalib-ts'
import type { PixelBuffer } from '../utils/duotone'
import { pixelBufferToPngBytes } from '../utils/imageLoader'

/**
 * Frame → PNG export for the art picker's legacy-.dat tab. The nearest-neighbor
 * scale core is lifted out of ArchivePreview's dialog-coupled exporter so it can
 * be reused (and unit-tested) here. Point-filtering keeps DA pixel art crisp at
 * 2×/4×, matching the client's own upscale.
 */

/** Integer nearest-neighbor upscale. `scale <= 1` returns a 1× copy. */
export function scaleNearest(frame: RgbaFrame, scale: number): PixelBuffer {
  const s = Math.max(1, Math.floor(scale))
  const { width: w, height: h } = frame
  const ow = w * s
  const oh = h * s
  const src = frame.data
  const out = new Uint8ClampedArray(ow * oh * 4)
  for (let y = 0; y < oh; y++) {
    const sy = Math.floor(y / s)
    for (let x = 0; x < ow; x++) {
      const sx = Math.floor(x / s)
      const si = (sy * w + sx) * 4
      const di = (y * ow + x) * 4
      out[di] = src[si]
      out[di + 1] = src[si + 1]
      out[di + 2] = src[si + 2]
      out[di + 3] = src[si + 3]
    }
  }
  return { data: out, width: ow, height: oh }
}

/**
 * Render one rendered frame at `scale` and write it as a PNG to `destPath`
 * (a path-guarded location under the pack project dir). Throws if the index is
 * out of range.
 */
export async function exportFrameAsPng(
  frames: RgbaFrame[],
  frameIndex: number,
  scale: number,
  destPath: string
): Promise<void> {
  const frame = frames[frameIndex]
  if (!frame) {
    throw new Error(`frame index ${frameIndex} out of range (${frames.length} frames)`)
  }
  const scaled = scaleNearest(frame, scale)
  const bytes = await pixelBufferToPngBytes(scaled)
  await window.api.writeBytes(destPath, bytes)
}
