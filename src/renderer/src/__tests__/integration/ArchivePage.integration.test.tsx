import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Hoisted in-memory fs and dalib stub. The dalib mock returns a controllable
// fake DataArchive so we can drive the page without crafting real .dat bytes.
const memfs = vi.hoisted(async () => {
  const { createMemoryFs } = await import('../setup/handlerBridge')
  return createMemoryFs()
})

const dalib = vi.hoisted(() => {
  type Entry = { entryName: string; fileSize: number; toUint8Array: () => Uint8Array }
  let nextEntries: Entry[] = []
  class FakeDataArchive {
    entries: Entry[]
    constructor(entries: Entry[]) { this.entries = entries }
    static fromBuffer() { return new FakeDataArchive(nextEntries) }
    getEntryBuffer(_e: Entry) { return new Uint8Array() }
    get(name: string) { return this.entries.find(e => e.entryName === name) ?? null }
  }
  return {
    DataArchive: FakeDataArchive,
    setEntries: (entries: Entry[]) => { nextEntries = entries },
    Palette: class { static fromBuffer() { return new (class {})() } },
  }
})

vi.mock('fs', async () => (await memfs).fsModule)
vi.mock('@eriscorp/dalib-ts', () => ({
  DataArchive: dalib.DataArchive,
  Palette: dalib.Palette,
}))
vi.mock('@eriscorp/dalib-ts/helpers/imageData', () => ({ toImageData: () => new ImageData(1, 1) }))
vi.mock('@eriscorp/hybindex-ts', () => {
  const m = { buildIndex: vi.fn(), loadIndex: vi.fn(), saveIndex: vi.fn(),
    getIndexStatus: vi.fn(), deleteIndex: vi.fn() }
  return { ...m, default: m }
})
vi.mock('child_process', () => {
  const m = {
    execFile: vi.fn((_c: string, _a: string[], cb?: (e: Error | null) => void) => { cb?.(null); return {} }),
    spawn: vi.fn(() => ({ unref: vi.fn() })),
  }
  return { ...m, default: m }
})

// @tanstack/react-virtual relies on real layout measurements; in jsdom it
// returns no items. Stub it to render every list entry so tests can find them.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 24,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index, key: index, start: index * 24, size: 24, end: (index + 1) * 24, lane: 0,
      })),
  }),
}))

// archiveRenderer mock — keeps ArchivePreview from doing real palette work.
const renderer = vi.hoisted(() => ({
  renderEntry: vi.fn(() => ({ frames: [{ data: new Uint8ClampedArray(4), width: 1, height: 1 }] })),
  renderPaletteGrid: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })),
  classifyEntry: vi.fn((entry: { entryName: string }) => {
    const name = entry.entryName.toLowerCase()
    if (name.endsWith('.epf') || name.endsWith('.mpf') || name.endsWith('.hpf')) return 'sprite'
    if (name.endsWith('.pal')) return 'palette'
    if (name.endsWith('.txt')) return 'text'
    return 'hex'
  }),
  loadPaletteByName: vi.fn(() => null),
  getPaletteNames: vi.fn(() => [] as string[]),
  formatBytes: vi.fn((n: number) => `${n} bytes`),
}))
vi.mock('../../utils/archiveRenderer', () => renderer)

import { RecoilRoot, type MutableSnapshot } from 'recoil'
import ArchivePage from '../../pages/ArchivePage'
import { clientPathState } from '../../recoil/atoms'
import { installBridgedApi } from '../setup/handlerBridge'

const HANDLERS_PATH = '../../../../main/handlers'
async function loadHandlers() {
  return import(/* @vite-ignore */ HANDLERS_PATH)
}

const CLIENT_PATH = '/dark-ages'

beforeEach(async () => {
  const fs = await memfs
  fs.reset()
  vi.clearAllMocks()
  renderer.classifyEntry.mockImplementation((entry: { entryName: string }) => {
    const name = entry.entryName.toLowerCase()
    if (name.endsWith('.epf') || name.endsWith('.mpf') || name.endsWith('.hpf')) return 'sprite'
    if (name.endsWith('.pal')) return 'palette'
    if (name.endsWith('.txt')) return 'text'
    return 'hex'
  })
  renderer.formatBytes.mockImplementation((n: number) => `${n} bytes`)
})

function renderPage(opts: {
  openFile?: () => Promise<string | null>
  openDirectory?: () => Promise<string | null>
} = {}) {
  return loadHandlers().then(handlers => {
    installBridgedApi(handlers, {
      settingsPath: '/appdata/Taliesin',
      settingsManager: { load: async () => ({}), save: async () => undefined },
      dialog: { openFile: opts.openFile, openDirectory: opts.openDirectory },
    })
    return render(
      <RecoilRoot initializeState={(snap: MutableSnapshot) => snap.set(clientPathState, CLIENT_PATH)}>
        <ArchivePage />
      </RecoilRoot>,
    )
  })
}

