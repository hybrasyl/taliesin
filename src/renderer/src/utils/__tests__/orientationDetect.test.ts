import { describe, it, expect } from 'vitest'
import { detectOrientation } from '../orientationDetect'
import { PixelBuffer } from '../duotone'

/** Fully opaque filled square. */
function squareSource(size: number): PixelBuffer {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 120
    data[i + 1] = 120
    data[i + 2] = 120
    data[i + 3] = 255
  }
  return { data, width: size, height: size }
}

/** Opaque diamond inscribed in the cell; transparent corner triangles. */
function diamondSource(width: number, height: number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4)
  const halfW = width / 2
  const halfH = height / 2
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = Math.abs(x + 0.5 - halfW) / halfW
      const dy = Math.abs(y + 0.5 - halfH) / halfH
      const i = (y * width + x) * 4
      if (dx + dy <= 1) {
        data[i] = 200
        data[i + 1] = 100
        data[i + 2] = 50
        data[i + 3] = 255
      }
      // else leave transparent (alpha 0)
    }
  }
  return { data, width, height }
}

describe('detectOrientation', () => {
  it('classifies a filled square as orthogonal', () => {
    const r = detectOrientation(squareSource(32))
    expect(r.orientation).toBe('orthogonal')
    expect(r.cornerAlpha).toBeCloseTo(255, 0)
  })

  it('classifies an inscribed diamond as isometric', () => {
    const r = detectOrientation(diamondSource(56, 27))
    expect(r.orientation).toBe('isometric')
    expect(r.cornerAlpha).toBeLessThan(r.diamondAlpha)
  })

  it('reports high confidence at the extremes', () => {
    expect(detectOrientation(squareSource(32)).confidence).toBeGreaterThan(0.9)
    expect(detectOrientation(diamondSource(56, 27)).confidence).toBeGreaterThan(0.9)
  })

  it('honours a custom threshold', () => {
    // A square has isoScore ≈ 0; a threshold of 0 forces the isometric branch.
    const r = detectOrientation(squareSource(16), { threshold: 0 })
    expect(r.orientation).toBe('isometric')
  })

  it('treats a fully transparent cell as orthogonal (no diamond signal)', () => {
    const blank: PixelBuffer = {
      data: new Uint8ClampedArray(16 * 16 * 4),
      width: 16,
      height: 16
    }
    expect(detectOrientation(blank).orientation).toBe('orthogonal')
  })
})
