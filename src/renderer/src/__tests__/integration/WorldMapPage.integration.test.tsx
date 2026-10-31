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
import WorldMapPage from '../../pages/WorldMapPage'
import { seedSettings, resetStores } from '../setup/storeWrapper'
import { installBridgedApi } from '../setup/handlerBridge'
import { serializeWorldMapXml } from '../../utils/worldMapXml'
import { DEFAULT_WORLD_MAP } from '../../data/worldMapData'
import { useUiStore } from '../../store/uiStore'

/**
 * The World Maps page in the editor shell (HTOO-633). A world map's sidecar
 * (`.ignore/<rel>.meta.json`) links it to its reference set, and is keyed on
 * the map's rel, so Rename carries it along and Delete trashes it too.
 */

const HANDLERS_PATH = '../../../../main/handlers'
async function loadHandlers() {
  return import(/* @vite-ignore */ HANDLERS_PATH)
}

const LIB = '/world/xml'
const DIR = `${LIB}/worldmaps`
const SIDECAR = JSON.stringify({ reference: 'ReferenceMapSetField001.xml', excludes: [] })

async function file(path: string): Promise<string | undefined> {
  const fs = await memfs
  for (const [p, buf] of fs.files) {
    if (p.replace(/\\/g, '/') === path) return buf.toString('utf-8')
  }
  return undefined
}

async function seed(): Promise<void> {
  const fs = await memfs
  fs.files.set(
    `${DIR}/Temuair.xml`,
    Buffer.from(serializeWorldMapXml({ ...DEFAULT_WORLD_MAP, name: 'Temuair' }))
  )
  fs.files.set(`${DIR}/.ignore/Temuair.meta.json`, Buffer.from(SIDECAR))
}

async function mount() {
  const handlers = await loadHandlers()
  installBridgedApi(handlers, {
    settingsPath: '/appdata/Taliesin',
    settingsManager: { load: async () => ({}), save: async () => undefined }
  })
  seedSettings({ activeLibrary: LIB })
  useUiStore.setState({ currentPage: 'worldmap' })
  render(<WorldMapPage />)
  await userEvent.click(await screen.findByText('Temuair'))
  await screen.findByLabelText('Filename')
}

// The world map canvas sizes itself with a ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver ??= class {
  observe(): void {
    // Nothing to observe in jsdom.
  }
  unobserve(): void {
    // Nothing to observe in jsdom.
  }
  disconnect(): void {
    // Nothing to observe in jsdom.
  }
} as unknown as typeof ResizeObserver

beforeEach(async () => {
  const fs = await memfs
  fs.reset()
  vi.clearAllMocks()
  resetStores()
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
describe('WorldMapPage in the editor shell', { timeout: 15000 }, () => {
  it('carries the sidecar with a rename', async () => {
    await seed()
    await mount()
    const filename = screen.getByLabelText('Filename')
    await userEvent.clear(filename)
    await userEvent.type(filename, 'Temuair2.xml')
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))

    await waitFor(async () => expect(await file(`${DIR}/Temuair2.xml`)).toBeDefined())
    expect(await file(`${DIR}/.ignore/Temuair2.meta.json`)).toBe(SIDECAR)
    expect(await file(`${DIR}/.ignore/Temuair.meta.json`)).toBeUndefined()
  })

  it('trashes the sidecar with the world map', async () => {
    await seed()
    await mount()
    const trash = vi.spyOn(window.api, 'trashFile')
    await userEvent.click(
      within(screen.getByTestId('page-toolbar')).getByRole('button', { name: 'Delete' })
    )
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' })
    )
    await waitFor(() => expect(trash).toHaveBeenCalledTimes(2))
    expect(trash).toHaveBeenCalledWith(`${DIR}/Temuair.xml`)
    expect(trash).toHaveBeenCalledWith(`${DIR}/.ignore/Temuair.meta.json`)
  })
})
