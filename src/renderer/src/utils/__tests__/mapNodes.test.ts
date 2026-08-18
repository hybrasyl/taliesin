import { describe, it, expect } from 'vitest'
import {
  appendNodeCopy,
  armedModeFor,
  clipboardLabel,
  findDuplicateWarpTiles,
  isWarpKind,
  markerLabel,
  markersFor,
  moveNodeIn,
  nodeAt,
  warpMarkerKind
} from '../mapNodes'
import { DEFAULT_MAP, type MapData, type MapWarp } from '../../data/mapData'

function mapWith(patch: Partial<MapData> = {}): MapData {
  return { ...DEFAULT_MAP, id: 500, name: 'Mileth', x: 40, y: 40, ...patch }
}

const mapWarp = (x: number, y: number, target = 'Abel'): MapWarp => ({
  x,
  y,
  targetType: 'map',
  mapTargetName: target,
  mapTargetX: 5,
  mapTargetY: 6
})

const worldWarp = (x: number, y: number): MapWarp => ({
  x,
  y,
  targetType: 'worldmap',
  worldMapTarget: 'Temuair'
})

describe('warp kinds', () => {
  it('treats both warp markers as one collection', () => {
    // A world warp and a map warp are the same record in `data.warps`. Anything
    // that forgets that resolves the wrong node.
    expect(isWarpKind('warp')).toBe(true)
    expect(isWarpKind('worldwarp')).toBe(true)
    expect(isWarpKind('reactor')).toBe(false)
  })

  it('draws each target type as its own marker', () => {
    expect(warpMarkerKind(mapWarp(1, 1))).toBe('warp')
    expect(warpMarkerKind(worldWarp(1, 1))).toBe('worldwarp')
  })
})

describe('markersFor', () => {
  it('indexes every marker into its own collection', () => {
    const data = mapWith({
      warps: [mapWarp(1, 1), worldWarp(2, 2)],
      npcs: [{ name: 'Riona', x: 3, y: 3, direction: 'South' }],
      reactors: [{ x: 4, y: 4 }]
    })
    expect(markersFor(data)).toEqual([
      { kind: 'warp', index: 0, x: 1, y: 1 },
      { kind: 'worldwarp', index: 1, x: 2, y: 2 },
      { kind: 'npc', index: 0, x: 3, y: 3 },
      { kind: 'reactor', index: 0, x: 4, y: 4 }
    ])
  })

  it('keeps the warp index pointing into data.warps, not into its own kind', () => {
    // The world warp is the second warp, so its index is 1 even though it is
    // the first world warp drawn.
    const data = mapWith({ warps: [mapWarp(1, 1), worldWarp(2, 2)] })
    const worldMarker = markersFor(data).find((m) => m.kind === 'worldwarp')
    expect(worldMarker?.index).toBe(1)
    expect(nodeAt(data, 'worldwarp', worldMarker!.index)).toEqual({
      kind: 'warp',
      record: data.warps[1]
    })
  })
})

describe('moveNodeIn', () => {
  it('moves a warp of either kind', () => {
    const data = mapWith({ warps: [mapWarp(1, 1), worldWarp(2, 2)] })
    expect(moveNodeIn(data, 'worldwarp', 1, 9, 9).warps[1]).toMatchObject({ x: 9, y: 9 })
    expect(moveNodeIn(data, 'warp', 0, 7, 8).warps[0]).toMatchObject({ x: 7, y: 8 })
  })

  it('moves an npc, a sign and a reactor', () => {
    const data = mapWith({
      npcs: [{ name: 'Riona', x: 1, y: 1, direction: 'South' }],
      signs: [{ type: 'Sign', x: 2, y: 2 }],
      reactors: [{ x: 3, y: 3 }]
    })
    expect(moveNodeIn(data, 'npc', 0, 5, 5).npcs[0]).toMatchObject({ x: 5, y: 5, name: 'Riona' })
    expect(moveNodeIn(data, 'sign', 0, 6, 6).signs[0]).toMatchObject({ x: 6, y: 6, type: 'Sign' })
    expect(moveNodeIn(data, 'reactor', 0, 7, 7).reactors[0]).toMatchObject({ x: 7, y: 7 })
  })

  it('keeps every other field, so a move is not an edit', () => {
    const data = mapWith({ warps: [mapWarp(1, 1, 'Abel')] })
    expect(moveNodeIn(data, 'warp', 0, 4, 4).warps[0]).toEqual({
      ...data.warps[0],
      x: 4,
      y: 4
    })
  })

  it('does not grow the map when the index is not occupied', () => {
    const data = mapWith({ reactors: [{ x: 3, y: 3 }] })
    expect(moveNodeIn(data, 'reactor', 9, 1, 1).reactors).toEqual(data.reactors)
  })

  it('does not mutate the map it was given', () => {
    const data = mapWith({ npcs: [{ name: 'Riona', x: 1, y: 1, direction: 'South' }] })
    moveNodeIn(data, 'npc', 0, 8, 8)
    expect(data.npcs[0]).toMatchObject({ x: 1, y: 1 })
  })
})

