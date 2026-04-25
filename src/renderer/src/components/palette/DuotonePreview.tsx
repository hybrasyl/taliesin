import React, { useEffect, useRef } from 'react'
import { applyDuotone, PixelBuffer } from '../../utils/duotone'
import { compositeOnTop } from '../../utils/imageLoader'
import { PaletteEntry, DuotoneParams } from '../../utils/paletteTypes'

interface Props {
  source: PixelBuffer | null
  entry: PaletteEntry
  params: DuotoneParams
  frame?: PixelBuffer | null
  size?: number
}

const DuotonePreview: React.FC<Props> = ({ source, entry, params, frame, size = 96 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !source) return
    canvas.width = source.width
    canvas.height = source.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const duotoned = applyDuotone(source, entry, params)
    const composed = frame ? compositeOnTop(duotoned, frame) : duotoned
    const imageData = ctx.createImageData(composed.width, composed.height)
    imageData.data.set(composed.data)
    ctx.putImageData(imageData, 0, 0)
  }, [source, entry, params, frame])

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

export default DuotonePreview
