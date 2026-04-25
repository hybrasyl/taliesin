import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MapFile } from '@eriscorp/dalib-ts'
import MapEditorCanvas, {
  type EditorTool,
  type Selection,
  type Clipboard,
} from '../MapEditorCanvas'
import { installMockApi } from '../../../__tests__/setup/mockApi'

// Stub mapRenderer so the component never tries to load .dat files via window.api.
// We keep the geometry helpers as the real implementations (they're pure math),
// and stub the asset/bitmap entrypoints. The component takes the !clientPath path
// in our tests anyway, so most of these stubs only matter for type compatibility.
vi.mock('../../../utils/mapRenderer', async () => {
  const actual = await vi.importActual<typeof import('../../../utils/mapRenderer')>('../../../utils/mapRenderer')
  return {
    ...actual,
    loadMapAssets: vi.fn(async () => null),
    getGroundBitmap: vi.fn(async () => null),
    getStcBitmap: vi.fn(async () => null),
    getAnimatedTileId: (_table: unknown, id: number) => id,
  }
})

// Default-prop builder
function makeProps(overrides: Partial<React.ComponentProps<typeof MapEditorCanvas>> = {}) {
  const mapFile = new MapFile(4, 4)
  // Seed a non-zero tile at (1,1) so floodFill has something to do
  mapFile.setTile(1, 1, { background: 5, leftForeground: 0, rightForeground: 0 })

  const base: React.ComponentProps<typeof MapEditorCanvas> = {
    mapFile,
    clientPath: null,
    tool: 'draw' as EditorTool,
    activeLayer: 'background',
    selectedTileId: 7,
    selectedTileIds: [7, 8, 9],
    zoom: 1,
    shapeMode: 'rect-outline',
    showGrid: false,
    showBg: true,
    showLfg: true,
    showRfg: true,
    showPassability: false,
    selection: null as Selection | null,
    clipboard: null as Clipboard | null,
    pasteMode: false,
    onTileChange: vi.fn(),
    onSampleTile: vi.fn(),
    onHoverTile: vi.fn(),
    onZoomChange: vi.fn(),
    onSelectionChange: vi.fn(),
    onRequestPaste: vi.fn(),
    onSelectionMove: vi.fn(),
    showAnimation: false,
    onContextAction: vi.fn(),
    renderVersion: 0,
    ...overrides,
  }
  return base
}

beforeEach(() => {
  installMockApi()
})

describe('MapEditorCanvas — smoke', () => {
  it('renders both canvases without crashing for a small map', async () => {
    const { container } = render(<MapEditorCanvas {...makeProps()} />)
    const canvases = container.querySelectorAll('canvas')
    expect(canvases.length).toBe(2) // base + overlay
    // Loading indicator clears once doFullRender resolves
    await waitFor(() => expect(screen.queryByText(/Rendering/i)).toBeNull())
  })

  it('clears the status text after the initial render completes', async () => {
    render(<MapEditorCanvas {...makeProps()} />)
    await waitFor(() => expect(screen.queryByText(/Loading|Rendering/)).toBeNull())
  })
})

describe('MapEditorCanvas — sample tool', () => {
  it('calls onSampleTile with the active-layer value at the clicked tile', async () => {
    const onSampleTile = vi.fn()
    const props = makeProps({ tool: 'sample', onSampleTile })
    // Seed a recognizable tile id at (0,0)
    props.mapFile.setTile(0, 0, { background: 42, leftForeground: 0, rightForeground: 0 })
    const { container } = render(<MapEditorCanvas {...props} />)
    await waitFor(() => expect(screen.queryByText(/Rendering/)).toBeNull())

    const overlay = container.querySelectorAll('canvas')[1]!
    // For a 4×4 map: originX = H * HTILE_W = 112, originY = ISO_FOREGROUND_PAD = 512.
    // Tile (0,0) center is at (originX, originY + HALF_H) = (112, 526).
    fireEvent.mouseDown(overlay, { button: 0, clientX: 112, clientY: 526 })

    expect(onSampleTile).toHaveBeenCalledTimes(1)
    expect(onSampleTile.mock.calls[0][0]).toBe(42)
  })
})

