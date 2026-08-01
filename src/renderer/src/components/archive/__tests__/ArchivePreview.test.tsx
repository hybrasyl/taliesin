import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Palette resolution is dalib-ts's job and is covered by its own conformance
// fixture. Here we only care that the preview honours whatever it returns, so
// the resolver is a single controllable stub: null means "no rule matched".
const resolverStub = vi.hoisted(() => ({
  resolve: vi.fn<(...args: unknown[]) => unknown>(() => null)
}))

// Mock dalib-ts BEFORE importing ArchivePreview so the component picks up our stub.
// The real Palette class touches binary buffers; we only need a constructor + buffer entrypoint.
vi.mock('@eriscorp/dalib-ts', () => {
  class FakePalette {
    static fromBuffer() {
      return new FakePalette()
    }
  }
  class FakeColorTable {
    entries: { colorIndex: number; colors: { r: number; g: number; b: number }[] }[] = []
    static fromBuffer() {
      return new FakeColorTable()
    }
  }
  return {
    Palette: FakePalette,
    DataArchive: class {},
    // Symbols imported by ArchivePreview for the new preview types. The
    // existing tests don't render tileset/pcx/darkness/font/bik so empty
    // class stubs are sufficient — they just need to satisfy the import.
    TilesetView: class {
      static fromEntry() {
        return { count: 0, get: () => null }
      }
    },
    HeaFile: class {
      static fromBuffer() {
        return { layerCount: 0 }
      }
    },
    FntFile: class {
      static fromBuffer() {
        return { glyphCount: 0, bytesPerRow: 0, getGlyphData: () => new Uint8Array() }
      }
    },
    ColorTable: FakeColorTable,
    // LFT symbols reached through LftPreview and its two children. No test here
    // renders the font browser — components/archive/__tests__/LftPreview.test.tsx
    // covers it against a synthetic LftFile — so these only satisfy the import.
    LftFile: class {
      static fromBuffer() {
        return { nominalWidth: 0, nominalHeight: 0, glyphs: [], getGlyph: () => undefined }
      }
    },
    lftGlyphKeys: () => [],
    measureLftText: () => ({ advanceWidth: 0, ink: { left: 0, top: 0, right: 0, bottom: 0 } }),
    renderLftText: () => ({ width: 0, height: 0, data: new Uint8ClampedArray() }),
    lftGlyphWidth: () => 0,
    lftGlyphHeight: () => 0,
    PaletteResolver: class {
      resolve = resolverStub.resolve
    },
    renderTile: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    renderDarknessOverlay: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })
  }
})

vi.mock('@eriscorp/dalib-ts/helpers/imageData', () => ({
  toImageData: () => new ImageData(1, 1)
}))

// archiveRenderer is the only renderer-side dep; mock its surface.
const renderer = vi.hoisted(() => ({
  renderEntry: vi.fn(),
  renderPaletteGrid: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })),
  classifyEntry: vi.fn(),
  loadPaletteByName: vi.fn(),
  getPaletteNames: vi.fn(() => [] as string[]),
  decodePcx: vi.fn() as unknown as ReturnType<typeof vi.fn>,
  parseBikHeader: vi.fn() as unknown as ReturnType<typeof vi.fn>
}))
vi.mock('../../../utils/archiveRenderer', () => renderer)

import ArchivePreview from '../ArchivePreview'
import { useArchiveStore } from '../../../store/archiveStore'
import { installMockApi, type MockApi } from '../../../__tests__/setup/mockApi'
import { seedSettings, resetStores } from '../../../__tests__/setup/storeWrapper'

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
    toUint8Array: () => new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
    ...overrides
  }
}

function makeArchive(buf = new Uint8Array([1, 2, 3, 4])): FakeArchive {
  return { getEntryBuffer: () => buf }
}

/**
 * ArchivePreview takes only an index; the archive and entry come from the store
 * (see archiveStore.ts for why they must not be props). This harness keeps the
 * tests reading as "render this entry from this archive" while seeding the
 * store, which is where the component now looks.
 */
const PreviewHarness: React.FC<{ entry: unknown; archive: unknown }> = ({ entry, archive }) => {
  useArchiveStore
    .getState()
    .open(Object.assign({ entries: [entry] }, archive) as never, 'test.dat', new Map())
  return <ArchivePreview entryIndex={0} />
}

