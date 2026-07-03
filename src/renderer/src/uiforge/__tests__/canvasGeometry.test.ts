import { describe, it, expect } from 'vitest'
import type { UiControl, UiRect } from '../types'
import {
  screenToLogical,
  handleCenter,
  cursorForMode,
  hitTest,
  moveRect,
  resizeRect,
  roundRect,
  snapCoord,
  snapMove,
  snapResize,
  buildSnapContext,
  uniqueControlName,
  newControl,
  MIN_CONTROL_SIZE
} from '../canvasGeometry'

const ctrl = (name: string, rect: UiRect, kind: UiControl['kind'] = 'label'): UiControl => ({
  kind,
  name,
  rect
})

describe('screenToLogical', () => {
  it('divides by zoom', () => {
    expect(screenToLogical(40, 20, 2)).toEqual({ x: 20, y: 10 })
    expect(screenToLogical(40, 20, 4)).toEqual({ x: 10, y: 5 })
  })
})

describe('handleCenter', () => {
  const r: UiRect = { x: 10, y: 20, w: 40, h: 30 }
  it('locates each handle', () => {
    expect(handleCenter(r, 'nw')).toEqual({ x: 10, y: 20 })
    expect(handleCenter(r, 'ne')).toEqual({ x: 50, y: 20 })
    expect(handleCenter(r, 'se')).toEqual({ x: 50, y: 50 })
    expect(handleCenter(r, 'sw')).toEqual({ x: 10, y: 50 })
    expect(handleCenter(r, 'n')).toEqual({ x: 30, y: 20 })
    expect(handleCenter(r, 'e')).toEqual({ x: 50, y: 35 })
    expect(handleCenter(r, 's')).toEqual({ x: 30, y: 50 })
    expect(handleCenter(r, 'w')).toEqual({ x: 10, y: 35 })
  })
})

describe('cursorForMode', () => {
  it('maps handles to resize cursors', () => {
    expect(cursorForMode('move')).toBe('move')
    expect(cursorForMode('n')).toBe('ns-resize')
    expect(cursorForMode('e')).toBe('ew-resize')
    expect(cursorForMode('nw')).toBe('nwse-resize')
    expect(cursorForMode('ne')).toBe('nesw-resize')
  })
})

describe('hitTest', () => {
  const controls = [
    ctrl('a', { x: 0, y: 0, w: 20, h: 20 }),
    ctrl('b', { x: 10, y: 10, w: 20, h: 20 }) // overlaps a
  ]

  it('returns null on empty space', () => {
    expect(hitTest(controls, null, { x: 100, y: 100 }, 2)).toBeNull()
  })

  it('hits the topmost (last) control body on overlap', () => {
    expect(hitTest(controls, null, { x: 15, y: 15 }, 2)).toEqual({ name: 'b', mode: 'move' })
  })

  it('hits the lower control where the top one does not cover', () => {
    expect(hitTest(controls, null, { x: 2, y: 2 }, 2)).toEqual({ name: 'a', mode: 'move' })
  })

  it('prioritizes the selected control resize handles over bodies', () => {
    // near a's se corner (20,20) — but b's body also covers it; handle wins
    expect(hitTest(controls, 'a', { x: 20, y: 20 }, 2)).toEqual({ name: 'a', mode: 'se' })
  })

  it('ignores handles when the control is not selected', () => {
    expect(hitTest(controls, null, { x: 20, y: 20 }, 2)).toEqual({ name: 'b', mode: 'move' })
  })

  it('respects the handle radius', () => {
    // 3px from a's nw corner, radius 2 → not a handle, falls to body
    expect(hitTest(controls, 'a', { x: 3, y: 3 }, 2)).toEqual({ name: 'a', mode: 'move' })
  })
})

describe('moveRect', () => {
  it('translates without resizing', () => {
    expect(moveRect({ x: 5, y: 5, w: 10, h: 10 }, 3, -2)).toEqual({ x: 8, y: 3, w: 10, h: 10 })
  })
})

describe('resizeRect', () => {
  const r: UiRect = { x: 10, y: 10, w: 40, h: 40 }

  it('drags the SE corner, keeping origin fixed', () => {
    expect(resizeRect(r, 'se', 10, 6)).toEqual({ x: 10, y: 10, w: 50, h: 46 })
  })

  it('drags the NW corner, keeping the far edge fixed', () => {
    expect(resizeRect(r, 'nw', 4, 8)).toEqual({ x: 14, y: 18, w: 36, h: 32 })
  })

  it('moves only one axis for an edge handle', () => {
    expect(resizeRect(r, 'e', 5, 999)).toEqual({ x: 10, y: 10, w: 45, h: 40 })
    expect(resizeRect(r, 'n', 999, -5)).toEqual({ x: 10, y: 5, w: 40, h: 45 })
  })

  it('enforces the minimum size when shrinking past it', () => {
    const out = resizeRect(r, 'e', -100, 0)
    expect(out.w).toBe(MIN_CONTROL_SIZE)
    expect(out.x).toBe(10)
  })

  it('clamps NW drag so the box never inverts', () => {
    const out = resizeRect(r, 'nw', 100, 100)
    expect(out.w).toBe(MIN_CONTROL_SIZE)
    expect(out.h).toBe(MIN_CONTROL_SIZE)
    expect(out.x).toBe(50 - MIN_CONTROL_SIZE)
    expect(out.y).toBe(50 - MIN_CONTROL_SIZE)
  })
})

