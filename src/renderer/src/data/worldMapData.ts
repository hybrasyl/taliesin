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
