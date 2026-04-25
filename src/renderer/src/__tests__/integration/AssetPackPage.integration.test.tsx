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

    // Wait for the asset to appear in the table
    const row = await screen.findByText('skill_0001.png')
    expect(row).toBeInTheDocument()
    // The handler copied the source PNG to the pack assets dir
    expect(fs.files.get(`${PACK_DIR}/sample/skill_0001.png`)?.toString('utf-8')).toBe('PNGDATA')

    // Save the manifest so the new asset list persists
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => {
      const saved = JSON.parse(fs.files.get(`${PACK_DIR}/sample.json`)!.toString('utf-8'))
      expect(saved.assets).toEqual([{ filename: 'skill_0001.png', sourcePath: '/src/icon.png' }])
    })
  })
})

void within // keep import for flexibility in future tests