describe('roundRect', () => {
  it('rounds each field', () => {
    expect(roundRect({ x: 1.4, y: 2.6, w: 3.5, h: 4.49 })).toEqual({ x: 1, y: 3, w: 4, h: 4 })
  })
})

describe('snapCoord', () => {
  it('snaps to the nearest edge line within snapDist', () => {
    expect(snapCoord(11, [10, 40], 4, 3)).toBe(10)
  })

  it('falls back to the grid when no line is close', () => {
    expect(snapCoord(11, [40], 4, 3)).toBe(12)
  })

  it('prefers the closer of two candidate lines', () => {
    expect(snapCoord(12, [10, 13], 4, 3)).toBe(13)
  })

  it('passes through when grid is 0 and nothing snaps', () => {
    expect(snapCoord(11, [40], 0, 3)).toBe(11)
  })
})

describe('snapMove', () => {
  it('snaps the left edge to a sibling line, preserving size', () => {
    const ctx = buildSnapContext([], null, { x: 0, y: 0, w: 200, h: 200 }, 4, 3)
    ctx.vLines.push(50)
    ctx.hLines.push(50)
    const out = snapMove({ x: 48, y: 100, w: 20, h: 10 }, ctx)
    expect(out).toEqual({ x: 50, y: 100, w: 20, h: 10 })
  })

  it('snaps whichever edge is closest', () => {
    const ctx = { gridSize: 0, snapDist: 3, vLines: [100], hLines: [] }
    // right edge (x+w = 99) is 1px from line 100 → shift +1
    const out = snapMove({ x: 79, y: 0, w: 20, h: 10 }, ctx)
    expect(out.x).toBe(80)
  })
})

describe('snapResize', () => {
  it('snaps only the dragged edge', () => {
    const ctx = { gridSize: 0, snapDist: 3, vLines: [100], hLines: [200] }
    const out = snapResize({ x: 10, y: 10, w: 88, h: 30 }, 'e', ctx)
    // right edge 98 → 100; left stays
    expect(out).toEqual({ x: 10, y: 10, w: 90, h: 30 })
  })

  it('keeps min size if a snap would collapse the rect', () => {
    const ctx = { gridSize: 0, snapDist: 5, vLines: [12], hLines: [] }
    const out = snapResize({ x: 10, y: 0, w: 40, h: 10 }, 'w', ctx)
    // left would snap to 12 (< right-min is fine here: 50-12=38) so no clamp
    expect(out.x).toBe(12)
    expect(out.w).toBe(38)
  })
})

describe('buildSnapContext', () => {
  it('includes anchor bounds and sibling edges, excluding the dragged control', () => {
    const controls = [
      ctrl('a', { x: 10, y: 20, w: 30, h: 40 }),
      ctrl('b', { x: 5, y: 5, w: 10, h: 10 })
    ]
    const ctx = buildSnapContext(controls, 'a', { x: 0, y: 0, w: 160, h: 100 })
    expect(ctx.vLines).toContain(0)
    expect(ctx.vLines).toContain(160)
    expect(ctx.vLines).toContain(5) // b.x
    expect(ctx.vLines).toContain(15) // b.x+w
    expect(ctx.vLines).not.toContain(10) // a excluded (a.x)
  })
})

describe('uniqueControlName', () => {
  it('returns the base when free', () => {
    expect(uniqueControlName('label', ['button'])).toBe('label')
  })

  it('suffixes to avoid collisions', () => {
    expect(uniqueControlName('label', ['label', 'label_1'])).toBe('label_2')
  })
})

describe('newControl', () => {
  const anchor: UiRect = { x: 0, y: 0, w: 160, h: 100 }

  it('centers the default box on the point and names it uniquely', () => {
    const c = newControl('label', 80, 50, ['label'], anchor)
    expect(c.kind).toBe('label')
    expect(c.name).toBe('label_1')
    expect(c.rect.w).toBe(48)
    expect(c.rect.h).toBe(14)
    expect(c.rect.x).toBe(56) // 80 - 48/2
    expect(c.rect.y).toBe(43) // 50 - 14/2
  })

  it('clamps the box inside the anchor', () => {
    const c = newControl('progressbar', 0, 0, [], anchor)
    expect(c.rect.x).toBe(0)
    expect(c.rect.y).toBe(0)
    const c2 = newControl('progressbar', 200, 200, [], anchor)
    expect(c2.rect.x).toBe(160 - 80)
    expect(c2.rect.y).toBe(100 - 8)
  })
})
