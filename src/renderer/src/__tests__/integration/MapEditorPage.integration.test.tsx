import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const memfs = vi.hoisted(async () => {
  const { createMemoryFs } = await import('../setup/handlerBridge')
  return createMemoryFs()
})

vi.mock('fs', async () => (await memfs).fsModule)
// `fs:listSection` enumerates through hybindex. `beforeEach` points it at the
// memory filesystem.
vi.mock('@eriscorp/hybindex-ts', () => {
  const m = {
    buildIndex: vi.fn(async () => null),
    loadIndex: vi.fn(async () => null),
    saveIndex: vi.fn(),
    getIndexStatus: vi.fn(async () => ({ exists: false })),
    deleteIndex: vi.fn(),
    listSectionFiles: vi.fn(),
    buildSection: vi.fn(),
    isArchivedPath: (rel: string) => rel.split('/').includes('.ignore')
  }
  return { ...m, default: m }
})

import * as hybindex from '@eriscorp/hybindex-ts'
import MapEditorPage from '../../pages/MapEditorPage'
import { seedSettings, resetStores } from '../setup/storeWrapper'
import { installBridgedApi } from '../setup/handlerBridge'
import { serializeMapXml, parseMapXml } from '../../utils/mapXml'
import { DEFAULT_MAP, type MapData } from '../../data/mapData'
import { useUiStore } from '../../store/uiStore'

/**
 * The Maps page in the editor shell (HTOO-633), through the real handlers on a
 * memory filesystem: Rename moves the file and keeps the unsaved edits,
 * Duplicate opens an unsaved copy that cannot save over a file, and Delete
 * sends the file to the trash. Stage and Release move a map between `xml/maps/`
 * and `.staging/maps/` (HTOO-634).
 */

const HANDLERS_PATH = '../../../../main/handlers'
async function loadHandlers() {
  return import(/* @vite-ignore */ HANDLERS_PATH)
}

const LIB = '/world/xml'
const MAPS = `${LIB}/maps`
const STAGED = '/world/.staging/maps'

async function file(path: string): Promise<string | undefined> {
  const fs = await memfs
  for (const [p, buf] of fs.files) {
    if (p.replace(/\\/g, '/') === path) return buf.toString('utf-8')
  }
  return undefined
}

async function seedMap(
  rel: string,
  id: number,
  name: string,
  { dir = MAPS, warpsTo = [] as string[] } = {}
): Promise<void> {
  const fs = await memfs
  const warps: MapData['warps'] = warpsTo.map((target, i) => ({
    x: i,
    y: 0,
    targetType: 'map',
    mapTargetName: target,
    mapTargetX: 1,
    mapTargetY: 1
  }))
  const xml = serializeMapXml({ ...DEFAULT_MAP, id, name, x: 10, y: 10, warps })
  fs.files.set(`${dir}/${rel}`, Buffer.from(xml))
}

/** The active map details under `<root>/maps/`, as hybindex reads them. */
async function mapDetailsUnder(root: string) {
  const fs = await memfs
  const dir = `${root.replace(/\\/g, '/')}/maps/`
  const out: { id: number; name: string; filename: string; x: number; y: number }[] = []
  for (const [p, buf] of fs.files) {
    const path = p.replace(/\\/g, '/')
    if (!path.startsWith(dir) || !path.endsWith('.xml')) continue
    const filename = path.slice(dir.length)
    if (filename.split('/').includes('.ignore')) continue
    const m = parseMapXml(buf.toString('utf-8'))
    out.push({ id: m.id, name: m.name, filename, x: m.x, y: m.y })
  }
  return out.sort((a, b) => (a.filename < b.filename ? -1 : 1))
}

async function mount() {
  const handlers = await loadHandlers()
  installBridgedApi(handlers, {
    settingsPath: '/appdata/Taliesin',
    settingsManager: { load: async () => ({}), save: async () => undefined }
  })
  seedSettings({ activeLibrary: LIB })
  useUiStore.setState({ currentPage: 'mapeditor' })
  render(<MapEditorPage />)
}

const toolbar = () => within(screen.getByTestId('page-toolbar'))

async function open(display: string): Promise<void> {
  await userEvent.click(await screen.findByText(display))
  await screen.findByLabelText('Filename')
}

