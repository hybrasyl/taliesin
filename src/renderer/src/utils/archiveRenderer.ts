/**
 * Archive entry renderer — wraps dalib-ts render functions to produce
 * RgbaFrame arrays from archive entries, auto-detecting format by extension.
 */

import {
  EpfView, SpfView, MpfView, EfaView,
  HpfFile, Palette,
  renderEpf, renderSpfPalettized, renderSpfColorized,
  renderMpf, renderEfa, renderHpf,
  type DataArchive, type DataArchiveEntry, type RgbaFrame, type EfaBlendingType,
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
  return archive.getEntriesByExtension('.pal').map(e => e.entryName)
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
          standingFrameCount: view.standingFrameCount,
        },
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
        blendingType: view.blendingType,
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
        data[off]     = c.r
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
export type PreviewType = 'sprite' | 'palette' | 'text' | 'audio' | 'image' | 'hex'

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
      return 'text'
    case '.mp3':
    case '.wav':
    case '.ogg':
    case '.mus':
      return 'audio'
    case '.bmp':
      return 'image'
    default:
      return 'hex'
  }
}

/**
 * Format bytes for display.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
