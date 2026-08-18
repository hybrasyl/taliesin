import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { fireEvent } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import MapEditorPanel from '../MapEditorPanel'
import { resetStores } from '../../../__tests__/setup/storeWrapper'
import { DEFAULT_MAP, type MapData, type MapWarp } from '../../../data/mapData'

/**
 * The Placement tab, as an author uses it.
 *
 * Four things are covered: a warning the server cannot give (two warps on one
 * tile are one warp, HTOO-442), a menu that reaches a node no click could reach
 * before, repeat-last-placed (HTOO-443) and copy/paste (HTOO-444) — including
 * the one kind that cannot be duplicated silently.
 *
 * The canvas renders in schematic mode: no client path and no map directory.
 * The tab opens at zoom 0.4, so a tile is `max(2, round(0.4 * 10))` = 4 pixels,
 * and jsdom reports a zero-origin bounding box — a client coordinate is a
 * canvas coordinate.
 */

const TILE = 4

function at(tx: number, ty: number): { clientX: number; clientY: number } {
  return { clientX: tx * TILE + TILE / 2, clientY: ty * TILE + TILE / 2 }
}

const mapWarp = (x: number, y: number, target = 'Abel'): MapWarp => ({
  x,
  y,
  targetType: 'map',
  mapTargetName: target,
  mapTargetX: 5,
  mapTargetY: 6
})

/** The edit button on a list row, which carries an icon and no label. */
function editButtonFor(text: string): HTMLElement {
  const row = screen.getByText(text).closest('li')
  if (!row) throw new Error(`no list row for ${text}`)
  const button = within(row).getByTestId('EditIcon').closest('button')
  if (!button) throw new Error(`no edit button for ${text}`)
  return button
}

/** An MUI Autocomplete input, which is a combobox rather than a labelled field. */
function comboboxIn(scope: HTMLElement, name: string): HTMLInputElement {
  return within(scope).getByRole('combobox', { name }) as HTMLInputElement
}

async function renderPanel(patch: Partial<MapData> = {}) {
  const saveRef = { current: null } as React.MutableRefObject<(() => Promise<void>) | null>
  const view = render(
    <MapEditorPanel
      map={{ ...DEFAULT_MAP, id: 500, name: 'Mileth', x: 20, y: 20, ...patch }}
      initialFileName="lod00500.xml"
      initialFolder=""
      folderOptions={[]}
      isArchived={false}
      isExisting
      mapNames={['Abel', 'Piet']}
      npcNames={['Riona']}
      worldMapNames={['Temuair']}
      spawnGroupNames={[]}
      onSave={vi.fn()}
      onDirtyChange={vi.fn()}
      saveRef={saveRef}
    />
  )
  // The tab is only mounted while selected, and so is its key handler.
  await userEvent.click(screen.getByRole('tab', { name: 'Placement' }))
  const overlay = await waitFor(() => {
    const canvases = view.container.querySelectorAll('canvas')
    const el = canvases[1] as HTMLCanvasElement | undefined
    expect(el?.width).toBeGreaterThan(0)
    return el as HTMLCanvasElement
  })
  return { ...view, overlay }
}

beforeEach(() => {
  resetStores()
  vi.clearAllMocks()
})

describe('Placement tab — two warps on one tile', () => {
  it('says nothing when every warp has its own tile', async () => {
    await renderPanel({ warps: [mapWarp(1, 1), mapWarp(2, 2)] })
    expect(screen.queryByText(/share tile/i)).toBeNull()
  })

  it('warns that the server keeps only one of them', async () => {
    // `Warps[new Tuple<byte, byte>(x, y)] = warp` overwrites with no error and
    // no log line, so the editor is the only thing that can say so.
    await renderPanel({ warps: [mapWarp(4, 5), mapWarp(4, 5, 'Piet')] })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('(4,5)')
    expect(alert.textContent).toContain('the last one in the file wins')
  })

  it('names each clashing tile once, however many warps sit on it', async () => {
    await renderPanel({
      warps: [mapWarp(4, 5), mapWarp(4, 5, 'Piet'), mapWarp(4, 5, 'Suomi'), mapWarp(1, 1)]
    })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent?.match(/\(4,5\)/g)).toHaveLength(1)
    expect(alert.textContent).not.toContain('(1,1)')
  })
})

