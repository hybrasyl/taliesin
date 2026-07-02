import React, { useMemo } from 'react'
import { PixelBuffer } from '../../utils/duotone'
import { compositeOnTop } from '../../utils/imageLoader'
import PixelBufferCanvas from './PixelBufferCanvas'

interface Props {
  source: PixelBuffer | null
  frame?: PixelBuffer | null
  size?: number
}

const RawPreview: React.FC<Props> = ({ source, frame, size = 64 }) => {
  const buffer = useMemo(
    () => (source ? (frame ? compositeOnTop(source, frame) : source) : null),
    [source, frame]
  )
  return <PixelBufferCanvas buffer={buffer} size={size} />
}

export default RawPreview