describe('ArchivePage — round-trip integration', () => {
  it('renders the empty state when no archive is loaded', async () => {
    await renderPage()
    expect(await screen.findByText(/Open a \.dat archive/i)).toBeInTheDocument()
  })

  it('Open Archive flow: dialog → readFile → DataArchive parse → entry list shows', async () => {
    const fs = await memfs
    fs.files.set(`${CLIENT_PATH}/legend.dat`, Buffer.from([0xDE, 0xAD]))
    dalib.setEntries([
      { entryName: 'icon.epf', fileSize: 100, toUint8Array: () => new Uint8Array([1]) },
      { entryName: 'palette.pal', fileSize: 1024, toUint8Array: () => new Uint8Array([2]) },
    ])

    const user = userEvent.setup()
    await renderPage({ openFile: async () => `${CLIENT_PATH}/legend.dat` })
    await user.click(await screen.findByRole('button', { name: /open archive/i }))

    expect(await screen.findByText('legend.dat')).toBeInTheDocument()
    expect(screen.getByText(/2 entries/)).toBeInTheDocument()
    expect(screen.getByText('icon.epf')).toBeInTheDocument()
  })

  it('selecting an entry routes to the right preview type via classifyEntry', async () => {
    const fs = await memfs
    fs.files.set(`${CLIENT_PATH}/legend.dat`, Buffer.from([0xDE, 0xAD]))
    dalib.setEntries([
      { entryName: 'icon.epf', fileSize: 100, toUint8Array: () => new Uint8Array([1]) },
    ])

    const user = userEvent.setup()
    await renderPage({ openFile: async () => `${CLIENT_PATH}/legend.dat` })
    await user.click(await screen.findByRole('button', { name: /open archive/i }))

    await user.click(await screen.findByText('icon.epf'))
    await waitFor(() => expect(renderer.classifyEntry).toHaveBeenCalled())
    // ArchivePreview header reflects the entry name + classified type ("sprite")
    const headers = screen.getAllByText('icon.epf')
    expect(headers.length).toBeGreaterThan(0)
    expect(screen.getByText(/sprite/)).toBeInTheDocument()
  })

  it('quick-open chip launches loadArchive with <clientPath>/<name>', async () => {
    const fs = await memfs
    fs.files.set(`${CLIENT_PATH}/seo.dat`, Buffer.from([0xCA, 0xFE]))
    dalib.setEntries([
      { entryName: 'tile.epf', fileSize: 50, toUint8Array: () => new Uint8Array() },
    ])

    const user = userEvent.setup()
    await renderPage()
    await user.click(await screen.findByText('seo'))

    expect(await screen.findByText('seo.dat')).toBeInTheDocument()
    expect(screen.getByText('tile.epf')).toBeInTheDocument()
  })

  it('Extract All round-trips through openDirectory + writeBytes for every entry', async () => {
    const fs = await memfs
    fs.files.set(`${CLIENT_PATH}/legend.dat`, Buffer.from([0xDE]))
    dalib.setEntries([
      { entryName: 'a.txt', fileSize: 5, toUint8Array: () => new Uint8Array([0x41]) },
      { entryName: 'b.txt', fileSize: 5, toUint8Array: () => new Uint8Array([0x42]) },
      { entryName: 'c.txt', fileSize: 5, toUint8Array: () => new Uint8Array([0x43]) },
    ])

    const user = userEvent.setup()
    await renderPage({
      openFile:      async () => `${CLIENT_PATH}/legend.dat`,
      openDirectory: async () => '/extract-out',
    })

    await user.click(await screen.findByRole('button', { name: /open archive/i }))
    await user.click(await screen.findByRole('button', { name: /extract all/i }))

    await waitFor(() => {
      expect(fs.files.get('/extract-out/a.txt')?.[0]).toBe(0x41)
      expect(fs.files.get('/extract-out/b.txt')?.[0]).toBe(0x42)
      expect(fs.files.get('/extract-out/c.txt')?.[0]).toBe(0x43)
    })
  })

  it('Extract All aborts when the user cancels the directory dialog', async () => {
    const fs = await memfs
    fs.files.set(`${CLIENT_PATH}/legend.dat`, Buffer.from([0xDE]))
    dalib.setEntries([
      { entryName: 'x.txt', fileSize: 5, toUint8Array: () => new Uint8Array([0x58]) },
    ])

    const user = userEvent.setup()
    await renderPage({
      openFile:      async () => `${CLIENT_PATH}/legend.dat`,
      openDirectory: async () => null,
    })

    await user.click(await screen.findByRole('button', { name: /open archive/i }))
    const sizeBefore = fs.files.size
    await user.click(await screen.findByRole('button', { name: /extract all/i }))
    await new Promise(r => setTimeout(r, 0))
    // No new files were written
    expect(fs.files.size).toBe(sizeBefore)
  })
})