describe('Placement tab — a stacked tile', () => {
  it('asks which node was meant, rather than always taking the first', async () => {
    // Reactors stack on the server: a dictionary per tile, keyed by GUID, and
    // every one runs. The canvas used to find only the first.
    const { overlay } = await renderPanel({
      reactors: [
        { x: 6, y: 6, script: 'door.py' },
        { x: 6, y: 6, displayName: 'Trap' }
      ]
    })

    fireEvent.click(overlay, at(6, 6))

    const menu = await screen.findByRole('menu')
    expect(within(menu).getByText('Reactor door.py')).toBeTruthy()
    expect(within(menu).getByText('Reactor Trap')).toBeTruthy()
  })

  it('does not open a menu for a tile holding one node', async () => {
    const { overlay } = await renderPanel({ reactors: [{ x: 6, y: 6, script: 'door.py' }] })
    fireEvent.click(overlay, at(6, 6))
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })
})

describe('Placement tab — copy and paste', () => {
  it('copies the selected node and pastes it at the pointer', async () => {
    const { overlay } = await renderPanel({ reactors: [{ x: 6, y: 6, script: 'door.py' }] })

    fireEvent.click(overlay, at(6, 6))
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true })
    expect(await screen.findByText('Copied: reactor')).toBeTruthy()

    fireEvent.mouseMove(overlay, at(9, 11))
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })

    expect(await screen.findByText('(9,11) [door.py]')).toBeTruthy()
  })

  it('carries the details, which is the whole point of a copy', async () => {
    const { overlay } = await renderPanel({
      warps: [{ ...mapWarp(3, 3, 'Abel'), description: 'The inn door' }]
    })

    fireEvent.click(overlay, at(3, 3))
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true })
    fireEvent.mouseMove(overlay, at(7, 7))
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })

    // A second warp to Abel, and no dialog opened to type the destination again.
    expect(await screen.findByText('(7,7) → Abel')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does nothing on paste with an empty buffer', async () => {
    const { overlay } = await renderPanel({ reactors: [{ x: 6, y: 6 }] })
    fireEvent.mouseMove(overlay, at(9, 9))
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })
    await waitFor(() => expect(screen.queryByText('(9,9)')).toBeNull())
  })

  it('opens the dialog with the name cleared when the copy is an NPC', async () => {
    // The server registers a placed NPC by name, globally:
    //   World.WorldState.Set(merchant.Name, merchant)
    // Two NPCs sharing a name overwrite each other in world state, on this map
    // or on any other. So this one kind cannot be duplicated silently.
    const { overlay } = await renderPanel({
      npcs: [{ name: 'Riona', x: 2, y: 2, direction: 'North', displayName: 'The Barmaid' }]
    })

    fireEvent.click(overlay, at(2, 2))
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true })
    fireEvent.mouseMove(overlay, at(5, 5))
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })

    const dialog = await screen.findByRole('dialog')
    // A placement, not an edit: everything else is carried, the name is not.
    expect(within(dialog).getByText(/Place NPC/)).toBeTruthy()
    expect(comboboxIn(dialog, 'NPC Name').value).toBe('')
    expect((within(dialog).getByLabelText('Display Name') as HTMLInputElement).value).toBe(
      'The Barmaid'
    )
    expect((within(dialog).getByLabelText('Tile X') as HTMLInputElement).value).toBe('5')
  })
})

