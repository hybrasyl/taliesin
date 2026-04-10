/**
 * Renders world-map background EPF images from setoa.dat.
 *
 * Each field image is a paired (fieldNNN.epf + fieldNNN.pal) in setoa.dat.
 * No palette table is involved — the palette is loaded directly by name.
 * Native canvas size: 640×480.
 */

import { DataArchive, EpfFile, Palette } from '@eriscorp/dalib-ts'

export const FIELD_NAMES = Array.from({ length: 11 }, (_, i) =>
  `field${String(i).padStart(3, '0')}`   // field000 … field010
)

export const FIELD_WIDTH  = 640
export const FIELD_HEIGHT = 480

// ── Module-level caches ───────────────────────────────────────────────────────

const archiveCache = new Map<string, DataArchive>()
const bitmapCache  = new Map<string, ImageBitmap>()

// ── Archive loading ───────────────────────────────────────────────────────────

async function loadArchive(clientPath: string): Promise<DataArchive> {
  const cached = archiveCache.get(clientPath)
  if (cached) return cached

  const buf     = await window.api.readFile(`${clientPath}/setoa.dat`)
  const archive = DataArchive.fromBuffer(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
  archiveCache.set(clientPath, archive)
  return archive
}

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * Render a field background to an ImageBitmap (640×480).
 * Each fieldNNN.epf is rendered with its paired fieldNNN.pal.
 * Throws on failure so the canvas can display the error message.
 */
export async function renderField(
  fieldName: string,
  clientPath: string,
): Promise<ImageBitmap> {
  const normPath = clientPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const cacheKey = `${normPath}/${fieldName}`
  const cached   = bitmapCache.get(cacheKey)
  if (cached) return cached

  const archive = await loadArchive(normPath)

  // Each EPF pairs with a same-named .pal (field001.epf → field001.pal)
  const palEntry = archive.get(`${fieldName}.pal`)
  if (!palEntry) throw new Error(`${fieldName}.pal not found in setoa.dat`)
  const palette = Palette.fromEntry(palEntry)

  const epf = EpfFile.fromArchive(fieldName, archive)
  if (epf.frames.length === 0) throw new Error(`${fieldName}.epf has no frames`)

  const imageData = new ImageData(FIELD_WIDTH, FIELD_HEIGHT)
  const d = imageData.data

  for (const frame of epf.frames) {
    const fw = frame.right  - frame.left
    const fh = frame.bottom - frame.top

    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const idx = frame.data[y * fw + x]
        if (!idx) continue   // palette index 0 = transparent
        const color = palette.get(idx)
        const dstX  = frame.left + x
        const dstY  = frame.top  + y
        if (dstX < 0 || dstY < 0 || dstX >= FIELD_WIDTH || dstY >= FIELD_HEIGHT) continue
        const dst = (dstY * FIELD_WIDTH + dstX) * 4
        d[dst]     = color.r
        d[dst + 1] = color.g
        d[dst + 2] = color.b
        d[dst + 3] = 255
      }
    }
  }

  const bitmap = await createImageBitmap(imageData)
  bitmapCache.set(cacheKey, bitmap)
  return bitmap
}

/** Clear all caches (call when clientPath changes). */
export function clearFieldCache(): void {
  archiveCache.clear()
  bitmapCache.clear()
}