let api: MockApi

beforeEach(() => {
  api = installMockApi()
  vi.clearAllMocks()
  resetStores()
  renderer.classifyEntry.mockReturnValue('hex')
  renderer.getPaletteNames.mockReturnValue([])
  renderer.renderEntry.mockReturnValue(null)
  resolverStub.resolve.mockReturnValue(null)
  renderer.renderPaletteGrid.mockReturnValue({
    data: new Uint8ClampedArray(4),
    width: 1,
    height: 1
  })
})

// ── Header dispatcher ─────────────────────────────────────────────────────────

describe('ArchivePreview header', () => {
  it('shows entry name, formatted size, and the classified type', () => {
    renderer.classifyEntry.mockReturnValue('text')
    render(
      <PreviewHarness
        entry={makeEntry({ entryName: 'readme.txt', fileSize: 100 }) as never}
        archive={makeArchive() as never}
      />
    )
    expect(screen.getByText('readme.txt')).toBeInTheDocument()
    expect(screen.getByText(/100 B/)).toBeInTheDocument()
    expect(screen.getByText(/text/)).toBeInTheDocument()
  })

  it('hides Export-as-PNG button for non-renderable types (text, audio, hex)', () => {
    renderer.classifyEntry.mockReturnValue('text')
    render(<PreviewHarness entry={makeEntry() as never} archive={makeArchive() as never} />)
    expect(screen.queryByRole('button', { name: /export as png/i })).toBeNull()
  })

  it('shows Export-as-PNG button for sprite/palette/image types', () => {
    renderer.classifyEntry.mockReturnValue('sprite')
    render(<PreviewHarness entry={makeEntry() as never} archive={makeArchive() as never} />)
    expect(screen.getByRole('button', { name: /export as png/i })).toBeInTheDocument()
  })
})

// ── Type-based dispatching ────────────────────────────────────────────────────

describe('ArchivePreview type dispatch', () => {
  it('renders TextPreview for type=text', () => {
    renderer.classifyEntry.mockReturnValue('text')
    const buf = new TextEncoder().encode('hello world')
    render(
      <PreviewHarness
        entry={makeEntry({ entryName: 'a.txt' }) as never}
        archive={{ getEntryBuffer: () => buf } as never}
      />
    )
    expect(screen.getByText(/hello world/)).toBeInTheDocument()
  })

  it('renders HexPreview for type=hex with hex offsets', () => {
    renderer.classifyEntry.mockReturnValue('hex')
    const buf = new Uint8Array([0xab, 0xcd, 0xef, 0x01])
    render(
      <PreviewHarness
        entry={makeEntry() as never}
        archive={{ getEntryBuffer: () => buf } as never}
      />
    )
    // Hex address column starts with 8-zero offset
    expect(screen.getByText(/00000000.*ab cd ef 01/)).toBeInTheDocument()
  })

  it('renders SpritePreview controls when sprite has palette names', async () => {
    renderer.classifyEntry.mockReturnValue('sprite')
    renderer.getPaletteNames.mockReturnValue(['palette_001', 'palette_002'])
    renderer.renderEntry.mockReturnValue({
      frames: [{ data: new Uint8ClampedArray(4), width: 1, height: 1 }]
    })
    render(<PreviewHarness entry={makeEntry() as never} archive={makeArchive() as never} />)
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

    render(
      <PreviewHarness
        entry={makeEntry({ entryName: 'sample.epf' }) as never}
        archive={makeArchive() as never}
      />
    )
    await user.click(screen.getByRole('button', { name: /extract raw/i }))

    await waitFor(() => expect(api.writeBytes).toHaveBeenCalledTimes(1))
    expect(api.saveFile).toHaveBeenCalledWith(
      [{ name: 'All Files', extensions: ['*'] }],
      'sample.epf'
    )
    expect(api.writeBytes).toHaveBeenCalledWith('/out/sample.epf', expect.any(Uint8Array))
  })

  it('aborts cleanly when the save dialog is cancelled', async () => {
    const user = userEvent.setup()
    api.saveFile.mockResolvedValue(null)
    render(<PreviewHarness entry={makeEntry() as never} archive={makeArchive() as never} />)
    await user.click(screen.getByRole('button', { name: /extract raw/i }))
    await new Promise((r) => setTimeout(r, 0))
    expect(api.writeBytes).not.toHaveBeenCalled()
  })
})