describe('Placement tab — repeating the last placed node', () => {
  it('shift-click repeats the last node placed in the armed mode', async () => {
    const user = userEvent.setup()
    const { overlay } = await renderPanel()

    // Place one map warp the long way.
    await user.click(screen.getByText('Map Warp'))
    fireEvent.click(overlay, at(2, 2))
    const dialog = await screen.findByRole('dialog')
    await user.type(comboboxIn(dialog, 'Destination Map'), 'Abel')
    await user.click(within(dialog).getByRole('button', { name: 'Place' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // Shift-click repeats it, with its destination, and asks nothing.
    fireEvent.click(overlay, { ...at(4, 4), shiftKey: true })

    expect(await screen.findByText('(4,4) → Abel')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('falls back to the dialog when the mode has placed nothing yet', async () => {
    const user = userEvent.setup()
    const { overlay } = await renderPanel()

    await user.click(screen.getByText('Reactor'))
    fireEvent.click(overlay, { ...at(3, 3), shiftKey: true })

    expect(await screen.findByRole('dialog')).toBeTruthy()
  })
})

describe('Placement tab — moving a placed node', () => {
  it('a drag moves the node', async () => {
    const { overlay } = await renderPanel({ reactors: [{ x: 6, y: 6, script: 'door.py' }] })

    fireEvent.mouseDown(overlay, { ...at(6, 6), button: 0 })
    fireEvent.mouseMove(overlay, at(9, 12))
    fireEvent.mouseUp(overlay, at(9, 12))

    expect(await screen.findByText('(9,12) [door.py]')).toBeTruthy()
  })

  it('shift-drag copies instead of moving', async () => {
    const { overlay } = await renderPanel({ reactors: [{ x: 6, y: 6, script: 'door.py' }] })

    fireEvent.mouseDown(overlay, { ...at(6, 6), button: 0 })
    fireEvent.mouseMove(overlay, { ...at(9, 12), shiftKey: true })
    fireEvent.mouseUp(overlay, { ...at(9, 12), shiftKey: true })

    // Both, not one moved.
    expect(await screen.findByText('(9,12) [door.py]')).toBeTruthy()
    expect(screen.getByText('(6,6) [door.py]')).toBeTruthy()
  })

  it('shift-drag of an NPC still clears the name', async () => {
    // The one kind that cannot be duplicated silently, whichever gesture asks.
    const { overlay } = await renderPanel({
      npcs: [{ name: 'Riona', x: 2, y: 2, direction: 'North', displayName: 'The Barmaid' }]
    })

    fireEvent.mouseDown(overlay, { ...at(2, 2), button: 0 })
    fireEvent.mouseMove(overlay, { ...at(5, 5), shiftKey: true })
    fireEvent.mouseUp(overlay, { ...at(5, 5), shiftKey: true })

    const dialog = await screen.findByRole('dialog')
    expect(comboboxIn(dialog, 'NPC Name').value).toBe('')
    expect((within(dialog).getByLabelText('Display Name') as HTMLInputElement).value).toBe(
      'The Barmaid'
    )
  })

  it('a typed coordinate moves the node on Save', async () => {
    const user = userEvent.setup()
    await renderPanel({ reactors: [{ x: 6, y: 6, script: 'door.py' }] })

    await user.click(editButtonFor('(6,6) [door.py]'))
    const dialog = await screen.findByRole('dialog')
    // The field is controlled by the page's dialog state, so set it outright
    // rather than typing into a value that is written back on every keystroke.
    fireEvent.change(within(dialog).getByLabelText('Tile X'), { target: { value: '12' } })
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('(12,6) [door.py]')).toBeTruthy()
  })

  it('a cancelled edit leaves the node where it was', async () => {
    const user = userEvent.setup()
    await renderPanel({ reactors: [{ x: 6, y: 6, script: 'door.py' }] })

    await user.click(editButtonFor('(6,6) [door.py]'))
    const dialog = await screen.findByRole('dialog')
    // The field is controlled by the page's dialog state, so set it outright
    // rather than typing into a value that is written back on every keystroke.
    fireEvent.change(within(dialog).getByLabelText('Tile X'), { target: { value: '12' } })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.getByText('(6,6) [door.py]')).toBeTruthy()
    expect(screen.queryByText('(12,6) [door.py]')).toBeNull()
  })
})
