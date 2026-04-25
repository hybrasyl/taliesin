/**
 * Archive entry renderer — wraps dalib-ts render functions to produce
 * RgbaFrame arrays from archive entries, auto-detecting format by extension.
 */

import {
  EpfView,
  SpfView,
  MpfView,
  EfaView,
  HpfFile,
  Palette,
  renderEpf,
  renderSpfPalettized,
  renderSpfColorized,
  renderMpf,
  renderEfa,
  renderHpf,
  type DataArchive,
  type DataArchiveEntry,
  type RgbaFrame,
  type EfaBlendingType
} from '@eriscorp/dalib-ts'

// dalib-ts exports SpfFormatType as `declare const enum`, which isolatedModules
// won't let us reference by name. Mirror the underlying values here.
const SPF_FORMAT_PALETTIZED = 0
import { toImageData } from '@eriscorp/dalib-ts/helpers/imageData'

export { toImageData }

// ── Types ────────────────────────────────────────────────────────────────────

export interface RenderedEntry {
  frames: RgbaFrame[]
  /** Animation interval in ms (EFA only). */
  frameIntervalMs?: number
  /** EFA blending type. */
  blendingType?: EfaBlendingType
  /** MPF animation metadata. */
  animation?: {
    walkFrameIndex: number
    walkFrameCount: number
    attackFrameIndex: number
    attackFrameCount: number
    standingFrameIndex: number
    standingFrameCount: number
  }
}

// ── Extension helpers ────────────────────────────────────────────────────────

function ext(entry: DataArchiveEntry): string {
  const name = entry.entryName.toLowerCase()
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot) : ''
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get all available palettes from an archive.
 * Returns a map of palette number → Palette, loaded from all .pal entries.
 */
export function loadPalettes(archive: DataArchive): Map<number, Palette> {
  const palettes = new Map<number, Palette>()
  const palEntries = archive.getEntriesByExtension('.pal')
  for (const pe of palEntries) {
    const buf = archive.getEntryBuffer(pe)
    try {
      const pal = Palette.fromBuffer(buf)
      // Derive palette number from filename: e.g. "mpt042.pal" → 42
      const m = pe.entryName.match(/(\d+)\.pal$/i)
      const num = m ? parseInt(m[1], 10) : palettes.size
      palettes.set(num, pal)
    } catch {
      // Skip malformed palette entries
    }
  }
  return palettes
}

/**
 * Get palette entry names for UI display.
 */
export function getPaletteNames(archive: DataArchive): string[] {
  return archive.getEntriesByExtension('.pal').map((e) => e.entryName)
}

/**
 * Load a specific palette by entry name.
 */
export function loadPaletteByName(archive: DataArchive, entryName: string): Palette | null {
  const entry = archive.get(entryName)
  if (!entry) return null
  try {
    return Palette.fromBuffer(archive.getEntryBuffer(entry))
  } catch {
    return null
  }
}

/**
 * Render an archive entry to an array of RgbaFrame.
 * Returns null if the entry type is not renderable (text, audio, unknown).
 */
export function renderEntry(
  entry: DataArchiveEntry,
  palette: Palette | null
): RenderedEntry | null {
  const extension = ext(entry)

  switch (extension) {
    case '.epf': {
      if (!palette) return null
      const view = EpfView.fromEntry(entry)
      const frames: RgbaFrame[] = []
      for (let i = 0; i < view.count; i++) {
        const frame = view.get(i)
        frames.push(renderEpf(frame, palette))
      }
      return { frames }
    }

    case '.spf': {
      const view = SpfView.fromEntry(entry)
      const frames: RgbaFrame[] = []
      for (let i = 0; i < view.count; i++) {
        const frame = view.get(i)
        if (view.format === SPF_FORMAT_PALETTIZED) {
          const pal = view.primaryColors ?? palette
          if (!pal) return null
          frames.push(renderSpfPalettized(frame, pal))
        } else {
          frames.push(renderSpfColorized(frame))
        }
      }
      return { frames }
    }

    case '.mpf': {
      if (!palette) return null
      const view = MpfView.fromEntry(entry)
      const frames: RgbaFrame[] = []
      for (let i = 0; i < view.count; i++) {
        frames.push(renderMpf(view.get(i), palette))
      }
      return {
        frames,
        animation: {
          walkFrameIndex: view.walkFrameIndex,
          walkFrameCount: view.walkFrameCount,
          attackFrameIndex: view.attackFrameIndex,
          attackFrameCount: view.attackFrameCount,
          standingFrameIndex: view.standingFrameIndex,
          standingFrameCount: view.standingFrameCount
        }
      }
    }

    case '.efa': {
      const view = EfaView.fromEntry(entry)
      const frames: RgbaFrame[] = []
      for (let i = 0; i < view.count; i++) {
        frames.push(renderEfa(view.get(i), view.blendingType))
      }
      return {
        frames,
        frameIntervalMs: view.frameIntervalMs,
        blendingType: view.blendingType
      }
    }

    case '.hpf': {
      if (!palette) return null
      const hpf = HpfFile.fromEntry(entry)
      return { frames: [renderHpf(hpf, palette)] }
    }

    default:
      return null
  }
}

/**
 * Render a .pal entry as a 16×16 grid of color swatches.
 * Returns an RgbaFrame of the palette grid.
 */
