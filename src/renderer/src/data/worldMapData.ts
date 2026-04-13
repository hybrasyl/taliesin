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
  points: [],
}

export const DEFAULT_POINT: WorldMapPoint = {
  x: 0,
  y: 0,
  name: '',
  targetMap: '',
  targetX: 0,
  targetY: 0,
}

// ── Filename computation ──────────────────────────────────────────────────────

// "Loures Set" → "LouresSet.xml"  (strip whitespace, preserve existing casing)
export function computeWorldMapFilename(name: string): string {
  const base = name.replace(/\s+/g, '')
  return base ? `${base}.xml` : 'WorldMap.xml'
}
