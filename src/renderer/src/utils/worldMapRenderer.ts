/**
 * Renders world-map background EPF images from setoa.dat.
 *
 * Each field image is a paired (fieldNNN.epf + fieldNNN.pal) in setoa.dat.
 * No palette table is involved — the palette is loaded directly by name.
 * Native canvas size of the legacy art: 640×480. FIELD_WIDTH/FIELD_HEIGHT give
 * that size and the world-map coordinate space. An installed world_maps pack
 * can supply a larger image; renderField returns it at its own size, and the
 * caller scales it into the 640×480 field box, as the client does.
 */

import { DataArchive, EpfFile, Palette } from '@eriscorp/dalib-ts'
import { resolveWithPackOverride, coveredIdSet, type OverrideSource } from './packOverride'
import { resolveClientFile } from './fsCase'

export const FIELD_NAMES = Array.from(
  { length: 11 },
  (_, i) => `field${String(i).padStart(3, '0')}` // field000 … field010
)

export const FIELD_WIDTH = 640
export const FIELD_HEIGHT = 480

/** The frame every field is drawn into, whatever the art's own size. */
export const FIELD_ASPECT = FIELD_WIDTH / FIELD_HEIGHT

/**
 * How far a pack image may stray from 4:3 before it is worth reporting.
 *
 * The client stretches any image into the 640×480 frame without complaint, and
 * so does the editor, because a faithful preview is the point. But a genuinely
 * off-aspect image distorts hard while the map points stay where they are, and
 * nothing anywhere says so (HTOO-376).
 *
 * 1% clears the known-good case: the test pack's `field001.png` is 997×750,
 * a ratio of 1.3293 against 1.3333, which is 0.3% out and undetectable by eye.
 */
export const ASPECT_TOLERANCE = 0.01

/** How far `w`×`h` strays from the field frame's 4:3, as a fraction of it. */
export function aspectDeviation(w: number, h: number): number {
  if (w <= 0 || h <= 0) return 0
  return Math.abs(w / h - FIELD_ASPECT) / FIELD_ASPECT
}

/** Where a field's art came from — named so the editor can report it. */
export type FieldArtSource = 'pack' | 'legacy'

export interface FieldArt {
  bitmap: ImageBitmap
  source: FieldArtSource
}

// ── Module-level caches ───────────────────────────────────────────────────────

const archiveCache = new Map<string, DataArchive>()
const bitmapCache = new Map<string, ImageBitmap>()
/**
 * Which source produced each cached bitmap.
 *
 * Kept beside the bitmap cache because a cache hit reports only "cache", and
 * the editor needs to name the real source however many times it is asked.
 */
const sourceCache = new Map<string, FieldArtSource>()

// Field names (lowercased) covered by an installed world_maps pack. Loaded once
// on demand; reset by clearFieldCache when brigidAssetsPath changes.
let worldCoverage: Set<string> | null = null
async function getWorldCoverage(): Promise<Set<string>> {
  if (!worldCoverage) {
    worldCoverage = await coveredIdSet('world_maps', (id) => String(id).toLowerCase())
  }
  return worldCoverage
}

// ── Archive loading ───────────────────────────────────────────────────────────

async function loadArchive(clientPath: string): Promise<DataArchive> {
  const cached = archiveCache.get(clientPath)
  if (cached) return cached

  // Resolved rather than concatenated: a stock install spells this lowercase,
  // but that is a fact about today's installer rather than a guarantee, and a
  // wrong-cased read on Linux throws into the caller's catch as "no world map".
  // See utils/fsCase.ts (HTOO-287).
  const buf = await window.api.readFile(await resolveClientFile(clientPath, 'setoa.dat'))
  const archive = DataArchive.fromBuffer(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
  archiveCache.set(clientPath, archive)
  return archive
}

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * Render a field background, and say where the art came from.
 *
 * Each fieldNNN.epf is rendered with its paired fieldNNN.pal, at 640×480. An
 * installed `world_maps` pack overrides it at whatever size the PNG is.
 * Throws on failure so the canvas can display the error message.
 */
export async function renderField(fieldName: string, clientPath: string): Promise<FieldArt> {
  const normPath = clientPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const cacheKey = `${normPath}/${fieldName}`
  const fieldId = fieldName.toLowerCase()

  // Installed world_maps pack override wins over the legacy setoa.dat field art.
  // renderLegacy throws on missing art so the canvas can show the error; a
  // covered field never reaches it. Non-null because the legacy path only
  // returns via throw or a bitmap.
  // A holder rather than a `let`: TypeScript cannot see the callback assign it,
  // so a plain variable stays narrowed to its initializer at the read below.
  const reported: { source: OverrideSource } = { source: 'legacy' }
  const bitmap = await resolveWithPackOverride(
    'world_maps',
    fieldId,
    await getWorldCoverage(),
    bitmapCache,
    cacheKey,
    async () => {
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
        const fw = frame.right - frame.left
        const fh = frame.bottom - frame.top

        for (let y = 0; y < fh; y++) {
          for (let x = 0; x < fw; x++) {
            const idx = frame.data[y * fw + x]
            if (!idx) continue // palette index 0 = transparent
            const color = palette.get(idx)
            const dstX = frame.left + x
            const dstY = frame.top + y
            if (dstX < 0 || dstY < 0 || dstX >= FIELD_WIDTH || dstY >= FIELD_HEIGHT) continue
            const dst = (dstY * FIELD_WIDTH + dstX) * 4
            d[dst] = color.r
            d[dst + 1] = color.g
            d[dst + 2] = color.b
            d[dst + 3] = 255
          }
        }
      }

      return createImageBitmap(imageData)
    },
    (s) => {
      reported.source = s
    }
  )
  // A cache hit names no source of its own, so fall back to what was recorded
  // when the bitmap was first resolved.
  const source: FieldArtSource =
    reported.source === 'cache' ? (sourceCache.get(cacheKey) ?? 'legacy') : reported.source
  sourceCache.set(cacheKey, source)
  return { bitmap: bitmap as ImageBitmap, source }
}

/** Clear all caches (call when clientPath or brigidAssetsPath changes). */
export function clearFieldCache(): void {
  archiveCache.clear()
  bitmapCache.clear()
  sourceCache.clear()
  worldCoverage = null
}