// ── Automatic palette resolution ──────────────────────────────────────────────

describe('SpritePreview palette resolution', () => {
  const RESOLVED_PALETTE = { marker: 'resolved' }

  function renderSprite(): void {
    renderer.classifyEntry.mockReturnValue('sprite')
    renderer.renderEntry.mockReturnValue({
      frames: [{ data: new Uint8ClampedArray(4), width: 1, height: 1 }]
    })
    render(
      <PreviewHarness
        entry={makeEntry({ entryName: 'mba00101.epf' }) as never}
        archive={makeArchive() as never}
      />
    )
  }

  it('renders with the resolved palette without the user choosing one', () => {
    resolverStub.resolve.mockReturnValue({
      palette: RESOLVED_PALETTE,
      paletteNumber: 42,
      luminanceBlended: false,
      kind: 'table',
      ruleId: 'khan/letter'
    })
    renderer.getPaletteNames.mockReturnValue(['pala001.pal', 'palb001.pal'])

    renderSprite()

    // The palette handed to the renderer is the resolved one, NOT the first
    // name in the dropdown — that default was the bug this replaced.
    expect(renderer.renderEntry).toHaveBeenCalledWith(expect.anything(), RESOLVED_PALETTE)
    expect(renderer.loadPaletteByName).not.toHaveBeenCalled()
  })

  it('shows which rule fired, the palette number, and the source kind', () => {
    resolverStub.resolve.mockReturnValue({
      palette: RESOLVED_PALETTE,
      paletteNumber: 42,
      luminanceBlended: true,
      kind: 'table',
      ruleId: 'khan/letter'
    })
    renderSprite()

    expect(screen.getByText(/khan\/letter/)).toBeInTheDocument()
    expect(screen.getByText(/palette 42/)).toBeInTheDocument()
    expect(screen.getByText(/luminance-blended/)).toBeInTheDocument()
  })

  it('lets a hand-picked palette override the resolved one', async () => {
    const user = userEvent.setup()
    resolverStub.resolve.mockReturnValue({
      palette: RESOLVED_PALETTE,
      paletteNumber: 42,
      luminanceBlended: false,
      kind: 'table',
      ruleId: 'khan/letter'
    })
    const manual = { marker: 'manual' }
    renderer.getPaletteNames.mockReturnValue(['palb001.pal'])
    renderer.loadPaletteByName.mockReturnValue(manual as never)

    renderSprite()
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: 'palb001.pal' }))

    await waitFor(() =>
      expect(renderer.renderEntry).toHaveBeenLastCalledWith(expect.anything(), manual)
    )
    // The rule caption belongs to the automatic choice and goes away with it.
    expect(screen.queryByText(/khan\/letter/)).toBeNull()
  })

  it('says so plainly when no rule matches, and still offers the manual list', () => {
    resolverStub.resolve.mockReturnValue(null)
    renderer.getPaletteNames.mockReturnValue(['palb001.pal'])

    renderSprite()

    expect(screen.getByText(/no rule matched/i)).toBeInTheDocument()
    expect(renderer.renderEntry).toHaveBeenCalledWith(expect.anything(), null)
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
      frames: [{ data: new Uint8ClampedArray(4), width: 1, height: 1 }]
    })
    api.saveFile.mockResolvedValue('/out/icon.png')
    api.writeBytes.mockResolvedValue(undefined)

    render(
      <PreviewHarness
        entry={makeEntry({ entryName: 'icon.epf' }) as never}
        archive={makeArchive() as never}
      />
    )
    await user.click(screen.getByRole('button', { name: /export as png/i }))

    await waitFor(() => expect(api.writeBytes).toHaveBeenCalled())
    expect(api.saveFile).toHaveBeenCalledWith(
      [{ name: 'PNG Image', extensions: ['png'] }],
      'icon.png'
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
        { data: new Uint8ClampedArray(4), width: 1, height: 1 }
      ]
    })
    api.openDirectory.mockResolvedValue('/out')
    api.writeBytes.mockResolvedValue(undefined)

    render(
      <PreviewHarness
        entry={makeEntry({ entryName: 'walk.mpf' }) as never}
        archive={makeArchive() as never}
      />
    )
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
    render(<PreviewHarness entry={makeEntry() as never} archive={makeArchive() as never} />)
    await user.click(screen.getByRole('button', { name: /export as png/i }))
    await new Promise((r) => setTimeout(r, 0))
    expect(api.saveFile).not.toHaveBeenCalled()
    expect(api.writeBytes).not.toHaveBeenCalled()
  })
})

