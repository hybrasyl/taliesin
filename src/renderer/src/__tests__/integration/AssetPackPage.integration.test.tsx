import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// In-memory fs + module mocks must be hoisted before importing handlers.
const memfs = vi.hoisted(async () => {
  const { createMemoryFs } = await import('../setup/handlerBridge')
  return createMemoryFs()
})

vi.mock('fs', async () => (await memfs).fsModule)
vi.mock('@eriscorp/hybindex-ts', () => {
  const m = {
    buildIndex: vi.fn(),
    loadIndex: vi.fn(),
    saveIndex: vi.fn(),
    getIndexStatus: vi.fn(),
    deleteIndex: vi.fn()
  }
  return { ...m, default: m }
})
vi.mock('child_process', () => {
  const execFile = vi.fn((_c: string, _a: string[], cb?: (e: Error | null) => void) => {
    cb?.(null)
    return {}
  })
  const spawn = vi.fn(() => ({ unref: vi.fn() }))
  const m = { execFile, spawn }
  return { ...m, default: m }
})

// PackEditor's renderer-side dimension validation tries to decode the picked
// PNG via canvas. Stub it so the integration test's fake byte payloads don't
// fail the validation step.
vi.mock('../../utils/imageLoader', () => ({
  loadPixelBufferFromPath: vi.fn(async () => ({
    data: new Uint8ClampedArray(32 * 32 * 4),
    width: 32,
    height: 32
  }))
}))

import { RecoilRoot, type MutableSnapshot } from 'recoil'
import AssetPackPage from '../../pages/AssetPackPage'
import { packDirState } from '../../recoil/atoms'
import { installBridgedApi } from '../setup/handlerBridge'

// Variable-path import keeps TypeScript from graph-resolving src/main/ into
// the renderer's tsconfig project. Vitest still handles the import at runtime.
const HANDLERS_PATH = '../../../../main/handlers'
async function loadHandlers() {
  return import(/* @vite-ignore */ HANDLERS_PATH)
}

const PACK_DIR = '/work/asset-packs'

beforeEach(async () => {
  const fs = await memfs
  fs.reset()
  // Bridge installation is async because the handlers module loads dalib-ts /
  // archiver lazily via dynamic import — but for AssetPackPage we never hit those.
  const handlers = await loadHandlers()
  installBridgedApi(handlers, {
    settingsPath: '/appdata/Taliesin',
    settingsManager: { load: async () => ({}), save: async () => undefined }
  })
})

function withPackDir(): React.FC<{ children: React.ReactNode }> {
  return ({ children }) => (
    <RecoilRoot initializeState={(snap: MutableSnapshot) => snap.set(packDirState, PACK_DIR)}>
      {children}
    </RecoilRoot>
  )
}

