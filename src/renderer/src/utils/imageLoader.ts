import { PixelBuffer } from './duotone'

// Read PNG bytes via IPC and decode through a Blob URL. Loading via file://
// would taint the canvas under Electron's default webSecurity, breaking
// getImageData; same-origin blobs avoid that.
export async function loadPixelBufferFromPath(path: string): Promise<PixelBuffer> {
  const bytes = await window.api.readFile(path)
  const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' })
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error(`failed to decode image: ${path}`))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d context unavailable')
    ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return { data: data.data, width: data.width, height: data.height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Composites `frame` on top of `base` with normal alpha blending, scaling
// the frame to base dimensions if they differ. Pixel-art friendly: smoothing
// is disabled so scaled frames remain crisp.
export function compositeOnTop(base: PixelBuffer, frame: PixelBuffer): PixelBuffer {
  const out = document.createElement('canvas')
  out.width = base.width
  out.height = base.height
  const outCtx = out.getContext('2d')
  if (!outCtx) throw new Error('canvas 2d context unavailable')

  const baseImage = outCtx.createImageData(base.width, base.height)
  baseImage.data.set(base.data)
  outCtx.putImageData(baseImage, 0, 0)

  const fc = document.createElement('canvas')
  fc.width = frame.width
  fc.height = frame.height
  const fCtx = fc.getContext('2d')
  if (!fCtx) throw new Error('canvas 2d context unavailable')
  const fImage = fCtx.createImageData(frame.width, frame.height)
  fImage.data.set(frame.data)
  fCtx.putImageData(fImage, 0, 0)

  outCtx.imageSmoothingEnabled = false
  outCtx.drawImage(fc, 0, 0, frame.width, frame.height, 0, 0, base.width, base.height)

  const data = outCtx.getImageData(0, 0, base.width, base.height)
  return { data: data.data, width: data.width, height: data.height }
}

export async function pixelBufferToPngBytes(buf: PixelBuffer): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = buf.width
  canvas.height = buf.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  const imageData = ctx.createImageData(buf.width, buf.height)
  imageData.data.set(buf.data)
  ctx.putImageData(imageData, 0, 0)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
  if (!blob) throw new Error('toBlob returned null')
  return new Uint8Array(await blob.arrayBuffer())
}
