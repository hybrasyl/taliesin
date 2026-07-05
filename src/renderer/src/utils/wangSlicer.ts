import { PixelBuffer } from './duotone'
import { sliceGrid, GridSpec } from './gridSlice'

// ── Wang / blob tileset slicing (Static Tile Manager, Phase 3) ────────────────
//
// Slice a wang/autotile sheet into the individual tiles DA uses and label each
// with its adjacency mask, so a later autotile-aware map editor can pick the
// right variant. This module ONLY slices + labels; converting each sliced cell
// to a DA diamond floor is the caller's job (reuse convertOrthoTile — floors are
// diamonds with transparent corners, so each cell converts independently, no
// whole-sheet overlap needed).
//
// Input assumption: the sheet is laid out in the scheme's canonical cell order
// (a Tiled/itch-style wang export). A freeform designed atlas (autotiles shown
// assembled into rings) is NOT sliceable by a fixed table — crop the wang block
// out first, or use the plain grid slicer + manual tagging.
//
// Adjacency masks are self-consistent by construction (a synthetic sheet built
// from a scheme's own table round-trips through the slicer). Matching a specific
// source tool's ordering is a remap on top of the canonical table.

export type WangSchemeId = 'edge16' | 'corner16' | 'blob47'

/** One neighbour direction that a scheme's adjacency bit represents. */
export interface WangBit {
  name: string
  value: number
}

export interface WangScheme {
  id: WangSchemeId
  label: string
  /** Number of distinct tiles the scheme produces. */
  tileCount: number
  /** Source grid the sheet is expected to be laid out in. */
  cols: number
  rows: number
  /**
   * Adjacency mask for the cell at row-major index i, or null for an unused grid
   * cell (blob47 packs 47 tiles into a 48-cell grid). Length === cols * rows.
   */
  masks: (number | null)[]
  /** Bit legend (which neighbour each mask bit means). */
  bits: WangBit[]
}

/** A sliced wang tile: its grid position, adjacency mask, and pixels. */
export interface WangTile {
  index: number
  row: number
  col: number
  /** Adjacency mask (see the scheme's `bits` legend). */
  mask: number
  buffer: PixelBuffer
}

// ── Scheme definitions ────────────────────────────────────────────────────────

// 2-edge: one bit per orthogonal edge that connects to the same terrain. The
// canonical 4×4 layout puts the tile for mask M at row-major cell M (0..15).
const EDGE_BITS: WangBit[] = [
  { name: 'N', value: 1 },
  { name: 'E', value: 2 },
  { name: 'S', value: 4 },
  { name: 'W', value: 8 }
]

// 2-corner: one bit per diagonal corner that connects to the same terrain.
const CORNER_BITS: WangBit[] = [
  { name: 'NE', value: 1 },
  { name: 'SE', value: 2 },
  { name: 'SW', value: 4 },
  { name: 'NW', value: 8 }
]

// 8-neighbour bits for the blob scheme.
const BLOB_BITS: WangBit[] = [
  { name: 'N', value: 1 },
  { name: 'NE', value: 2 },
  { name: 'E', value: 4 },
  { name: 'SE', value: 8 },
  { name: 'S', value: 16 },
  { name: 'SW', value: 32 },
  { name: 'W', value: 64 },
  { name: 'NW', value: 128 }
]

/**
 * A corner (diagonal) neighbour only counts when BOTH its adjacent edges are
 * present; canonicalizing all 256 eight-neighbour masks under that rule collapses
 * them to exactly the 47 distinct "blob" configurations.
 */
export function canonicalizeBlobMask(mask: number): number {
  let m = mask
  if (m & 2 && (m & (1 | 4)) !== (1 | 4)) m &= ~2 // NE needs N+E
  if (m & 8 && (m & (4 | 16)) !== (4 | 16)) m &= ~8 // SE needs E+S
  if (m & 32 && (m & (16 | 64)) !== (16 | 64)) m &= ~32 // SW needs S+W
  if (m & 128 && (m & (64 | 1)) !== (64 | 1)) m &= ~128 // NW needs W+N
  return m
}

/** The 47 canonical blob masks, ascending — deterministic, no external order. */
function computeBlob47Masks(): number[] {
  const set = new Set<number>()
  for (let m = 0; m < 256; m++) set.add(canonicalizeBlobMask(m))
  return [...set].sort((a, b) => a - b)
}

function buildFlat16(id: WangSchemeId, label: string, bits: WangBit[]): WangScheme {
  // cell M holds the tile for mask M, in a 4×4 row-major grid
  return {
    id,
    label,
    tileCount: 16,
    cols: 4,
    rows: 4,
    masks: Array.from({ length: 16 }, (_, i) => i),
    bits
  }
}

function buildBlob47(): WangScheme {
  const canon = computeBlob47Masks() // 47 entries
  const cols = 8
  const rows = 6 // 48 cells; last one unused
  const masks: (number | null)[] = Array.from({ length: cols * rows }, (_, i) => canon[i] ?? null)
  return { id: 'blob47', label: '47-tile blob', tileCount: 47, cols, rows, masks, bits: BLOB_BITS }
}

export const WANG_SCHEMES: Record<WangSchemeId, WangScheme> = {
  edge16: buildFlat16('edge16', '2-edge (16)', EDGE_BITS),
  corner16: buildFlat16('corner16', '2-corner blob (16)', CORNER_BITS),
  blob47: buildBlob47()
}

export function getWangScheme(id: WangSchemeId): WangScheme {
  return WANG_SCHEMES[id]
}

/** Format a mask as its set neighbour names, e.g. "N|E" or "(none)". */
export function describeMask(scheme: WangScheme, mask: number): string {
  const names = scheme.bits.filter((b) => (mask & b.value) !== 0).map((b) => b.name)
  return names.length ? names.join('|') : '(none)'
}

// ── Slicing ───────────────────────────────────────────────────────────────────

/** Cell geometry of the source sheet (Tiled-style margin/spacing supported). */
export type WangCellSpec = Pick<
  GridSpec,
  'cellW' | 'cellH' | 'marginX' | 'marginY' | 'spacingX' | 'spacingY'
>

/**
 * Slice `sheet` into the scheme's tiles, attaching each cell's adjacency mask.
 * The sheet must be laid out in the scheme's canonical cell order and be at least
 * `cols × rows` cells; unused grid cells (blob47's 48th) are skipped. Cells that
 * fall off the sheet edge are clipped (transparent) by the underlying grid slicer.
 */
export function sliceWangSheet(
  sheet: PixelBuffer,
  scheme: WangScheme,
  cell: WangCellSpec
): WangTile[] {
  const cells = sliceGrid(sheet, { ...cell, cols: scheme.cols, rows: scheme.rows })
  const tiles: WangTile[] = []
  for (const c of cells) {
    const mask = scheme.masks[c.index]
    if (mask === null || mask === undefined) continue // unused grid cell
    tiles.push({ index: c.index, row: c.row, col: c.col, mask, buffer: c.buffer })
  }
  return tiles
}
