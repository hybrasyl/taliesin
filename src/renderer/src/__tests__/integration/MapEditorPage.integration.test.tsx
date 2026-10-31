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
    listSectionFiles: vi.fn()
  }
  return { ...m, default: m }
})

import * as hybindex from '@eriscorp/hybindex-ts'
import MapEditorPage from '../../pages/MapEditorPage'
import { seedSettings, resetStores } from '../setup/storeWrapper'
import { installBridgedApi } from '../setup/handlerBridge'
import { serializeMapXml, parseMapXml } from '../../utils/mapXml'
import { DEFAULT_MAP } from '../../data/mapData'
import { useUiStore } from '../../store/uiStore'

/**
 * The Maps page in the editor shell (HTOO-633), through the real handlers on a
 * memory filesystem: Rename moves the file and keeps the unsaved edits,
 * Duplicate opens an unsaved copy that cannot save over a file, and Delete
 * sends the file to the trash.
 */

const HANDLERS_PATH = '../../../../main/handlers'
async function loadHandlers() {
  return import(/* @vite-ignore */ HANDLERS_PATH)
}

const LIB = '/world/xml'
const MAPS = `${LIB}/maps`

async function file(path: string): Promise<string | undefined> {
  const fs = await memfs
  for (const [p, buf] of fs.files) {
    if (p.replace(/\\/g, '/') === path) return buf.toString('utf-8')
  }
  return undefined
}

async function seedMap(rel: string, id: number, name: string): Promise<void> {
  const fs = await memfs
  const xml = serializeMapXml({ ...DEFAULT_MAP, id, name, x: 10, y: 10 })
  fs.files.set(`${MAPS}/${rel}`, Buffer.from(xml))
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
})

// Each case drives the real handlers through several renders, which is slow
// under the coverage run.
describe('MapEditorPage in the editor shell', { timeout: 15000 }, () => {
  it('renames the file and keeps the unsaved edits', async () => {
    await seedMap('Abel.xml', 1, 'Abel')
    await mount()
    await open('Abel')

    const name = screen.getByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Abel Town')
    const filename = screen.getByLabelText('Filename')
    await userEvent.clear(filename)
    await userEvent.type(filename, 'Abel2.xml')
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