describe('AssetPackPage — round-trip integration', () => {
  it('lists packs that already exist in the working directory', async () => {
    const fs = await memfs
    fs.files.set(
      `${PACK_DIR}/alpha.json`,
      Buffer.from(
        JSON.stringify({
          pack_id: 'alpha',
          pack_version: '1.0.0',
          content_type: 'ability_icons',
          priority: 100,
          covers: {},
          assets: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        }),
        'utf-8'
      )
    )
    fs.files.set(
      `${PACK_DIR}/beta.json`,
      Buffer.from(
        JSON.stringify({
          pack_id: 'beta',
          pack_version: '1.0.0',
          content_type: 'nation_badges',
          priority: 100,
          covers: {},
          assets: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        }),
        'utf-8'
      )
    )

    render(<AssetPackPage />, { wrapper: withPackDir() })
    expect(await screen.findByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('beta')).toBeInTheDocument()
    expect(screen.getByText(/2 packs?/)).toBeInTheDocument()
  })

  it('selecting a pack loads it into the editor', async () => {
    const fs = await memfs
    fs.files.set(
      `${PACK_DIR}/sample.json`,
      Buffer.from(
        JSON.stringify({
          pack_id: 'sample',
          pack_version: '1.0.0',
          content_type: 'ability_icons',
          priority: 100,
          covers: {},
          assets: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        }),
        'utf-8'
      )
    )

    const user = userEvent.setup()
    render(<AssetPackPage />, { wrapper: withPackDir() })

    await user.click(await screen.findByRole('button', { name: /sample/i }))
    // PackEditor renders a Version field with the loaded version
    await waitFor(() => expect(screen.getByDisplayValue('1.0.0')).toBeInTheDocument())
    expect(screen.getByText(/Type: ability_icons/)).toBeInTheDocument()
  })

  it('round-trip: edit a field, save, reload — change is persisted on disk and visible on next load', async () => {
    const fs = await memfs
    fs.files.set(
      `${PACK_DIR}/sample.json`,
      Buffer.from(
        JSON.stringify({
          pack_id: 'sample',
          pack_version: '1.0.0',
          content_type: 'ability_icons',
          priority: 100,
          covers: {},
          assets: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        }),
        'utf-8'
      )
    )

    const user = userEvent.setup()
    render(<AssetPackPage />, { wrapper: withPackDir() })

    // Select the pack
    await user.click(await screen.findByRole('button', { name: /sample/i }))
    const versionField = (await screen.findByLabelText('Version')) as HTMLInputElement
    expect(versionField.value).toBe('1.0.0')

    // Edit version
    await user.clear(versionField)
    await user.type(versionField, '2.5.0')
    expect((screen.getByLabelText('Version') as HTMLInputElement).value).toBe('2.5.0')

    // Save
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    // Verify the change reached disk through the real packSave handler
    await waitFor(() => {
      const saved = JSON.parse(fs.files.get(`${PACK_DIR}/sample.json`)!.toString('utf-8'))
      expect(saved.pack_version).toBe('2.5.0')
    })
  })

  it('delete removes the pack from the list and from disk', async () => {
    const fs = await memfs
    fs.files.set(
      `${PACK_DIR}/doomed.json`,
      Buffer.from(
        JSON.stringify({
          pack_id: 'doomed',
          pack_version: '1.0.0',
          content_type: 'ability_icons',
          priority: 100,
          covers: {},
          assets: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        }),
        'utf-8'
      )
    )

    const user = userEvent.setup()
    render(<AssetPackPage />, { wrapper: withPackDir() })

    await user.click(await screen.findByRole('button', { name: /doomed/i }))
    await user.click(await screen.findByRole('button', { name: /delete pack/i }))

    await waitFor(() => {
      expect(fs.files.has(`${PACK_DIR}/doomed.json`)).toBe(false)
    })
    expect(screen.queryByRole('button', { name: /doomed/i })).toBeNull()
  })

  it('add asset → save flow round-trips through packAddAsset + packSave', async () => {
    const fs = await memfs
    fs.files.set(
      `${PACK_DIR}/sample.json`,
      Buffer.from(
        JSON.stringify({
          pack_id: 'sample',
          pack_version: '1.0.0',
          content_type: 'ability_icons',
          priority: 100,
          covers: {},
          assets: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        }),
        'utf-8'
      )
    )
    // Source PNG that the user "selected" via the dialog
    fs.files.set('/src/icon.png', Buffer.from('PNGDATA'))

    // Re-install bridge with an openFile dialog that returns the source PNG path
    const handlers = await loadHandlers()
    installBridgedApi(handlers, {
      settingsPath: '/appdata/Taliesin',
      settingsManager: { load: async () => ({}), save: async () => undefined },
      dialog: { openFile: async () => '/src/icon.png' }
    })

    const user = userEvent.setup()
    render(<AssetPackPage />, { wrapper: withPackDir() })
    await user.click(await screen.findByRole('button', { name: /sample/i }))

    // Click Add PNG inside the editor
    await user.click(await screen.findByRole('button', { name: /add png/i }))

    // ability_icons opens a menu — pick the skill namespace
    await user.click(await screen.findByRole('menuitem', { name: 'skill' }))

    // Wait for the asset to appear in the table
    const row = await screen.findByText('skill0001.png')
    expect(row).toBeInTheDocument()
    // The handler copied the source PNG to the pack assets dir
    expect(fs.files.get(`${PACK_DIR}/sample/skill0001.png`)?.toString('utf-8')).toBe('PNGDATA')

    // Save the manifest so the new asset list persists
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => {
      const saved = JSON.parse(fs.files.get(`${PACK_DIR}/sample.json`)!.toString('utf-8'))
      expect(saved.assets).toEqual([{ filename: 'skill0001.png', sourcePath: '/src/icon.png' }])
    })
  })

  it('Import .datf round-trips a compiled pack into an editable project', async () => {
    const fs = await memfs

    // Build a real .datf via archiver, drop it on memfs, then click Import.
    const archiver = (await import('archiver')).default
    const datfBytes = await new Promise<Buffer>((resolve, reject) => {
      const archive = archiver('zip')
      const chunks: Buffer[] = []
      archive.on('data', (c: Buffer) => chunks.push(c))
      archive.on('end', () => resolve(Buffer.concat(chunks)))
      archive.on('error', reject)
      archive.append(
        JSON.stringify({
          schema_version: 1,
          pack_id: 'imported',
          pack_version: '2.0.0',
          content_type: 'ability_icons',
          priority: 200,
          covers: { ability_icons: { dimensions: [32, 32] } }
        }),
        { name: '_manifest.json' }
      )
      archive.append(Buffer.from('FIRST'), { name: 'skill0001.png' })
      archive.append(Buffer.from('SECOND'), { name: 'skill0002.png' })
      void archive.finalize()
    })
    fs.files.set('/imports/imported.datf', datfBytes)

    const handlers = await loadHandlers()
    installBridgedApi(handlers, {
      settingsPath: '/appdata/Taliesin',
      settingsManager: { load: async () => ({}), save: async () => undefined },
      dialog: { openFile: async () => '/imports/imported.datf' }
    })

    const user = userEvent.setup()
    render(<AssetPackPage />, { wrapper: withPackDir() })

    await user.click(await screen.findByRole('button', { name: /import \.datf/i }))

    // Project json + extracted assets should land under PACK_DIR
    await waitFor(() => {
      expect(fs.files.has(`${PACK_DIR}/imported.json`)).toBe(true)
    })
    expect(fs.files.get(`${PACK_DIR}/imported/skill0001.png`)?.toString('utf-8')).toBe('FIRST')
    expect(fs.files.get(`${PACK_DIR}/imported/skill0002.png`)?.toString('utf-8')).toBe('SECOND')

    // Pack list refreshes and the imported pack is selected — version field reflects it
    await waitFor(() =>
      expect((screen.getByLabelText('Version') as HTMLInputElement).value).toBe('2.0.0')
    )
    expect(screen.getByText(/Type: ability_icons/)).toBeInTheDocument()
  })

  it('ui_sprite_overrides → New source file… creates nested mile.spf/0000.png on disk', async () => {
    const fs = await memfs
    fs.files.set(
      `${PACK_DIR}/uipack.json`,
      Buffer.from(
        JSON.stringify({
          pack_id: 'uipack',
          pack_version: '1.0.0',
          content_type: 'ui_sprite_overrides',
          priority: 100,
          covers: { ui_sprite_overrides: {} },
          assets: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        }),
        'utf-8'
      )
    )
    fs.files.set('/src/frame.png', Buffer.from('FRAMEDATA'))

    const handlers = await loadHandlers()
    installBridgedApi(handlers, {
      settingsPath: '/appdata/Taliesin',
      settingsManager: { load: async () => ({}), save: async () => undefined },
      dialog: { openFile: async () => '/src/frame.png' }
    })

    const user = userEvent.setup()
    render(<AssetPackPage />, { wrapper: withPackDir() })

    await user.click(await screen.findByRole('button', { name: /uipack/i }))
    await user.click(await screen.findByRole('button', { name: /add png/i }))
    await user.click(await screen.findByRole('menuitem', { name: /new source file/i }))

    // Custom-namespace dialog
    await user.type(await screen.findByLabelText('Source filename'), 'mile.spf')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    // Asset lands at <packDir>/<pack_id>/mile.spf/0000.png
    await waitFor(() => {
      expect(
        fs.files.get(`${PACK_DIR}/uipack/mile.spf/0000.png`)?.toString('utf-8')
      ).toBe('FRAMEDATA')
    })
    expect(await screen.findByText('mile.spf/0000.png')).toBeInTheDocument()
  })
})

void within // keep import for flexibility in future tests
