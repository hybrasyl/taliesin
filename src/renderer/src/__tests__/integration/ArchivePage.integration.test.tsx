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
    constructor(entries: Entry[]) {
      this.entries = entries
    }
    static fromBuffer() {
      return new FakeDataArchive(nextEntries)
    }
    getEntryBuffer(_e: Entry) {
      return new Uint8Array()
    }
    get(name: string) {
      return this.entries.find((e) => e.entryName === name) ?? null
    }
  }
  let lastResolver: { archiveName: string; provider: (name: string) => unknown } | null = null
  return {
    DataArchive: FakeDataArchive,
    setEntries: (entries: Entry[]) => {
      nextEntries = entries
    },
    recordResolver: (archiveName: string, provider: (name: string) => unknown) => {
      lastResolver = { archiveName, provider }
    },
    resetResolver: () => {
      lastResolver = null
    },
    lastResolver: () => lastResolver,
    Palette: class {
      static fromBuffer() {
        return new (class {})()
      }
    }
  }
})

vi.mock('fs', async () => (await memfs).fsModule)
vi.mock('@eriscorp/dalib-ts', () => ({
  DataArchive: dalib.DataArchive,
  Palette: dalib.Palette,
  // The preview builds one resolver per open archive. Resolution itself is
  // dalib-ts's job, so every entry here is "no rule matched" — but the
  // constructor arguments ARE this page's contract, so they are recorded.
  PaletteResolver: class {
    constructor(archiveName: string, _archive: unknown, provider: (n: string) => unknown) {
      dalib.recordResolver(archiveName, provider)
    }
    resolve = () => null
  }
}))
vi.mock('@eriscorp/dalib-ts/helpers/imageData', () => ({ toImageData: () => new ImageData(1, 1) }))
vi.mock('@eriscorp/hybindex-ts', () => {
  const m = {
    buildIndex: vi.fn(),
    loadIndex: vi.fn(),
    saveIndex: vi.fn(),
    getIndexStatus: vi.fn(),
    deleteIndex: vi.fn(),
    listSectionFiles: vi.fn()
  }
  return { ...m, default: m }
})
vi.mock('child_process', () => {
  const m = {
    execFile: vi.fn((_c: string, _a: string[], cb?: (e: Error | null) => void) => {
      cb?.(null)
      return {}
    }),
    spawn: vi.fn(() => ({ unref: vi.fn() }))
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
        index,
        key: index,
        start: index * 24,
        size: 24,
        end: (index + 1) * 24,
        lane: 0
      }))
  })
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
  formatBytes: vi.fn((n: number) => `${n} bytes`)
}))
vi.mock('../../utils/archiveRenderer', () => renderer)

import ArchivePage from '../../pages/ArchivePage'
import { seedSettings, resetStores } from '../setup/storeWrapper'
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
  resetStores()
  dalib.resetResolver()
  renderer.classifyEntry.mockImplementation((entry: { entryName: string }) => {
    const name = entry.entryName.toLowerCase()
    if (name.endsWith('.epf') || name.endsWith('.mpf') || name.endsWith('.hpf')) return 'sprite'
    if (name.endsWith('.pal')) return 'palette'
    if (name.endsWith('.txt')) return 'text'
    return 'hex'
  })
  renderer.formatBytes.mockImplementation((n: number) => `${n} bytes`)
})

function renderPage(
  opts: {
    openFile?: () => Promise<string | null>
    openDirectory?: () => Promise<string | null>
  } = {}
) {
  return loadHandlers().then((handlers) => {
    installBridgedApi(handlers, {
      settingsPath: '/appdata/Taliesin',
      settingsManager: { load: async () => ({}), save: async () => undefined },
      dialog: { openFile: opts.openFile, openDirectory: opts.openDirectory }
    })
    seedSettings({ clientPath: CLIENT_PATH })
    return render(<ArchivePage />)
  })
}

