import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock dalib-ts BEFORE importing ArchivePreview so the component picks up our stub.
// The real Palette class touches binary buffers; we only need a constructor + buffer entrypoint.
vi.mock('@eriscorp/dalib-ts', () => {
  class FakePalette {
    static fromBuffer() { return new FakePalette() }
  }
  return {
    Palette: FakePalette,
    // re-exports used by ArchivePreview type-only — runtime doesn't need them but
    // some are referenced via `type` imports which Vitest erases. Provide stubs anyway.
    DataArchive: class {},
  }
})

vi.mock('@eriscorp/dalib-ts/helpers/imageData', () => ({
  toImageData: () => new ImageData(1, 1),
}))

// archiveRenderer is the only renderer-side dep; mock its surface.
const renderer = vi.hoisted(() => ({
  renderEntry: vi.fn(),
  renderPaletteGrid: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })),
  classifyEntry: vi.fn(),
  loadPaletteByName: vi.fn(),
  getPaletteNames: vi.fn(() => [] as string[]),
  formatBytes: vi.fn((n: number) => `${n} bytes`),
}))
vi.mock('../../../utils/archiveRenderer', () => renderer)

import ArchivePreview from '../ArchivePreview'
import { installMockApi, type MockApi } from '../../../__tests__/setup/mockApi'

interface FakeEntry {
  entryName: string
  fileSize: number
  toUint8Array: () => Uint8Array
}

interface FakeArchive {
  getEntryBuffer: (entry: FakeEntry) => Uint8Array
}

function makeEntry(overrides: Partial<FakeEntry> = {}): FakeEntry {
  return {
    entryName: 'sample.epf',
    fileSize: 1234,
    toUint8Array: () => new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]),
    ...overrides,
  }
}

function makeArchive(buf = new Uint8Array([1, 2, 3, 4])): FakeArchive {
  return { getEntryBuffer: () => buf }
}

let api: MockApi

beforeEach(() => {
  api = installMockApi()
  vi.clearAllMocks()
  renderer.classifyEntry.mockReturnValue('hex')
  renderer.formatBytes.mockImplementation((n: number) => `${n} bytes`)
  renderer.getPaletteNames.mockReturnValue([])
  renderer.renderEntry.mockReturnValue(null)
  renderer.renderPaletteGrid.mockReturnValue({ data: new Uint8ClampedArray(4), width: 1, height: 1 })
})

// ── Header dispatcher ─────────────────────────────────────────────────────────

describe('ArchivePreview header', () => {
  it('shows entry name, formatted size, and the classified type', () => {
    renderer.classifyEntry.mockReturnValue('text')
    render(
      <ArchivePreview
        entry={makeEntry({ entryName: 'readme.txt', fileSize: 100 }) as never}
        archive={makeArchive() as never}
      />,
    )
    expect(screen.getByText('readme.txt')).toBeInTheDocument()
    expect(screen.getByText(/100 bytes/)).toBeInTheDocument()
    expect(screen.getByText(/text/)).toBeInTheDocument()
  })

  it('hides Export-as-PNG button for non-renderable types (text, audio, hex)', () => {
    renderer.classifyEntry.mockReturnValue('text')
    render(<ArchivePreview entry={makeEntry() as never} archive={makeArchive() as never} />)
    expect(screen.queryByRole('button', { name: /export as png/i })).toBeNull()
  })

  it('shows Export-as-PNG button for sprite/palette/image types', () => {
    renderer.classifyEntry.mockReturnValue('sprite')
    render(<ArchivePreview entry={makeEntry() as never} archive={makeArchive() as never} />)
    expect(screen.getByRole('button', { name: /export as png/i })).toBeInTheDocument()
  })
})

// ── Type-based dispatching ────────────────────────────────────────────────────

describe('ArchivePreview type dispatch', () => {
  it('renders TextPreview for type=text', () => {
    renderer.classifyEntry.mockReturnValue('text')
    const buf = new TextEncoder().encode('hello world')
    render(<ArchivePreview entry={makeEntry({ entryName: 'a.txt' }) as never} archive={{ getEntryBuffer: () => buf } as never} />)
    expect(screen.getByText(/hello world/)).toBeInTheDocument()
  })

  it('renders HexPreview for type=hex with hex offsets', () => {
    renderer.classifyEntry.mockReturnValue('hex')
    const buf = new Uint8Array([0xAB, 0xCD, 0xEF, 0x01])
    render(<ArchivePreview entry={makeEntry() as never} archive={{ getEntryBuffer: () => buf } as never} />)
    // Hex address column starts with 8-zero offset
    expect(screen.getByText(/00000000.*ab cd ef 01/)).toBeInTheDocument()
  })

  it('renders SpritePreview controls when sprite has palette names', async () => {
    renderer.classifyEntry.mockReturnValue('sprite')
    renderer.getPaletteNames.mockReturnValue(['palette_001', 'palette_002'])
    renderer.renderEntry.mockReturnValue({
      frames: [{ data: new Uint8ClampedArray(4), width: 1, height: 1 }],
    })
    render(<ArchivePreview entry={makeEntry() as never} archive={makeArchive() as never} />)
    // Palette select renders as a combobox
    expect(await screen.findByRole('combobox')).toBeInTheDocument()
  })
})

