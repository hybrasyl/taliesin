import React, { useEffect, useRef } from 'react'
import { applyDuotone, PixelBuffer } from '../../utils/duotone'
import { PaletteEntry, DuotoneParams } from '../../utils/paletteTypes'

interface Props {
  source: PixelBuffer | null
  entry: PaletteEntry
  params: DuotoneParams
  size?: number
}

const DuotonePreview: React.FC<Props> = ({ source, entry, params, size = 96 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !source) return
    canvas.width = source.width
    canvas.height = source.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const out = applyDuotone(source, entry, params)
    const imageData = ctx.createImageData(out.width, out.height)
    imageData.data.set(out.data)
    ctx.putImageData(imageData, 0, 0)
  }, [source, entry, params])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, imageRendering: 'pixelated', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4 }}
    />
  )
}

export default DuotonePreview
