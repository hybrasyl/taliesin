import { describe, it, expect } from 'vitest'
import { MapFile } from '@eriscorp/dalib-ts'
import {
  floodFill,
  bresenhamLine,
  rectOutline,
  rectFilled,
  circleOutline,
  circleFilled,
  getShapeCoords,
  applyChanges,
  revertChanges,
  clampTile,
  captureSelection,
  clearSelectionChanges,
  randomFillRect,
  type TileLayerKey
} from '../mapEditorTools'

function makeMap(
  width: number,
  height: number,
  fillId = 0,
  layer: TileLayerKey = 'background'
): MapFile {
  const m = new MapFile(width, height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      m.setTile(x, y, { background: 0, leftForeground: 0, rightForeground: 0, [layer]: fillId })
    }
  }
  return m
}

function paint(m: MapFile, layer: TileLayerKey, coords: Array<[number, number]>, id: number) {
  for (const [x, y] of coords) {
    const t = m.getTile(x, y)
    m.setTile(x, y, { ...t, [layer]: id })
  }
}

// ── floodFill ─────────────────────────────────────────────────────────────────

describe('floodFill', () => {
  it('returns no changes when start tile already matches new id', () => {
    const m = makeMap(5, 5, 7)
    expect(floodFill(m, 2, 2, 'background', 7)).toEqual([])
  })

  it('fills a uniform region completely', () => {
    const m = makeMap(3, 3, 0)
    const changes = floodFill(m, 0, 0, 'background', 9)
    expect(changes).toHaveLength(9)
    for (const c of changes) {
      expect(c.layer).toBe('background')
      expect(c.oldValue).toBe(0)
      expect(c.newValue).toBe(9)
    }
  })

  it('respects barriers of other tile ids (4-connected)', () => {
    // Layout (background ids):
    //   0 0 0
    //   1 1 0     ← row of 1s separates the start from the top row's right
    //   0 0 0
    const m = makeMap(3, 3, 0)
    paint(
      m,
      'background',
      [
        [0, 1],
        [1, 1]
      ],
      1
    )
    // Start at (0,0); should flood the top row + the (2,1) gap + entire bottom row.
    const changes = floodFill(m, 0, 0, 'background', 9)
    const filled = new Set(changes.map((c) => `${c.x},${c.y}`))
    expect(filled.has('0,0')).toBe(true)
    expect(filled.has('1,0')).toBe(true)
    expect(filled.has('2,0')).toBe(true)
    expect(filled.has('2,1')).toBe(true)
    expect(filled.has('0,2')).toBe(true)
    expect(filled.has('1,2')).toBe(true)
    expect(filled.has('2,2')).toBe(true)
    expect(filled.has('0,1')).toBe(false) // barrier
    expect(filled.has('1,1')).toBe(false) // barrier
  })

  it('only fills tiles inside map bounds', () => {
    const m = makeMap(2, 2, 0)
    const changes = floodFill(m, 0, 0, 'background', 5)
    expect(changes).toHaveLength(4)
    expect(changes.every((c) => c.x >= 0 && c.x < 2 && c.y >= 0 && c.y < 2)).toBe(true)
  })

  it('fills only the specified layer', () => {
    const m = makeMap(2, 2, 0, 'leftForeground')
    const changes = floodFill(m, 0, 0, 'leftForeground', 3)
    expect(changes).toHaveLength(4)
    expect(changes.every((c) => c.layer === 'leftForeground')).toBe(true)
  })
})

// ── bresenhamLine ─────────────────────────────────────────────────────────────