// ── BIK preview ───────────────────────────────────────────────────────────────

function renderWithRecoil(ui: React.ReactElement, ffmpegPath: string | null = '/usr/bin/ffmpeg') {
  seedSettings({ ffmpegPath })
  return render(ui)
}

describe('BikPreview', () => {
  it('shows resolution + duration parsed from header', () => {
    renderer.classifyEntry.mockReturnValue('bik')
    renderer.parseBikHeader.mockReturnValue({
      version: 'i',
      width: 640,
      height: 480,
      frameCount: 180,
      fps: 30,
      audioTrackCount: 1
    })
    renderWithRecoil(
      <PreviewHarness
        entry={makeEntry({ entryName: 'intro.bik' }) as never}
        archive={makeArchive() as never}
      />
    )
    expect(screen.getByText(/640 × 480/)).toBeInTheDocument()
    expect(screen.getByText(/Bink Video \(BIKi\)/)).toBeInTheDocument()
    expect(screen.getByText(/0:06/)).toBeInTheDocument() // 180 frames @ 30fps
  })

  it('Convert & Play calls bikConvert with the entry bytes + ffmpegPath + cacheDir', async () => {
    const user = userEvent.setup()
    renderer.classifyEntry.mockReturnValue('bik')
    renderer.parseBikHeader.mockReturnValue({
      version: 'i',
      width: 640,
      height: 480,
      frameCount: 30,
      fps: 30,
      audioTrackCount: 1
    })
    api.getUserDataPath.mockResolvedValue('/userData')
    api.bikConvert.mockResolvedValue('/userData/bik-cache/abc.mp4')
    api.readFile.mockResolvedValue(
      Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]) as never
    )

    const entryBytes = new Uint8Array([0x42, 0x49, 0x4b, 0x69])
    renderWithRecoil(
      <PreviewHarness
        entry={makeEntry({ entryName: 'intro.bik', toUint8Array: () => entryBytes }) as never}
        archive={makeArchive() as never}
      />,
      '/usr/bin/ffmpeg'
    )

    await user.click(screen.getByRole('button', { name: /convert & play/i }))

    await waitFor(() => expect(api.bikConvert).toHaveBeenCalledTimes(1))
    expect(api.bikConvert).toHaveBeenCalledWith(
      entryBytes,
      '/usr/bin/ffmpeg',
      expect.stringMatching(/[\\/]userData[\\/]bik-cache$/)
    )
    expect(api.readFile).toHaveBeenCalledWith('/userData/bik-cache/abc.mp4')
  })

  it('surfaces a Retry button when conversion fails', async () => {
    const user = userEvent.setup()
    renderer.classifyEntry.mockReturnValue('bik')
    renderer.parseBikHeader.mockReturnValue({
      version: 'i',
      width: 320,
      height: 240,
      frameCount: 1,
      fps: 30,
      audioTrackCount: 0
    })
    api.getUserDataPath.mockResolvedValue('/userData')
    api.bikConvert.mockRejectedValue(new Error('ffmpeg not found'))

    renderWithRecoil(
      <PreviewHarness
        entry={makeEntry({ entryName: 'broken.bik' }) as never}
        archive={makeArchive() as never}
      />
    )

    await user.click(screen.getByRole('button', { name: /convert & play/i }))
    expect(await screen.findByText(/ffmpeg not found/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('shows an error message when the BIK header cannot be parsed', () => {
    renderer.classifyEntry.mockReturnValue('bik')
    renderer.parseBikHeader.mockReturnValue(null)
    renderWithRecoil(
      <PreviewHarness
        entry={makeEntry({ entryName: 'broken.bik' }) as never}
        archive={makeArchive() as never}
      />
    )
    expect(screen.getByText(/Not a recognizable BIK file/)).toBeInTheDocument()
  })
})