// ── Extract Raw button ────────────────────────────────────────────────────────

describe('Extract Raw', () => {
  it('calls saveFile with the entry name and writes raw bytes', async () => {
    const user = userEvent.setup()
    api.saveFile.mockResolvedValue('/out/sample.epf')
    api.writeBytes.mockResolvedValue(undefined)

    render(<ArchivePreview entry={makeEntry({ entryName: 'sample.epf' }) as never} archive={makeArchive() as never} />)
    await user.click(screen.getByRole('button', { name: /extract raw/i }))

    await waitFor(() => expect(api.writeBytes).toHaveBeenCalledTimes(1))
    expect(api.saveFile).toHaveBeenCalledWith(
      [{ name: 'All Files', extensions: ['*'] }],
      'sample.epf',
    )
    expect(api.writeBytes).toHaveBeenCalledWith('/out/sample.epf', expect.any(Uint8Array))
  })

  it('aborts cleanly when the save dialog is cancelled', async () => {
    const user = userEvent.setup()
    api.saveFile.mockResolvedValue(null)
    render(<ArchivePreview entry={makeEntry() as never} archive={makeArchive() as never} />)
    await user.click(screen.getByRole('button', { name: /extract raw/i }))
    await new Promise((r) => setTimeout(r, 0))
    expect(api.writeBytes).not.toHaveBeenCalled()
  })
})

// ── Export as PNG button ──────────────────────────────────────────────────────

describe('Export as PNG', () => {
  it('saves a single-frame entry as a single PNG via saveFile + writeBytes', async () => {
    const user = userEvent.setup()
    renderer.classifyEntry.mockReturnValue('sprite')
    renderer.getPaletteNames.mockReturnValue(['palette_001'])
    renderer.loadPaletteByName.mockReturnValue({} as never)
    renderer.renderEntry.mockReturnValue({
      frames: [{ data: new Uint8ClampedArray(4), width: 1, height: 1 }],
    })
    api.saveFile.mockResolvedValue('/out/icon.png')
    api.writeBytes.mockResolvedValue(undefined)

    render(<ArchivePreview entry={makeEntry({ entryName: 'icon.epf' }) as never} archive={makeArchive() as never} />)
    await user.click(screen.getByRole('button', { name: /export as png/i }))

    await waitFor(() => expect(api.writeBytes).toHaveBeenCalled())
    expect(api.saveFile).toHaveBeenCalledWith(
      [{ name: 'PNG Image', extensions: ['png'] }],
      'icon.png',
    )
  })

  it('exports each frame to a directory for multi-frame sprites', async () => {
    const user = userEvent.setup()
    renderer.classifyEntry.mockReturnValue('sprite')
    renderer.getPaletteNames.mockReturnValue(['p'])
    renderer.loadPaletteByName.mockReturnValue({} as never)
    renderer.renderEntry.mockReturnValue({
      frames: [
        { data: new Uint8ClampedArray(4), width: 1, height: 1 },
        { data: new Uint8ClampedArray(4), width: 1, height: 1 },
        { data: new Uint8ClampedArray(4), width: 1, height: 1 },
      ],
    })
    api.openDirectory.mockResolvedValue('/out')
    api.writeBytes.mockResolvedValue(undefined)

    render(<ArchivePreview entry={makeEntry({ entryName: 'walk.mpf' }) as never} archive={makeArchive() as never} />)
    await user.click(screen.getByRole('button', { name: /export as png/i }))

    await waitFor(() => expect(api.writeBytes).toHaveBeenCalledTimes(3))
    expect(api.openDirectory).toHaveBeenCalled()
    // Each call uses a path with the frame index zero-padded to 3
    const calls = api.writeBytes.mock.calls
    expect(calls[0][0]).toBe('/out/walk_001.png')
    expect(calls[1][0]).toBe('/out/walk_002.png')
    expect(calls[2][0]).toBe('/out/walk_003.png')
  })

  it('aborts when no palette is available (renderEntry returns null)', async () => {
    const user = userEvent.setup()
    renderer.classifyEntry.mockReturnValue('sprite')
    renderer.getPaletteNames.mockReturnValue([])
    renderer.renderEntry.mockReturnValue(null)
    render(<ArchivePreview entry={makeEntry() as never} archive={makeArchive() as never} />)
    await user.click(screen.getByRole('button', { name: /export as png/i }))
    await new Promise((r) => setTimeout(r, 0))
    expect(api.saveFile).not.toHaveBeenCalled()
    expect(api.writeBytes).not.toHaveBeenCalled()
  })
})