beforeEach(async () => {
  const fs = await memfs
  fs.reset()
  vi.clearAllMocks()
  resetStores()
  // The section listing, split into active and `.ignore/` as hybindex splits it.
  vi.mocked(hybindex.listSectionFiles).mockImplementation(async (lib: string, type: string) => {
    // The handler passes the library through path checks, which give it native
    // separators on Windows.
    const dir = `${lib}/${type}`.replace(/\\/g, '/')
    const rels = [...fs.files.keys()]
      .map((p) => p.replace(/\\/g, '/'))
      .filter((p) => p.startsWith(`${dir}/`) && p.endsWith('.xml'))
      .map((p) => p.slice(dir.length + 1))
      .sort()
    return {
      dir,
      active: rels.filter((r) => !r.startsWith('.ignore/')),
      archived: rels.filter((r) => r.startsWith('.ignore/'))
    }
  })
  // The live index and the staged section, from the disk as it is now.
  vi.mocked(hybindex.buildIndex).mockImplementation((async (lib: string) => {
    const mapDetails = await mapDetailsUnder(lib)
    return { maps: mapDetails.map((d) => d.name), mapDetails, ignoredMapDetails: [] }
  }) as unknown as typeof hybindex.buildIndex)
  vi.mocked(hybindex.buildSection).mockImplementation((async (root: string) => ({
    type: 'maps',
    fields: { mapDetails: await mapDetailsUnder(root) }
  })) as unknown as typeof hybindex.buildSection)
})

// Each case drives the real handlers through several renders, which is slow
// under the coverage run: on Linux a case took 15 s, so each block has 30 s.
describe('MapEditorPage in the editor shell', { timeout: 30000 }, () => {
  it('renames the file and keeps the unsaved edits', async () => {
    await seedMap('Abel.xml', 1, 'Abel')
    await mount()
    await open('Abel')

    // Paste, not type: each typed key renders the whole page, and under the
    // coverage run the 18 keys took this case past its timeout on Linux.
    const name = screen.getByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.paste('Abel Town')
    const filename = screen.getByLabelText('Filename')
    await userEvent.clear(filename)
    await userEvent.paste('Abel2.xml')
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))

    await waitFor(async () => expect(await file(`${MAPS}/Abel2.xml`)).toBeDefined())
    expect(await file(`${MAPS}/Abel.xml`)).toBeUndefined()
    // The move wrote nothing: the file still has the saved Name.
    expect(parseMapXml((await file(`${MAPS}/Abel2.xml`))!).name).toBe('Abel')
    // And the editor still has the typed one.
    expect(screen.getByLabelText('Name')).toHaveValue('Abel Town')
  })

  it('opens a duplicate as an unsaved copy that does not save over a file', async () => {
    // The copy's filename is computed from its Id, which is this file's name.
    await seedMap('lod00001.xml', 1, 'Abel')
    await mount()
    await open('lod00001')

    await userEvent.click(toolbar().getByRole('button', { name: 'Duplicate' }))
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Abel (copy)'))
    expect(screen.getByLabelText('Filename')).toHaveValue('lod00001.xml')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/exists\. Change the filename/)).toBeInTheDocument()
    expect(parseMapXml((await file(`${MAPS}/lod00001.xml`))!).name).toBe('Abel')
  })

  it('sends a deleted map to the trash after the confirmation', async () => {
    await seedMap('Abel.xml', 1, 'Abel')
    await mount()
    await open('Abel')
    const trash = vi.spyOn(window.api, 'trashFile')

    await userEvent.click(toolbar().getByRole('button', { name: 'Delete' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' })
    )
    await waitFor(async () => expect(await file(`${MAPS}/Abel.xml`)).toBeUndefined())
    expect(trash).toHaveBeenCalledWith(`${MAPS}/Abel.xml`)
    expect(await screen.findByText('Select a map or create a new one.')).toBeInTheDocument()
  })
})