export function renderPaletteGrid(palette: Palette, cellSize = 12): RgbaFrame {
  const cols = 16
  const rows = 16
  const width = cols * cellSize
  const height = rows * cellSize
  const data = new Uint8ClampedArray(width * height * 4)

  for (let i = 0; i < 256; i++) {
    const c = palette.get(i)
    const col = i % cols
    const row = Math.floor(i / cols)
    for (let dy = 0; dy < cellSize; dy++) {
      for (let dx = 0; dx < cellSize; dx++) {
        const px = (row * cellSize + dy) * width + (col * cellSize + dx)
        const off = px * 4
        data[off] = c.r
        data[off + 1] = c.g
        data[off + 2] = c.b
        data[off + 3] = i === 0 ? 0 : 255 // index 0 is transparent by convention
      }
    }
  }

  return { width, height, data }
}

/**
 * Classify an entry by its preview type.
 */
export type PreviewType =
  | 'sprite'
  | 'palette'
  | 'text'
  | 'audio'
  | 'tileset'
  | 'pcx'
  | 'darkness'
  | 'font'
  | 'bik'
  | 'jpf'
  | 'hex'

export function classifyEntry(entry: DataArchiveEntry): PreviewType {
  const extension = ext(entry)
  switch (extension) {
    case '.epf':
    case '.spf':
    case '.mpf':
    case '.efa':
    case '.hpf':
      return 'sprite'
    case '.pal':
      return 'palette'
    case '.txt':
    case '.tbl':
    case '.log':
    case '.nfo':
      return 'text'
    case '.mp3':
    case '.wav':
    case '.ogg':
    case '.mus':
      return 'audio'
    case '.bmp':
      return 'tileset'
    case '.pcx':
      return 'pcx'
    case '.hea':
      return 'darkness'
    case '.fnt':
      return 'font'
    case '.bik':
      return 'bik'
    case '.jpf':
      return 'jpf'
    default:
      return 'hex'
  }
}

// ── PCX decoder ──────────────────────────────────────────────────────────────

export interface PcxImage {
  width: number
  height: number
  bpp: number
  /** RGBA pixel bytes (width * height * 4). */
  rgba: Uint8ClampedArray
}

/**
 * Decode an 8bpp single-plane PCX image to RGBA. The DA archives' PCX entries
 * are all 8bpp paletted with a 256-color palette appended at the file's tail
 * (last 769 bytes: 0x0C marker + 768 RGB bytes).
 *
 * Returns null for unsupported PCX variants (e.g. 24bpp 3-plane).
 */
export function decodePcx(buffer: Uint8Array): PcxImage | null {
  if (buffer.length < 128 || buffer[0] !== 0x0a) return null
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const bpp = buffer[3]
  const xMin = view.getUint16(4, true),
    yMin = view.getUint16(6, true)
  const xMax = view.getUint16(8, true),
    yMax = view.getUint16(10, true)
  const nPlanes = buffer[65]
  const bytesPerLine = view.getUint16(66, true)
  const width = xMax - xMin + 1
  const height = yMax - yMin + 1
  if (width <= 0 || height <= 0 || width > 8192 || height > 8192) return null
  if (bpp !== 8 || nPlanes !== 1) return null

  // Decode RLE into a single contiguous indexed buffer (height * bytesPerLine).
  const totalScanlineBytes = bytesPerLine * height
  const indexed = new Uint8Array(totalScanlineBytes)
  let src = 128,
    dst = 0
  while (dst < totalScanlineBytes && src < buffer.length) {
    const byte = buffer[src++]
    if ((byte & 0xc0) === 0xc0) {
      const runLen = byte & 0x3f
      if (src >= buffer.length) break
      const value = buffer[src++]
      for (let i = 0; i < runLen && dst < totalScanlineBytes; i++) indexed[dst++] = value
    } else {
      indexed[dst++] = byte
    }
  }

  // Locate trailing 256-color palette (0x0C marker followed by 768 bytes).
  const palOffset = buffer.length - 769
  if (palOffset < 128 || buffer[palOffset] !== 0x0c) return null
  const palette = buffer.subarray(palOffset + 1, palOffset + 1 + 768)

  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = indexed[y * bytesPerLine + x]
      const pi = idx * 3
      const off = (y * width + x) * 4
      rgba[off] = palette[pi]
      rgba[off + 1] = palette[pi + 1]
      rgba[off + 2] = palette[pi + 2]
      rgba[off + 3] = 255
    }
  }
  return { width, height, bpp, rgba }
}

// ── BIK header metadata ──────────────────────────────────────────────────────

export interface BikInfo {
  /** Version letter from the magic (e.g. 'b', 'f', 'i'). */
  version: string
  width: number
  height: number
  frameCount: number
  /** Frames per second (computed as frameRateDividend / frameRateDivisor). */
  fps: number
  audioTrackCount: number
}

/**
 * Parse the BIK file header for display metadata.
 * BIK header layout: "BIK<v>" magic + 9 LE uint32 fields + audio track count.
 */
export function parseBikHeader(buffer: Uint8Array): BikInfo | null {
  if (buffer.length < 44) return null
  if (buffer[0] !== 0x42 || buffer[1] !== 0x49 || buffer[2] !== 0x4b) return null // "BIK"
  const version = String.fromCharCode(buffer[3])
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const frameCount = view.getUint32(8, true)
  const width = view.getUint32(20, true)
  const height = view.getUint32(24, true)
  const frameRateDividend = view.getUint32(28, true)
  const frameRateDivisor = view.getUint32(32, true)
  const audioTrackCount = view.getUint32(40, true)
  const fps = frameRateDivisor > 0 ? frameRateDividend / frameRateDivisor : 0
  return { version, width, height, frameCount, fps, audioTrackCount }
}

/**
 * Format bytes for display.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
