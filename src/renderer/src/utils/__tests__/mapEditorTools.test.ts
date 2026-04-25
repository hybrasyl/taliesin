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
