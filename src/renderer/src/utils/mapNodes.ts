import type { MapData, MapNpc, MapReactor, MapSign, MapWarp } from '../data/mapData'
import type { MapMarker, MarkerKind } from '../components/mapeditor/MapRenderCanvas'

/**
 * The record operations behind the map editor's Placement tab.
 *
 * Kept out of the panel because they are pure — a map in, a map out — and
 * because moving a node, copying one, and reading one back are each done from
 * more than one place. A drag on the canvas and a typed coordinate in a dialog
 * are the same move (HTOO-441, HTOO-445); shift-click and paste are the same
 * copy (HTOO-443, HTOO-444). Each of those pairs has to agree, and the way to
 * make them agree is to give them one function.
 */

/** One placed node, with the collection it belongs to. */
export type NodeRecord =
  | { kind: 'warp'; record: MapWarp }
  | { kind: 'npc'; record: MapNpc }
  | { kind: 'sign'; record: MapSign }
  | { kind: 'reactor'; record: MapReactor }

/** The placement modes the toolbar arms. */
export type ArmedMode = 'warp-map' | 'warp-worldmap' | 'npc' | 'sign' | 'reactor'

/** Where a marker points, once selected. */
export interface SelectedNode {
  kind: MarkerKind
  index: number
}

/**
 * Whether a marker kind indexes into `data.warps`.
 *
 * Map warps and world warps are one collection with two `targetType` values,
 * drawn as two marker kinds. Everything that resolves a marker back to its
 * record goes through this, so the two never drift apart.
 */
export function isWarpKind(kind: MarkerKind): boolean {
  return kind === 'warp' || kind === 'worldwarp'
}

/** The marker kind a warp draws as. */
export function warpMarkerKind(warp: MapWarp): MarkerKind {
  return warp.targetType === 'worldmap' ? 'worldwarp' : 'warp'
}

/** The mode that places a record of this shape. World warps have their own. */
export function armedModeFor(node: NodeRecord): ArmedMode {
  if (node.kind !== 'warp') return node.kind
  return node.record.targetType === 'worldmap' ? 'warp-worldmap' : 'warp-map'
}

/** What the copy buffer holds, for the chip that says so. */
export function clipboardLabel(node: NodeRecord): string {
  if (node.kind === 'npc') return 'NPC'
  if (node.kind !== 'warp') return node.kind
  return node.record.targetType === 'worldmap' ? 'world warp' : 'map warp'
}

/** Every placed node as a canvas marker, in collection order. */
export function markersFor(data: MapData): MapMarker[] {
  return [
    // `index` stays the index into `data.warps` for both kinds — the two marker
    // kinds are a drawing distinction, not a second collection.
    ...data.warps.map((w, i): MapMarker => ({ kind: warpMarkerKind(w), index: i, x: w.x, y: w.y })),
    ...data.npcs.map((n, i): MapMarker => ({ kind: 'npc', index: i, x: n.x, y: n.y })),
    ...data.signs.map((s, i): MapMarker => ({ kind: 'sign', index: i, x: s.x, y: s.y })),
    ...data.reactors.map((r, i): MapMarker => ({ kind: 'reactor', index: i, x: r.x, y: r.y }))
  ]
}

/** The record behind a marker, in the shape the copy buffers hold. */
export function nodeAt(data: MapData, kind: MarkerKind, index: number): NodeRecord | null {
  if (isWarpKind(kind)) {
    const record = data.warps[index]
    return record ? { kind: 'warp', record } : null
  }
  if (kind === 'npc') {
    const record = data.npcs[index]
    return record ? { kind: 'npc', record } : null
  }
  if (kind === 'sign') {
    const record = data.signs[index]
    return record ? { kind: 'sign', record } : null
  }
  const record = data.reactors[index]
  return record ? { kind: 'reactor', record } : null
}

/** What a node is called in the menu that disambiguates a stacked tile. */
export function markerLabel(data: MapData, m: MapMarker): string {
  if (isWarpKind(m.kind)) {
    const w = data.warps[m.index]
    const target = w?.targetType === 'worldmap' ? w.worldMapTarget : w?.mapTargetName
    return `${m.kind === 'worldwarp' ? 'World Warp' : 'Map Warp'} → ${target || '?'}`
  }
  if (m.kind === 'npc') return `NPC ${data.npcs[m.index]?.name || '?'}`
  if (m.kind === 'sign') {
    const sign = data.signs[m.index]
    return `Sign ${sign?.name || sign?.type || '?'}`
  }
  const r = data.reactors[m.index]
  return `Reactor ${r?.displayName || r?.script || '?'}`
}

/**
 * Move one node to a tile.
 *
 * The one place a placed node's position changes. A drag on the canvas
 * (HTOO-445) and a typed coordinate in a dialog (HTOO-441) both arrive here, so
 * the two cannot disagree about what a move is.
 *
 * An index nothing occupies returns the map unchanged rather than growing it.
 */
export function moveNodeIn(
  data: MapData,
  kind: MarkerKind,
  index: number,
  x: number,
  y: number
): MapData {
  const at = <T extends { x: number; y: number }>(list: T[]): T[] =>
    list.map((item, i) => (i === index ? { ...item, x, y } : item))
  if (isWarpKind(kind)) return { ...data, warps: at(data.warps) }
  if (kind === 'npc') return { ...data, npcs: at(data.npcs) }
  if (kind === 'sign') return { ...data, signs: at(data.signs) }
  return { ...data, reactors: at(data.reactors) }
}

/**
 * Append a copy of a node at a tile, and say what to select.
 *
 * NPCs are not handled here. The server registers a placed NPC by name,
 * globally — `World.WorldState.Set(merchant.Name, merchant)` — so two NPCs
 * sharing a name overwrite each other in world state, on this map or on any
 * other. A copied NPC has to go through the dialog to be given a new name, so
 * the panel intercepts that kind before it reaches this function.
 */
export function appendNodeCopy(
  data: MapData,
  node: Exclude<NodeRecord, { kind: 'npc' }>,
  x: number,
  y: number
): { data: MapData; selected: SelectedNode } {
  if (node.kind === 'warp') {
    const copy: MapWarp = { ...node.record, x, y }
    const warps = [...data.warps, copy]
    return {
      data: { ...data, warps },
      selected: { kind: warpMarkerKind(copy), index: warps.length - 1 }
    }
  }
  if (node.kind === 'sign') {
    const signs = [...data.signs, { ...node.record, x, y }]
    return { data: { ...data, signs }, selected: { kind: 'sign', index: signs.length - 1 } }
  }
  const reactors = [...data.reactors, { ...node.record, x, y }]
  return { data: { ...data, reactors }, selected: { kind: 'reactor', index: reactors.length - 1 } }
}

/**
 * Tiles holding more than one warp, as `"x,y"`.
 *
 * The server loads warps into `Dictionary<Tuple<byte, byte>, Warp>` and writes
 * `Warps[key] = warp`, so a second warp on a tile replaces the first. There is
 * no error and no log line: the last warp in the file wins, and file order is
 * the only thing that decides which (HTOO-442).
 *
 * Reactors are deliberately not checked. They load into a dictionary per tile,
 * keyed by GUID, and every one of them runs.
 */
export function findDuplicateWarpTiles(warps: MapWarp[]): string[] {
  const count = new Map<string, number>()
  for (const w of warps) {
    const key = `${w.x},${w.y}`
    count.set(key, (count.get(key) ?? 0) + 1)
  }
  return [...count.entries()].filter(([, n]) => n > 1).map(([key]) => key)
}