describe('MapEditorCanvas — fill tool', () => {
  it('flood-fills on click and calls onTileChange with the resulting changes', async () => {
    const onTileChange = vi.fn()
    // 2x2 map, all background=0 → flood fill from (0,0) to id=9 should produce 4 changes.
    const mapFile = new MapFile(2, 2)
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++)
        mapFile.setTile(x, y, { background: 0, leftForeground: 0, rightForeground: 0 })

    const props = makeProps({ tool: 'fill', mapFile, selectedTileId: 9, onTileChange })
    const { container } = render(<MapEditorCanvas {...props} />)
    await waitFor(() => expect(screen.queryByText(/Rendering/)).toBeNull())

    const overlay = container.querySelectorAll('canvas')[1]!
    // For a 2×2 map: originX = 2 * 28 = 56. Clicking near origin lands on tile (0,0).
    fireEvent.mouseDown(overlay, { button: 0, clientX: 56, clientY: 526 })

    expect(onTileChange).toHaveBeenCalledTimes(1)
    const changes = onTileChange.mock.calls[0][0]
    expect(changes).toHaveLength(4)
    expect(changes.every((c: { newValue: number }) => c.newValue === 9)).toBe(true)
  })
})

describe('MapEditorCanvas — context menu', () => {
  it('opens the right-click menu showing tool actions', async () => {
    const props = makeProps()
    const { container } = render(<MapEditorCanvas {...props} />)
    await waitFor(() => expect(screen.queryByText(/Rendering/)).toBeNull())

    const overlay = container.querySelectorAll('canvas')[1]!
    fireEvent.contextMenu(overlay, { button: 2, clientX: 112, clientY: 526 })

    // MUI Menu renders into a portal; query screen, not container.
    expect(await screen.findByText('Sample Tile')).toBeInTheDocument()
    expect(screen.getByText('Fill From Here')).toBeInTheDocument()
    // Background is on by default → menu shows "Hide Background"
    expect(screen.getByText(/Hide Background/)).toBeInTheDocument()
  })

  it('shows Cut/Copy/Delete entries only when a selection exists', async () => {
    const props = makeProps({ selection: { x: 0, y: 0, w: 1, h: 1 } })
    const { container } = render(<MapEditorCanvas {...props} />)
    await waitFor(() => expect(screen.queryByText(/Rendering/)).toBeNull())

    const overlay = container.querySelectorAll('canvas')[1]!
    fireEvent.contextMenu(overlay, { button: 2, clientX: 112, clientY: 526 })

    expect(await screen.findByText('Cut')).toBeInTheDocument()
    expect(screen.getByText('Copy')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
    expect(screen.getByText('Create Prefab')).toBeInTheDocument()
  })

  it('shows Paste only when there is a clipboard payload', async () => {
    const clipboard: Clipboard = {
      tiles: [{ background: 1, leftForeground: 0, rightForeground: 0 }],
      w: 1, h: 1,
    }
    const props = makeProps({ clipboard })
    const { container } = render(<MapEditorCanvas {...props} />)
    await waitFor(() => expect(screen.queryByText(/Rendering/)).toBeNull())

    const overlay = container.querySelectorAll('canvas')[1]!
    fireEvent.contextMenu(overlay, { button: 2, clientX: 112, clientY: 526 })

    expect(await screen.findByText('Paste')).toBeInTheDocument()
  })
})

describe('MapEditorCanvas — paste mode', () => {
  it('clicking in paste mode dispatches onRequestPaste with tile coords and shift flag', async () => {
    const onRequestPaste = vi.fn()
    const clipboard: Clipboard = {
      tiles: [{ background: 1, leftForeground: 0, rightForeground: 0 }], w: 1, h: 1,
    }
    const props = makeProps({ pasteMode: true, clipboard, onRequestPaste })
    const { container } = render(<MapEditorCanvas {...props} />)
    await waitFor(() => expect(screen.queryByText(/Rendering/)).toBeNull())

    const overlay = container.querySelectorAll('canvas')[1]!
    fireEvent.mouseDown(overlay, { button: 0, clientX: 112, clientY: 526, shiftKey: true })

    expect(onRequestPaste).toHaveBeenCalledTimes(1)
    expect(onRequestPaste.mock.calls[0][2]).toBe(true) // shift held → keepPasting = true
  })
})