describe('bresenhamLine', () => {
  it('returns a single coord for a degenerate line', () => {
    expect(bresenhamLine(3, 4, 3, 4)).toEqual([{ tx: 3, ty: 4 }])
  })

  it('produces a horizontal line from low to high X', () => {
    expect(bresenhamLine(0, 0, 3, 0)).toEqual([
      { tx: 0, ty: 0 },
      { tx: 1, ty: 0 },
      { tx: 2, ty: 0 },
      { tx: 3, ty: 0 }
    ])
  })

  it('produces a vertical line from high to low Y', () => {
    expect(bresenhamLine(0, 3, 0, 0)).toEqual([
      { tx: 0, ty: 3 },
      { tx: 0, ty: 2 },
      { tx: 0, ty: 1 },
      { tx: 0, ty: 0 }
    ])
  })

  it('produces a diagonal line of length n', () => {
    const coords = bresenhamLine(0, 0, 3, 3)
    expect(coords).toEqual([
      { tx: 0, ty: 0 },
      { tx: 1, ty: 1 },
      { tx: 2, ty: 2 },
      { tx: 3, ty: 3 }
    ])
  })

  it('is symmetric: reversing endpoints yields a reversed coord set', () => {
    const a = bresenhamLine(2, 1, 8, 5)
    const b = bresenhamLine(8, 5, 2, 1).reverse()
    expect(a).toEqual(b)
  })

  it('starts at start and ends at end', () => {
    const coords = bresenhamLine(2, 7, 9, 3)
    expect(coords[0]).toEqual({ tx: 2, ty: 7 })
    expect(coords[coords.length - 1]).toEqual({ tx: 9, ty: 3 })
  })
})

// ── rectOutline / rectFilled ──────────────────────────────────────────────────

describe('rectangle shapes', () => {
  it('rectOutline returns the perimeter of a 3x3 rectangle (8 cells)', () => {
    const coords = rectOutline(0, 0, 2, 2)
    expect(coords).toHaveLength(8)
    const set = new Set(coords.map((c) => `${c.tx},${c.ty}`))
    expect(set.has('1,1')).toBe(false) // interior excluded
    for (let x = 0; x <= 2; x++) {
      expect(set.has(`${x},0`)).toBe(true)
      expect(set.has(`${x},2`)).toBe(true)
    }
    expect(set.has('0,1')).toBe(true)
    expect(set.has('2,1')).toBe(true)
  })

  it('rectFilled returns every cell in a 3x4 rectangle (12 cells)', () => {
    const coords = rectFilled(0, 0, 2, 3)
    expect(coords).toHaveLength(12)
  })

  it('handles reversed endpoints (x1<x0 or y1<y0)', () => {
    expect(rectFilled(2, 3, 0, 0)).toHaveLength(12)
    expect(rectOutline(2, 2, 0, 0)).toHaveLength(8)
  })

  it('rectOutline degenerates correctly for a 1×N line', () => {
    expect(rectOutline(0, 0, 0, 4)).toHaveLength(5)
    expect(rectOutline(0, 0, 4, 0)).toHaveLength(5)
  })
})

// ── circleOutline / circleFilled ──────────────────────────────────────────────

describe('ellipse shapes', () => {
  it('circleOutline returns a single cell when both radii are < 0.5', () => {
    expect(circleOutline(3, 3, 3, 3)).toEqual([{ tx: 3, ty: 3 }])
  })

  it('circleOutline produces only cells within the bounding box', () => {
    const coords = circleOutline(0, 0, 10, 10)
    for (const { tx, ty } of coords) {
      expect(tx).toBeGreaterThanOrEqual(0)
      expect(ty).toBeGreaterThanOrEqual(0)
      expect(tx).toBeLessThanOrEqual(10)
      expect(ty).toBeLessThanOrEqual(10)
    }
    expect(coords.length).toBeGreaterThan(8)
  })

  it('circleOutline deduplicates coords', () => {
    const coords = circleOutline(0, 0, 8, 8)
    const set = new Set(coords.map((c) => `${c.tx},${c.ty}`))
    expect(set.size).toBe(coords.length)
  })

  it('circleFilled is bounded by its rect and includes the centre', () => {
    const coords = circleFilled(0, 0, 8, 8)
    const set = new Set(coords.map((c) => `${c.tx},${c.ty}`))
    expect(set.has('4,4')).toBe(true)
    // Corner of the bounding box is outside the ellipse
    expect(set.has('0,0')).toBe(false)
    expect(set.has('8,8')).toBe(false)
  })
})

// ── getShapeCoords dispatch ───────────────────────────────────────────────────

describe('getShapeCoords', () => {
  it('dispatches each ShapeMode to its underlying function', () => {
    expect(getShapeCoords(0, 0, 2, 2, 'rect-outline')).toHaveLength(8)
    expect(getShapeCoords(0, 0, 2, 2, 'rect-filled')).toHaveLength(9)
    expect(getShapeCoords(0, 0, 4, 4, 'circle-filled').length).toBeGreaterThan(0)
    expect(getShapeCoords(0, 0, 4, 4, 'circle-outline').length).toBeGreaterThan(0)
  })
})