describe('appendNodeCopy', () => {
  it('copies a map warp with its destination and selects the copy', () => {
    const data = mapWith({ warps: [mapWarp(1, 1, 'Abel')] })
    const { data: next, selected } = appendNodeCopy(
      data,
      { kind: 'warp', record: data.warps[0]! },
      5,
      6
    )
    expect(next.warps).toHaveLength(2)
    expect(next.warps[1]).toMatchObject({ x: 5, y: 6, mapTargetName: 'Abel', mapTargetX: 5 })
    expect(selected).toEqual({ kind: 'warp', index: 1 })
  })

  it('selects a copied world warp as a world warp', () => {
    const data = mapWith({ warps: [worldWarp(1, 1)] })
    const { selected } = appendNodeCopy(data, { kind: 'warp', record: data.warps[0]! }, 2, 2)
    expect(selected).toEqual({ kind: 'worldwarp', index: 1 })
  })

  it('copies a reactor with its script and description', () => {
    const record = { x: 1, y: 1, script: 'door.py', description: 'A creaking door' }
    const data = mapWith({ reactors: [record] })
    const { data: next, selected } = appendNodeCopy(data, { kind: 'reactor', record }, 9, 9)
    expect(next.reactors[1]).toEqual({ ...record, x: 9, y: 9 })
    expect(selected).toEqual({ kind: 'reactor', index: 1 })
  })

  it('copies a sign with its message', () => {
    const record = { type: 'Sign', x: 1, y: 1, message: 'Beware' }
    const data = mapWith({ signs: [record] })
    const { data: next } = appendNodeCopy(data, { kind: 'sign', record }, 2, 3)
    expect(next.signs[1]).toEqual({ ...record, x: 2, y: 3 })
  })

  it('does not mutate the map it was given', () => {
    const record = { x: 1, y: 1 }
    const data = mapWith({ reactors: [record] })
    appendNodeCopy(data, { kind: 'reactor', record }, 4, 4)
    expect(data.reactors).toHaveLength(1)
  })
})

describe('findDuplicateWarpTiles', () => {
  /**
   * The server keeps one warp per tile. `Warps[new Tuple<byte, byte>(x, y)] =
   * warp` overwrites, with no error and no log line, so the editor is the only
   * thing that can say a warp is about to be lost.
   */
  it('says nothing when every warp has its own tile', () => {
    expect(findDuplicateWarpTiles([mapWarp(1, 1), mapWarp(2, 2)])).toEqual([])
  })

  it('reports a tile two warps share', () => {
    expect(findDuplicateWarpTiles([mapWarp(1, 1), mapWarp(1, 1, 'Piet')])).toEqual(['1,1'])
  })

  it('counts a map warp and a world warp on one tile as a clash', () => {
    // They are one collection on the server too, so the target type does not
    // save them.
    expect(findDuplicateWarpTiles([mapWarp(3, 4), worldWarp(3, 4)])).toEqual(['3,4'])
  })

  it('reports every clashing tile once, however many warps are on it', () => {
    const warps = [mapWarp(1, 1), mapWarp(1, 1), mapWarp(1, 1), mapWarp(5, 5), mapWarp(5, 5)]
    expect(findDuplicateWarpTiles(warps)).toEqual(['1,1', '5,5'])
  })

  it('does not confuse (1,11) with (11,1)', () => {
    expect(findDuplicateWarpTiles([mapWarp(1, 11), mapWarp(11, 1)])).toEqual([])
  })
})

describe('armedModeFor and clipboardLabel', () => {
  it('sends a repeat back to the mode that placed it', () => {
    expect(armedModeFor({ kind: 'warp', record: mapWarp(1, 1) })).toBe('warp-map')
    expect(armedModeFor({ kind: 'warp', record: worldWarp(1, 1) })).toBe('warp-worldmap')
    expect(armedModeFor({ kind: 'sign', record: { type: 'Sign', x: 1, y: 1 } })).toBe('sign')
  })

  it('names what is in the copy buffer', () => {
    expect(clipboardLabel({ kind: 'warp', record: worldWarp(1, 1) })).toBe('world warp')
    expect(clipboardLabel({ kind: 'warp', record: mapWarp(1, 1) })).toBe('map warp')
    expect(
      clipboardLabel({ kind: 'npc', record: { name: 'Riona', x: 1, y: 1, direction: 'South' } })
    ).toBe('NPC')
    expect(clipboardLabel({ kind: 'reactor', record: { x: 1, y: 1 } })).toBe('reactor')
  })
})

describe('markerLabel', () => {
  it('names each kind by what tells them apart on a stacked tile', () => {
    const data = mapWith({
      warps: [mapWarp(1, 1, 'Abel'), worldWarp(1, 1)],
      npcs: [{ name: 'Riona', x: 1, y: 1, direction: 'South' }],
      signs: [{ type: 'Sign', x: 1, y: 1, name: 'Notice' }],
      reactors: [{ x: 1, y: 1, script: 'door.py' }]
    })
    const labels = markersFor(data).map((m) => markerLabel(data, m))
    expect(labels).toEqual([
      'Map Warp → Abel',
      'World Warp → Temuair',
      'NPC Riona',
      'Sign Notice',
      'Reactor door.py'
    ])
  })

  it('falls back rather than printing an empty name', () => {
    const data = mapWith({
      reactors: [{ x: 1, y: 1 }],
      signs: [{ type: 'Messageboard', x: 2, y: 2 }]
    })
    expect(markerLabel(data, { kind: 'reactor', index: 0, x: 1, y: 1 })).toBe('Reactor ?')
    expect(markerLabel(data, { kind: 'sign', index: 0, x: 2, y: 2 })).toBe('Sign Messageboard')
  })
})