describe('MapEditorPage staging (HTOO-634)', { timeout: 30000 }, () => {
  async function showStaged(): Promise<void> {
    await userEvent.click(await toolbar().findByRole('button', { name: /^Staged \(/ }))
  }

  it('warns about the live maps that warp to a map before it stages it', async () => {
    await seedMap('Abel.xml', 1, 'Abel', { warpsTo: ['Abel'] })
    await seedMap('Inn.xml', 2, 'Abel Inn', { warpsTo: ['Abel'] })
    // A staged referrer is no problem, so it is not listed.
    await seedMap('Docks.xml', 3, 'Abel Docks', { dir: STAGED, warpsTo: ['Abel'] })
    await mount()
    await open('Abel')

    await userEvent.click(toolbar().getByRole('button', { name: 'Stage' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('maps/Inn.xml')).toBeInTheDocument()
    // Not the map's own warp to itself, and not the staged referrer.
    expect(within(dialog).queryByText('maps/Abel.xml')).toBeNull()
    expect(within(dialog).queryByText(/Docks/)).toBeNull()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await file(`${MAPS}/Abel.xml`)).toBeDefined()

    await userEvent.click(toolbar().getByRole('button', { name: 'Stage' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Stage' })
    )
    await waitFor(async () => expect(await file(`${STAGED}/Abel.xml`)).toBeDefined())
    expect(await file(`${MAPS}/Abel.xml`)).toBeUndefined()
    // The staged map stays open, and its action is Release now.
    expect(await toolbar().findByRole('button', { name: 'Release' })).toBeEnabled()
    expect(toolbar().getByRole('button', { name: 'Archive' })).toBeDisabled()
    expect(toolbar().getByRole('button', { name: 'Staged (2)' })).toBeInTheDocument()
  })

  it('stages with no question when no live file names the map', async () => {
    await seedMap('Abel.xml', 1, 'Abel')
    await mount()
    await open('Abel')
    await userEvent.click(toolbar().getByRole('button', { name: 'Stage' }))
    await waitFor(async () => expect(await file(`${STAGED}/Abel.xml`)).toBeDefined())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('releases a staged map with the staged maps that its warps need', async () => {
    await seedMap('Live.xml', 1, 'Live')
    await seedMap('Alpha.xml', 2, 'A', { dir: STAGED, warpsTo: ['B', 'Live'] })
    await seedMap('Beta.xml', 3, 'B', { dir: STAGED, warpsTo: ['C'] })
    await seedMap('Gamma.xml', 4, 'C', { dir: STAGED })
    await seedMap('Other.xml', 5, 'Other', { dir: STAGED })
    await mount()
    await showStaged()
    await open('Alpha')

    await userEvent.click(toolbar().getByRole('button', { name: 'Release' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Beta.xml (“B”, from “A”)')).toBeInTheDocument()
    expect(within(dialog).getByText('Gamma.xml (“C”, from “B”)')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Release all 3' }))

    await waitFor(async () => expect(await file(`${MAPS}/Gamma.xml`)).toBeDefined())
    for (const rel of ['Alpha.xml', 'Beta.xml']) expect(await file(`${MAPS}/${rel}`)).toBeDefined()
    expect(await file(`${STAGED}/Other.xml`)).toBeDefined()
    expect(await file(`${STAGED}/Alpha.xml`)).toBeUndefined()
    // The released map stays open, as a live map.
    expect(await toolbar().findByRole('button', { name: 'Stage' })).toBeEnabled()
  })

  it('releases only the chosen map when asked', async () => {
    await seedMap('Alpha.xml', 2, 'A', { dir: STAGED, warpsTo: ['B'] })
    await seedMap('Beta.xml', 3, 'B', { dir: STAGED })
    await mount()
    await showStaged()
    await open('Alpha')
    await userEvent.click(toolbar().getByRole('button', { name: 'Release' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Release only this map'
      })
    )
    await waitFor(async () => expect(await file(`${MAPS}/Alpha.xml`)).toBeDefined())
    expect(await file(`${STAGED}/Beta.xml`)).toBeDefined()
  })

  it('refuses a release whose name is already live, and moves nothing', async () => {
    await seedMap('Abel.xml', 1, 'Abel')
    await seedMap('Abel2.xml', 7, 'abel', { dir: STAGED })
    await mount()
    // The live index must be loaded for the check to see the live map.
    await screen.findByText('Abel')
    await showStaged()
    await open('Abel2')
    await userEvent.click(toolbar().getByRole('button', { name: 'Release' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Nothing was released')).toBeInTheDocument()
    expect(within(dialog).getByText(/Abel2\.xml: a live map is already named “abel”/)).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'OK' }))
    expect(await file(`${STAGED}/Abel2.xml`)).toBeDefined()
    expect(await file(`${MAPS}/Abel2.xml`)).toBeUndefined()
  })
})
