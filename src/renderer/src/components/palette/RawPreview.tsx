import React, { useEffect, useRef } from 'react'
import { PixelBuffer } from '../../utils/duotone'
import { compositeOnTop } from '../../utils/imageLoader'

interface Props {
  source: PixelBuffer | null
  frame?: PixelBuffer | null
  size?: number
}

const RawPreview: React.FC<Props> = ({ source, frame, size = 64 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !source) return
    canvas.width = source.width
    canvas.height = source.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const composed = frame ? compositeOnTop(source, frame) : source
    const imageData = ctx.createImageData(composed.width, composed.height)
    imageData.data.set(composed.data)
    ctx.putImageData(imageData, 0, 0)
  }, [source, frame])

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

export default RawPreview