describe('ArchivePage — round-trip integration', () => {
  it('renders the empty state when no archive is loaded', async () => {
    await renderPage()
    expect(await screen.findByText(/Open a \.dat archive/i)).toBeInTheDocument()
  })

  it('Open Archive flow: dialog → readFile → DataArchive parse → entry list shows', async () => {
    const fs = await memfs
    fs.files.set(`${CLIENT_PATH}/legend.dat`, Buffer.from([0xde, 0xad]))
    dalib.setEntries([
      { entryName: 'icon.epf', fileSize: 100, toUint8Array: () => new Uint8Array([1]) },
      { entryName: 'palette.pal', fileSize: 1024, toUint8Array: () => new Uint8Array([2]) }
    ])

    const user = userEvent.setup()
    await renderPage({ openFile: async () => `${CLIENT_PATH}/legend.dat` })
    await user.click(await screen.findByRole('button', { name: /open archive/i }))

    expect(await screen.findByText('legend.dat')).toBeInTheDocument()
    expect(screen.getByText(/2 entries/)).toBeInTheDocument()
    // Groups are collapsed by default; expand .epf to reveal its entries.
    await user.click(await screen.findByText('.epf'))
    expect(screen.getByText('icon.epf')).toBeInTheDocument()
  })

  // Opening an archive also pulls in the sibling archives the palette rules
  // read (khanpal.dat, legend.dat). Both of these drive that loop: the first
  // with a sibling present and the open archive standing in for itself, the
  // second with neither on disk. Whether a sibling is found must not change
  // whether the archive opens.
  it('hands the resolver the archive name and a provider that finds loaded siblings', async () => {
    const fs = await memfs
    fs.files.set(`${CLIENT_PATH}/legend.dat`, Buffer.from([0xde, 0xad]))
    fs.files.set(`${CLIENT_PATH}/khanpal.dat`, Buffer.from([0xbe, 0xef]))
    dalib.setEntries([
      { entryName: 'icon.epf', fileSize: 100, toUint8Array: () => new Uint8Array([1]) }
    ])

    const user = userEvent.setup()
    await renderPage({ openFile: async () => `${CLIENT_PATH}/legend.dat` })
    await user.click(await screen.findByRole('button', { name: /open archive/i }))
    expect(await screen.findByText('legend.dat')).toBeInTheDocument()
    expect(screen.getByText(/1 entries/)).toBeInTheDocument()

    // Selecting an entry mounts the preview, which builds the resolver.
    await user.click(await screen.findByText('.epf'))
    await user.click(await screen.findByText('icon.epf'))

    await waitFor(() => expect(dalib.lastResolver()).not.toBeNull())
    const resolver = dalib.lastResolver()!
    // The rules key on the archive's file name, not its path.
    expect(resolver.archiveName).toBe('legend.dat')
    // The provider resolves by name, is case-insensitive, and returns null
    // rather than throwing for a sibling that was not loaded.
    expect(resolver.provider('khanpal.dat')).not.toBeNull()
    expect(resolver.provider('KHANPAL.DAT')).not.toBeNull()
    expect(resolver.provider('national.dat')).toBeNull()
  })

  // The official installer writes `Legend.dat`, while the palette rules name
  // their siblings as lowercase literals. The memory fs is case-SENSITIVE, so
  // this is the Linux case: reading the literal name misses, and the sibling
  // goes silently unloaded while the archive still opens normally. See
  // dalib-ts 3.1.1.
  it('loads a sibling whose on-disk name is cased differently', async () => {
    const fs = await memfs
    fs.files.set(`${CLIENT_PATH}/seo.dat`, Buffer.from([0xde, 0xad]))
    fs.files.set(`${CLIENT_PATH}/Legend.dat`, Buffer.from([0xbe, 0xef]))
    dalib.setEntries([
      { entryName: 'icon.epf', fileSize: 100, toUint8Array: () => new Uint8Array([1]) }
    ])

    const user = userEvent.setup()
    await renderPage({ openFile: async () => `${CLIENT_PATH}/seo.dat` })
    await user.click(await screen.findByRole('button', { name: /open archive/i }))
    await user.click(await screen.findByText('.epf'))
    await user.click(await screen.findByText('icon.epf'))

    await waitFor(() => expect(dalib.lastResolver()).not.toBeNull())
    // Keyed by the lowercase name the resolver asks for, whatever the file on
    // disk is called.
    expect(dalib.lastResolver()!.provider('legend.dat')).not.toBeNull()
  })

  it('opens just as cleanly when no sibling palette archive exists', async () => {
    const fs = await memfs
    fs.files.set(`${CLIENT_PATH}/seo.dat`, Buffer.from([0xde, 0xad]))
    dalib.setEntries([
      { entryName: 'tilea.bmp', fileSize: 100, toUint8Array: () => new Uint8Array([1]) }
    ])

    const user = userEvent.setup()
    await renderPage({ openFile: async () => `${CLIENT_PATH}/seo.dat` })
    await user.click(await screen.findByRole('button', { name: /open archive/i }))

    expect(await screen.findByText('seo.dat')).toBeInTheDocument()
    expect(screen.getByText(/1 entries/)).toBeInTheDocument()
  })

  it('selecting an entry routes to the right preview type via classifyEntry', async () => {
    const fs = await memfs
    fs.files.set(`${CLIENT_PATH}/legend.dat`, Buffer.from([0xde, 0xad]))
    dalib.setEntries([
      { entryName: 'icon.epf', fileSize: 100, toUint8Array: () => new Uint8Array([1]) }
    ])

    const user = userEvent.setup()
    await renderPage({ openFile: async () => `${CLIENT_PATH}/legend.dat` })
    await user.click(await screen.findByRole('button', { name: /open archive/i }))

    await user.click(await screen.findByText('.epf'))
    await user.click(await screen.findByText('icon.epf'))
    await waitFor(() => expect(renderer.classifyEntry).toHaveBeenCalled())
    // ArchivePreview header reflects the entry name + classified type ("sprite")
    const headers = screen.getAllByText('icon.epf')
    expect(headers.length).toBeGreaterThan(0)
    expect(screen.getByText(/sprite/)).toBeInTheDocument()
  })

  it('client-archive select launches loadArchive with <clientPath>/<name>', async () => {
    const fs = await memfs
    fs.files.set(`${CLIENT_PATH}/seo.dat`, Buffer.from([0xca, 0xfe]))
    dalib.setEntries([
      { entryName: 'tile.epf', fileSize: 50, toUint8Array: () => new Uint8Array() }
    ])

    const user = userEvent.setup()
    await renderPage()

    // Wait for the dat-file scan to populate the dropdown.
    const select = await screen.findByLabelText('Client archives')
    await user.click(select)
    await user.click(await screen.findByRole('option', { name: 'seo.dat' }))

    expect(await screen.findByText('seo.dat')).toBeInTheDocument()
    await user.click(await screen.findByText('.epf'))
    expect(screen.getByText('tile.epf')).toBeInTheDocument()
  })

  it('client-archive select includes one-level-deep subfolder dats (e.g., npc/npc.dat)', async () => {
    const fs = await memfs
    fs.files.set(`${CLIENT_PATH}/npc/npc.dat`, Buffer.from([0xbe, 0xef]))
    dalib.setEntries([
      { entryName: 'merchant.epf', fileSize: 10, toUint8Array: () => new Uint8Array() }
    ])

    const user = userEvent.setup()
    await renderPage()

    const select = await screen.findByLabelText('Client archives')
    await user.click(select)
    await user.click(await screen.findByRole('option', { name: 'npc/npc.dat' }))

    expect(await screen.findByText('npc.dat')).toBeInTheDocument()
    await user.click(await screen.findByText('.epf'))
    expect(screen.getByText('merchant.epf')).toBeInTheDocument()
  })

  it('does not auto-expand any group when an archive is loaded', async () => {
    const fs = await memfs
    fs.files.set(`${CLIENT_PATH}/legend.dat`, Buffer.from([0xde]))
    dalib.setEntries([
      { entryName: 'icon.epf', fileSize: 100, toUint8Array: () => new Uint8Array() },
      { entryName: 'palette.pal', fileSize: 1024, toUint8Array: () => new Uint8Array() }
    ])

    const user = userEvent.setup()
    await renderPage({ openFile: async () => `${CLIENT_PATH}/legend.dat` })
    await user.click(await screen.findByRole('button', { name: /open archive/i }))

    // Group headers are visible but their child entries are not (collapsed).
    expect(await screen.findByText('.epf')).toBeInTheDocument()
    expect(screen.getByText('.pal')).toBeInTheDocument()
    expect(screen.queryByText('icon.epf')).toBeNull()
    expect(screen.queryByText('palette.pal')).toBeNull()
  })

  it('Extract All round-trips through openDirectory + writeBytes for every entry', async () => {
    const fs = await memfs
    fs.files.set(`${CLIENT_PATH}/legend.dat`, Buffer.from([0xde]))
    dalib.setEntries([
      { entryName: 'a.txt', fileSize: 5, toUint8Array: () => new Uint8Array([0x41]) },
      { entryName: 'b.txt', fileSize: 5, toUint8Array: () => new Uint8Array([0x42]) },
      { entryName: 'c.txt', fileSize: 5, toUint8Array: () => new Uint8Array([0x43]) }
    ])

    const user = userEvent.setup()
    await renderPage({
      openFile: async () => `${CLIENT_PATH}/legend.dat`,
      openDirectory: async () => '/extract-out'
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
    fs.files.set(`${CLIENT_PATH}/legend.dat`, Buffer.from([0xde]))
    dalib.setEntries([
      { entryName: 'x.txt', fileSize: 5, toUint8Array: () => new Uint8Array([0x58]) }
    ])

    const user = userEvent.setup()
    await renderPage({
      openFile: async () => `${CLIENT_PATH}/legend.dat`,
      openDirectory: async () => null
    })

    await user.click(await screen.findByRole('button', { name: /open archive/i }))
    const sizeBefore = fs.files.size
    await user.click(await screen.findByRole('button', { name: /extract all/i }))
    await new Promise((r) => setTimeout(r, 0))
    // No new files were written
    expect(fs.files.size).toBe(sizeBefore)
  })
})
