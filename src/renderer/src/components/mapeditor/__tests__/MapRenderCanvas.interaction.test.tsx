import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/dom'
import MapRenderCanvas, { type MapMarker, type MapRenderCanvasProps } from '../MapRenderCanvas'

/**
 * The canvas as an input device.
 *
 * Two faults are covered here. The hit test used to be `markers.find(...)`,
 * which reports one marker per tile — and reactors stack on the server, so a
 * second reactor on a tile drew under the first and could never be clicked
 * (HTOO-442). And there was no mouse-down state at all, so a marker could be
 * selected but never carried (HTOO-445).
 *
 * The tests run in schematic mode: no client path and no map directory, so the
 * canvas draws a blank grid and the coordinate maths is exact. At zoom 1 a tile
 * is 10 pixels, so tile (tx, ty) is any point in the 10-pixel square at
 * (tx * 10, ty * 10). jsdom reports a zero-origin bounding box, so a client
 * coordinate is a canvas coordinate.
 */

const TILE = 10

/** A point inside tile (tx, ty). */
function at(tx: number, ty: number): { clientX: number; clientY: number } {
  return { clientX: tx * TILE + TILE / 2, clientY: ty * TILE + TILE / 2 }
}

const REACTOR_A: MapMarker = { kind: 'reactor', index: 0, x: 3, y: 4 }
const REACTOR_B: MapMarker = { kind: 'reactor', index: 1, x: 3, y: 4 }
const WARP: MapMarker = { kind: 'warp', index: 0, x: 8, y: 8 }

function makeHandlers() {
  return {
    onMarkerClick: vi.fn<NonNullable<MapRenderCanvasProps['onMarkerClick']>>(),
    onMarkerMove: vi.fn<NonNullable<MapRenderCanvasProps['onMarkerMove']>>(),
    onTileClick: vi.fn<NonNullable<MapRenderCanvasProps['onTileClick']>>()
  }
}
type Handlers = ReturnType<typeof makeHandlers>

async function renderCanvas(
  markers: MapMarker[],
  overrides: Partial<MapRenderCanvasProps> = {}
): Promise<{ overlay: HTMLCanvasElement } & Handlers> {
  const handlers = makeHandlers()
  const { container } = render(
    <MapRenderCanvas
      mapId={500}
      mapWidth={20}
      mapHeight={20}
      mapDirectory={null}
      clientPath={null}
      zoom={1}
      markers={markers}
      placeMode
      {...handlers}
      {...overrides}
    />
  )
  const canvases = container.querySelectorAll('canvas')
  const overlay = canvases[1] as HTMLCanvasElement
  // The base render is async; the overlay cannot hit-test until it lands.
  await waitFor(() => expect(overlay.width).toBeGreaterThan(0))
  return { overlay, ...handlers }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MapRenderCanvas — reaching a stacked node', () => {
  it('reports every marker on the clicked tile, not the first one', async () => {
    const { overlay, onMarkerClick } = await renderCanvas([REACTOR_A, REACTOR_B])

    fireEvent.click(overlay, at(3, 4))

    expect(onMarkerClick).toHaveBeenCalledTimes(1)
    expect(onMarkerClick.mock.calls[0]![0]).toEqual([REACTOR_A, REACTOR_B])
  })

  it('reports a single hit as a list of one, so the caller has one shape to read', async () => {
    const { overlay, onMarkerClick } = await renderCanvas([REACTOR_A, WARP])

    fireEvent.click(overlay, at(8, 8))

    expect(onMarkerClick.mock.calls[0]![0]).toEqual([WARP])
  })

  it('gives the click position, so a menu can open where the author clicked', async () => {
    const { overlay, onMarkerClick } = await renderCanvas([REACTOR_A, REACTOR_B])

    fireEvent.click(overlay, at(3, 4))

    expect(onMarkerClick.mock.calls[0]![1]).toEqual({ x: 35, y: 45 })
  })

  it('places on an empty tile rather than reporting a marker', async () => {
    const { overlay, onMarkerClick, onTileClick } = await renderCanvas([REACTOR_A])

    fireEvent.click(overlay, at(12, 12))

    expect(onMarkerClick).not.toHaveBeenCalled()
    expect(onTileClick).toHaveBeenCalledWith(12, 12, { shift: false })
  })

  it('passes the shift key, which repeats the last placed node', async () => {
    const { overlay, onTileClick } = await renderCanvas([])

    fireEvent.click(overlay, { ...at(6, 6), shiftKey: true })

    expect(onTileClick).toHaveBeenCalledWith(6, 6, { shift: true })
  })
})

