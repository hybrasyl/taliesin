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

export async function pixelBufferToPngBytes(buf: PixelBuffer): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = buf.width
  canvas.height = buf.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  const imageData = ctx.createImageData(buf.width, buf.height)
  imageData.data.set(buf.data)
  ctx.putImageData(imageData, 0, 0)
  const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'))
  if (!blob) throw new Error('toBlob returned null')
  return new Uint8Array(await blob.arrayBuffer())
}