// ── applyChanges / revertChanges (undo invariant) ─────────────────────────────

describe('apply/revert changes', () => {
  it('applyChanges mutates the tile values', () => {
    const m = makeMap(2, 2, 0)
    applyChanges(m, [
      { x: 0, y: 0, layer: 'background', oldValue: 0, newValue: 7 },
      { x: 1, y: 1, layer: 'rightForeground', oldValue: 0, newValue: 9 }
    ])
    expect(m.getTile(0, 0).background).toBe(7)
    expect(m.getTile(1, 1).rightForeground).toBe(9)
    expect(m.getTile(0, 0).leftForeground).toBe(0) // untouched layer
  })

  it('revertChanges undoes apply, restoring original state', () => {
    const m = makeMap(3, 3, 0)
    const changes = floodFill(m, 0, 0, 'background', 5)
    applyChanges(m, changes)
    expect(m.getTile(2, 2).background).toBe(5)
    revertChanges(m, changes)
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        expect(m.getTile(x, y).background).toBe(0)
      }
    }
  })

  it('apply → revert is identity for any change list (round trip invariant)', () => {
    const m = makeMap(4, 4, 1)
    const changes = floodFill(m, 0, 0, 'background', 99)
    applyChanges(m, changes)
    revertChanges(m, changes)
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        expect(m.getTile(x, y).background).toBe(1)
      }
    }
  })
})

// ── clampTile ─────────────────────────────────────────────────────────────────

describe('clampTile', () => {
  it('clamps negatives to zero', () => {
    expect(clampTile(-5, -1, 10, 10)).toEqual({ tx: 0, ty: 0 })
  })

  it('clamps values past the upper bound to W-1 / H-1', () => {
    expect(clampTile(20, 25, 10, 10)).toEqual({ tx: 9, ty: 9 })
  })

  it('passes through valid values unchanged', () => {
    expect(clampTile(3, 4, 10, 10)).toEqual({ tx: 3, ty: 4 })
  })
})

// ── randomFillRect ────────────────────────────────────────────────────────────

describe('randomFillRect', () => {
  // The pick is injected in every test below so the assertions are about the
  // rectangle and the empty-only rule, not about Math.random.
  const first = (ids: readonly number[]): number => ids[0]

  it('fills the whole rectangle on the active layer', () => {
    const m = makeMap(6, 6)
    const changes = randomFillRect(m, { x: 1, y: 1, w: 3, h: 2 }, 'background', [9], {
      pick: first
    })
    expect(changes).toHaveLength(6)
    expect(changes.every((c) => c.layer === 'background' && c.newValue === 9)).toBe(true)
    expect(changes.map((c) => `${c.x},${c.y}`).sort()).toEqual(
      ['1,1', '1,2', '2,1', '2,2', '3,1', '3,2'].sort()
    )
  })

  it('does not mutate the map — the caller applies the batch', () => {
    const m = makeMap(4, 4)
    randomFillRect(m, { x: 0, y: 0, w: 4, h: 4 }, 'background', [9], { pick: first })
    expect(m.getTile(0, 0).background).toBe(0)
  })

  // The brush refuses to overwrite an occupied cell, and the batch keeps that
  // rule so the tool never silently starts destroying work it used to skip.
  it('skips occupied cells by default', () => {
    const m = makeMap(4, 4)
    paint(m, 'background', [[1, 1]], 3)
    const changes = randomFillRect(m, { x: 0, y: 0, w: 2, h: 2 }, 'background', [9], {
      pick: first
    })
    expect(changes.map((c) => `${c.x},${c.y}`)).not.toContain('1,1')
    expect(changes).toHaveLength(3)
  })

  it('overwrites occupied cells when asked', () => {
    const m = makeMap(4, 4)
    paint(m, 'background', [[1, 1]], 3)
    const changes = randomFillRect(m, { x: 0, y: 0, w: 2, h: 2 }, 'background', [9], {
      overwrite: true,
      pick: first
    })
    expect(changes).toHaveLength(4)
    expect(changes.find((c) => c.x === 1 && c.y === 1)).toMatchObject({ oldValue: 3, newValue: 9 })
  })

  it('records no change where the pick matches what is already there', () => {
    const m = makeMap(4, 4)
    paint(m, 'background', [[0, 0]], 9)
    const changes = randomFillRect(m, { x: 0, y: 0, w: 2, h: 1 }, 'background', [9], {
      overwrite: true,
      pick: first
    })
    expect(changes.map((c) => c.x)).toEqual([1])
  })

  it('clips to the map rather than running off the edge', () => {
    const m = makeMap(3, 3)
    const changes = randomFillRect(m, { x: 2, y: 2, w: 4, h: 4 }, 'background', [9], {
      pick: first
    })
    expect(changes).toEqual([{ x: 2, y: 2, layer: 'background', oldValue: 0, newValue: 9 }])
  })

  it('does nothing with no tiles selected', () => {
    const m = makeMap(3, 3)
    expect(randomFillRect(m, { x: 0, y: 0, w: 3, h: 3 }, 'background', [])).toEqual([])
  })

  it('draws from every selected id', () => {
    const m = makeMap(10, 10)
    const changes = randomFillRect(m, { x: 0, y: 0, w: 10, h: 10 }, 'leftForeground', [1, 2, 3])
    expect(new Set(changes.map((c) => c.newValue))).toEqual(new Set([1, 2, 3]))
    expect(changes.every((c) => c.layer === 'leftForeground')).toBe(true)
  })
})

