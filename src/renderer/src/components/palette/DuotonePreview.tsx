import React, { useMemo } from 'react'
import { applyDuotone, PixelBuffer } from '../../utils/duotone'
import { compositeOnTop } from '../../utils/imageLoader'
import { PaletteEntry, DuotoneParams } from '../../utils/paletteTypes'
import PixelBufferCanvas from './PixelBufferCanvas'

interface Props {
  source: PixelBuffer | null
  entry: PaletteEntry
  params: DuotoneParams
  frame?: PixelBuffer | null
  size?: number
}

const DuotonePreview: React.FC<Props> = ({ source, entry, params, frame, size = 96 }) => {
  const buffer = useMemo(() => {
    if (!source) return null
    const duotoned = applyDuotone(source, entry, params)
    return frame ? compositeOnTop(duotoned, frame) : duotoned
  }, [source, entry, params, frame])
  return <PixelBufferCanvas buffer={buffer} size={size} />
}

export default DuotonePreview
