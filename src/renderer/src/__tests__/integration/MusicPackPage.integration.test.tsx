import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const memfs = vi.hoisted(async () => {
  const { createMemoryFs } = await import('../setup/handlerBridge')
  return createMemoryFs()
})

vi.mock('fs', async () => (await memfs).fsModule)
vi.mock('@eriscorp/hybindex-ts', () => {
  const m = {
    buildIndex: vi.fn(),
    loadIndex: vi.fn(async () => null),
    saveIndex: vi.fn(),
    getIndexStatus: vi.fn(),
    deleteIndex: vi.fn()
  }
  return { ...m, default: m }
})
// child_process mock — execFile is used by music:deploy-pack. Track args so we
// can assert ffmpeg invocation parameters.
const execFile = vi.hoisted(() => vi.fn())
vi.mock('child_process', () => {
  const m = {
    execFile,
    spawn: vi.fn(() => ({ unref: vi.fn() }))
  }
  return { ...m, default: m }
})

// Virtual list shim (MusicList uses @tanstack/react-virtual).
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

import { RecoilRoot, type MutableSnapshot } from 'recoil'
import MusicPage from '../../pages/MusicPage'
import { musicLibraryPathState } from '../../recoil/atoms'
import { installBridgedApi } from '../setup/handlerBridge'

const HANDLERS_PATH = '../../../../main/handlers'
async function loadHandlers() {
  return import(/* @vite-ignore */ HANDLERS_PATH)
}

const LIB_DIR = '/music-lib'

beforeEach(async () => {
  const fs = await memfs
  fs.reset()
  vi.clearAllMocks()
  // execFile mock simulates a successful ffmpeg run via callback.
  execFile.mockImplementation((_cmd: string, _args: string[], cb?: (e: Error | null) => void) => {
    cb?.(null)
    return {} as never
  })
})

async function mount(opts: { openDirectory?: () => Promise<string | null> } = {}) {
  const handlers = await loadHandlers()
  installBridgedApi(handlers, {
    settingsPath: '/appdata/Taliesin',
    settingsManager: { load: async () => ({}), save: async () => undefined },
    dialog: { openDirectory: opts.openDirectory }
  })
  return render(
    <RecoilRoot
      initializeState={(snap: MutableSnapshot) => snap.set(musicLibraryPathState, LIB_DIR)}
    >
      <MusicPage />
    </RecoilRoot>
  )
}

describe('MusicPackPage — round-trip integration via MusicPage Packs tab', () => {
  it('Packs tab is reachable and shows the empty state when no packs exist', async () => {
    const user = userEvent.setup()
    await mount()
    await user.click(await screen.findByRole('tab', { name: /^packs$/i }))
    expect(await screen.findByRole('button', { name: /new pack/i })).toBeInTheDocument()
  })

  it('creating a pack persists to <libDir>/music-packs.json via real packsSave handler', async () => {
    const fs = await memfs
    const user = userEvent.setup()
    await mount()
    await user.click(await screen.findByRole('tab', { name: /^packs$/i }))

    // Open the create-pack dialog and fill it
    await user.click(await screen.findByRole('button', { name: /new pack/i }))
    const dialog = await screen.findByRole('dialog')
    const nameField = within(dialog).getByLabelText(/pack name/i) as HTMLInputElement
    await user.type(nameField, 'Greatest Hits')
    await user.click(within(dialog).getByRole('button', { name: /create/i }))

    await waitFor(() => {
      const raw = fs.files.get(`${LIB_DIR}/music-packs.json`)
      expect(raw).toBeTruthy()
      const saved = JSON.parse(raw!.toString('utf-8')) as MusicPack[]
      expect(saved).toHaveLength(1)
      expect(saved[0].name).toBe('Greatest Hits')
    })
  })

  it('lists pre-seeded packs from disk on mount', async () => {
    const fs = await memfs
    const seedPacks: MusicPack[] = [
      {
        id: 'pack-a',
        name: 'Alpha',
        description: '',
        tracks: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      },
      {
        id: 'pack-b',
        name: 'Beta',
        description: '',
        tracks: [],
        createdAt: '2024-01-02T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z'
      }
    ]
    fs.files.set(`${LIB_DIR}/music-packs.json`, Buffer.from(JSON.stringify(seedPacks), 'utf-8'))

    const user = userEvent.setup()
    await mount()
    await user.click(await screen.findByRole('tab', { name: /^packs$/i }))

    expect(await screen.findByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('deploy round-trips: clears dest, ffmpegs every track, writes music-pack.json sidecar', async () => {
    const fs = await memfs

    // Seed: a pack with two .mp3 tracks, source files present, leftover at dest.
    const pack: MusicPack = {
      id: 'demo',
      name: 'Demo Pack',
      description: '',
      tracks: [
        { musicId: 1, sourceFile: 'first.mp3' },
        { musicId: 2, sourceFile: 'second.mp3' }
      ],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    }
    fs.files.set(`${LIB_DIR}/music-packs.json`, Buffer.from(JSON.stringify([pack]), 'utf-8'))
    fs.files.set(`${LIB_DIR}/first.mp3`, Buffer.from('S1'))
    fs.files.set(`${LIB_DIR}/second.mp3`, Buffer.from('S2'))
    fs.files.set('/dest/leftover.mus', Buffer.from('OLD'))

    const user = userEvent.setup()
    await mount({ openDirectory: async () => '/dest' })
    await user.click(await screen.findByRole('tab', { name: /^packs$/i }))

    // Select the seeded pack
    await user.click(await screen.findByText('Demo Pack'))

    // Open the deploy dialog (the trigger button is labelled "Deploy Pack")
    await user.click(await screen.findByRole('button', { name: /deploy pack/i }))
    const deployDialog = await screen.findByRole('dialog')
    // No working dir is configured — type the destination path into the field.
    const destField = within(deployDialog).getByLabelText(
      /destination directory/i
    ) as HTMLInputElement
    await user.clear(destField)
    await user.type(destField, '/dest')
    // Confirm with the "Deploy & Overwrite" action button
    await user.click(within(deployDialog).getByRole('button', { name: /deploy & overwrite/i }))

    // ffmpeg invoked once per track + leftover wiped + sidecar written
    await waitFor(() => {
      expect(execFile).toHaveBeenCalledTimes(2)
      expect(fs.files.has('/dest/leftover.mus')).toBe(false)
      expect(fs.files.has('/dest/music-pack.json')).toBe(true)
    })

    const sidecar = JSON.parse(fs.files.get('/dest/music-pack.json')!.toString('utf-8'))
    expect(sidecar.packId).toBe('demo')
    expect(sidecar.tracks.map((t: { id: number }) => t.id)).toEqual([1, 2])
  })
})