// ── captureSelection / clearSelectionChanges ─────────────────────────────────

describe('captureSelection and clearSelectionChanges', () => {
  const ALL = { background: true, leftForeground: true, rightForeground: true }
  const GROUND_ONLY = { background: true, leftForeground: false, rightForeground: false }

  /** One 2×2 map with all three layers set on every tile. */
  function threeLayerMap(): MapFile {
    const m = new MapFile(2, 2)
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        m.setTile(x, y, { background: 1, leftForeground: 2, rightForeground: 3 })
      }
    }
    return m
  }

  const rect = { x: 0, y: 0, w: 2, h: 2 }

  it('captures all three layers when all three are visible', () => {
    const tiles = captureSelection(threeLayerMap(), rect, ALL)
    expect(tiles).toHaveLength(4)
    expect(tiles[0]).toEqual({ background: 1, leftForeground: 2, rightForeground: 3 })
  })

  // The reported surprise: turn off both foregrounds, copy, paste, and the
  // foregrounds you could not see come with it.
  it('zeroes a hidden layer rather than capturing it', () => {
    const tiles = captureSelection(threeLayerMap(), rect, GROUND_ONLY)
    expect(tiles.every((t) => t.leftForeground === 0 && t.rightForeground === 0)).toBe(true)
    expect(tiles.every((t) => t.background === 1)).toBe(true)
  })

  it('pads out-of-bounds tiles as empty, so the block keeps its shape', () => {
    const tiles = captureSelection(threeLayerMap(), { x: 1, y: 1, w: 2, h: 2 }, ALL)
    expect(tiles).toHaveLength(4)
    expect(tiles[0]).toEqual({ background: 1, leftForeground: 2, rightForeground: 3 })
    expect(tiles.slice(1)).toEqual([
      { background: 0, leftForeground: 0, rightForeground: 0 },
      { background: 0, leftForeground: 0, rightForeground: 0 },
      { background: 0, leftForeground: 0, rightForeground: 0 }
    ])
  })

  it('clears every visible layer', () => {
    const changes = clearSelectionChanges(threeLayerMap(), rect, ALL)
    expect(changes).toHaveLength(12) // 4 tiles × 3 layers
    expect(changes.every((c) => c.newValue === 0)).toBe(true)
  })

  // Cut and Delete obey the toggles too: losing hidden foregrounds to a Delete
  // is the same surprise as copying them invisibly.
  it('leaves a hidden layer alone', () => {
    const changes = clearSelectionChanges(threeLayerMap(), rect, GROUND_ONLY)
    expect(changes).toHaveLength(4)
    expect(changes.every((c) => c.layer === 'background')).toBe(true)
  })

  it('records nothing for an already empty layer', () => {
    const changes = clearSelectionChanges(makeMap(2, 2), rect, ALL)
    expect(changes).toEqual([])
  })

  it('stays inside the map', () => {
    const changes = clearSelectionChanges(threeLayerMap(), { x: 1, y: 1, w: 4, h: 4 }, ALL)
    expect(changes.every((c) => c.x === 1 && c.y === 1)).toBe(true)
  })
})
