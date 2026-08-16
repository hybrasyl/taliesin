// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorldMapPoint {
  x: number
  y: number
  name: string
  targetMap: string
  targetX: number
  targetY: number
}

export interface WorldMapMeta {
  reference: string
  excludes: string[]
}

export function pointKey(p: WorldMapPoint): string {
  return `${p.targetMap}:${p.targetX}:${p.targetY}`
}

export interface WorldMapData {
  name: string
  clientMap: string
  points: WorldMapPoint[]
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_WORLD_MAP: WorldMapData = {
  name: '',
  clientMap: '',
  points: []
}

export const DEFAULT_POINT: WorldMapPoint = {
  x: 0,
  y: 0,
  name: '',
  targetMap: '',
  targetX: 0,
  targetY: 0
}

// ── Filename computation ──────────────────────────────────────────────────────

// "Loures Set" → "LouresSet.xml"  (strip whitespace, preserve existing casing)
export function computeWorldMapFilename(name: string): string {
  const base = name.replace(/\s+/g, '')
  return base ? `${base}.xml` : 'WorldMap.xml'
}

// ── Reference sets (HTOO-410) ─────────────────────────────────────────────────

/**
 * One reference set per field map, named for the field it serves.
 *
 * A world has up to 11 field maps, and they carry different art and different
 * points. One shared reference set forced unrelated fields into a single list.
 *
 * This also settles HTOO-411 without a per-point field. A point belongs to
 * exactly one reference set, and that is the file it lives in, so "Oren is on
 * the legacy set and not the Hybrasyl one" is expressed by the two being
 * different fields with a reference set each. There is nothing on the point to
 * keep in step with the file.
 */
const REFERENCE_STEM = 'ReferenceMapSet'

/** The legacy single set, from before a set belonged to a field. */
export const LEGACY_REFERENCE_FILENAME = `${REFERENCE_STEM}.xml`

/** `field001` → `ReferenceMapSet.field001.xml`. */
export function referenceFilenameFor(field: string): string {
  return field ? `${REFERENCE_STEM}.${field}.xml` : LEGACY_REFERENCE_FILENAME
}

/**
 * The field a reference set filename serves, `null` for the legacy name.
 *
 * Returns `undefined` when the name is not a reference set at all, so the three
 * cases stay apart: not a reference set, the legacy set, and a field's set.
 */
export function fieldOfReferenceFilename(name: string): string | null | undefined {
  const m = name.match(new RegExp(`^${REFERENCE_STEM}(?:\\.([^.]+))?\\.xml$`, 'i'))
  if (!m) return undefined
  return m[1] ?? null
}

/** Whether a filename names a reference set, of any field or the legacy one. */
export function isReferenceFilename(name: string): boolean {
  return fieldOfReferenceFilename(name) !== undefined
}

// ── Overlap (HTOO-413) ────────────────────────────────────────────────────────

/**
 * The client's node box, in field pixels. Brigid anchors the box at the node's
 * X/Y (`WorldMapNode`, BOX_SIZE = 12) and the legacy client renders a text
 * point at the wire's x/y.
 */
export const CLIENT_NODE_BOX = 12

/**
 * Pairs of points whose client boxes overlap, as `[earlier, later]` indices.
 *
 * **Why this is a warning and not a nicety.** Brigid draws the nodes in list
 * order, so a later node covers an earlier one. It hit-tests in the same order
 * and stops at the first match (`WorldMap.OnMouseMove`). The node the player
 * sees on top is therefore the one they cannot click: the click goes to the
 * node underneath. Overlap is allowed here because authors want it, but the
 * pair has to be reported.
 *
 * This is deliberately conservative. The client's real hit area is the box plus
 * a 3px gap plus the label's own width, so two points can conflict with their
 * boxes well apart. Predicting that needs the client's bitmap font metrics,
 * which are not available here, so this reports only what is certain.
 */
export function overlappingPointPairs(points: WorldMapPoint[]): [number, number][] {
  const pairs: [number, number][] = []
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i]!
      const b = points[j]!
      if (Math.abs(a.x - b.x) < CLIENT_NODE_BOX && Math.abs(a.y - b.y) < CLIENT_NODE_BOX) {
        pairs.push([i, j])
      }
    }
  }
  return pairs
}