describe('MapRenderCanvas — dragging a node', () => {
  it('commits the marker at the tile it was released on', async () => {
    const { overlay, onMarkerMove } = await renderCanvas([WARP])

    fireEvent.mouseDown(overlay, { ...at(8, 8), button: 0 })
    fireEvent.mouseMove(overlay, at(11, 13))
    fireEvent.mouseUp(overlay, at(11, 13))

    expect(onMarkerMove).toHaveBeenCalledWith(WARP, 11, 13)
  })

  it('drops the click that follows a committed drag', async () => {
    // The click would otherwise toggle the selection straight back off, which
    // reads as the move having failed.
    const { overlay, onMarkerMove, onMarkerClick } = await renderCanvas([WARP])

    fireEvent.mouseDown(overlay, { ...at(8, 8), button: 0 })
    fireEvent.mouseMove(overlay, at(11, 13))
    fireEvent.mouseUp(overlay, at(11, 13))
    fireEvent.click(overlay, at(11, 13))

    expect(onMarkerMove).toHaveBeenCalledTimes(1)
    expect(onMarkerClick).not.toHaveBeenCalled()
  })

  it('treats a press and release on one tile as a click, not a move', async () => {
    const { overlay, onMarkerMove, onMarkerClick } = await renderCanvas([WARP])

    fireEvent.mouseDown(overlay, { ...at(8, 8), button: 0 })
    fireEvent.mouseUp(overlay, at(8, 8))
    fireEvent.click(overlay, at(8, 8))

    expect(onMarkerMove).not.toHaveBeenCalled()
    expect(onMarkerClick.mock.calls[0]![0]).toEqual([WARP])
  })

  it('abandons a drag on Escape and leaves the node where it was', async () => {
    const { overlay, onMarkerMove } = await renderCanvas([WARP])

    fireEvent.mouseDown(overlay, { ...at(8, 8), button: 0 })
    fireEvent.mouseMove(overlay, at(11, 13))
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.mouseUp(overlay, at(11, 13))

    expect(onMarkerMove).not.toHaveBeenCalled()
  })

  it('abandons a drag that leaves the canvas', async () => {
    // Committing at the last tile inside the border would move the node
    // somewhere the author never pointed at.
    const { overlay, onMarkerMove } = await renderCanvas([WARP])

    fireEvent.mouseDown(overlay, { ...at(8, 8), button: 0 })
    fireEvent.mouseMove(overlay, at(11, 13))
    // React derives onMouseLeave from the native mouseout event, so that is
    // what the pointer actually leaving the canvas looks like here.
    fireEvent.mouseOut(overlay, { relatedTarget: document.body })
    fireEvent.mouseUp(overlay, at(11, 13))

    expect(onMarkerMove).not.toHaveBeenCalled()
  })

  it('does not carry a node off a stacked tile, where the grab is ambiguous', async () => {
    const { overlay, onMarkerMove } = await renderCanvas([REACTOR_A, REACTOR_B])

    fireEvent.mouseDown(overlay, { ...at(3, 4), button: 0 })
    fireEvent.mouseMove(overlay, at(6, 6))
    fireEvent.mouseUp(overlay, at(6, 6))

    expect(onMarkerMove).not.toHaveBeenCalled()
  })

  it('ignores a right-button press', async () => {
    const { overlay, onMarkerMove } = await renderCanvas([WARP])

    fireEvent.mouseDown(overlay, { ...at(8, 8), button: 2 })
    fireEvent.mouseMove(overlay, at(11, 13))
    fireEvent.mouseUp(overlay, at(11, 13))

    expect(onMarkerMove).not.toHaveBeenCalled()
  })

  it('does not drag at all when the caller accepts no move', async () => {
    const { overlay, onMarkerClick } = await renderCanvas([WARP], { onMarkerMove: undefined })

    fireEvent.mouseDown(overlay, { ...at(8, 8), button: 0 })
    fireEvent.mouseMove(overlay, at(11, 13))
    fireEvent.mouseUp(overlay, at(11, 13))
    fireEvent.click(overlay, at(11, 13))

    // The click still works; it just lands on an empty tile.
    expect(onMarkerClick).not.toHaveBeenCalled()
  })
})
