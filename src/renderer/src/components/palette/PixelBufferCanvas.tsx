import React, { useEffect, useRef } from 'react'
import { PixelBuffer } from '../../utils/duotone'

/**
 * Renders a PixelBuffer to a pixelated canvas. Shared by RawPreview and
 * DuotonePreview, which differ only in how they compute the buffer. Leaves the
 * previous frame in place when `buffer` is null (matches the old behaviour).
 */
const PixelBufferCanvas: React.FC<{ buffer: PixelBuffer | null; size?: number }> = ({
  buffer,
  size = 64
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !buffer) return
    canvas.width = buffer.width
    canvas.height = buffer.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const imageData = ctx.createImageData(buffer.width, buffer.height)
    imageData.data.set(buffer.data)
    ctx.putImageData(imageData, 0, 0)
  }, [buffer])

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: size,
        height: size,
        imageRendering: 'pixelated',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 4
      }}
    />
  )
}

export default PixelBufferCanvas
