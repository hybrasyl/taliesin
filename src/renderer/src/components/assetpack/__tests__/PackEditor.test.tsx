import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PackEditor from '../PackEditor'
import { installMockApi, type MockApi } from '../../../__tests__/setup/mockApi'

interface PackAsset {
  filename: string
  sourcePath: string
}

interface PackProject {
  pack_id: string
  pack_version: string
  content_type: string
  priority: number
  covers: Record<string, unknown>
  assets: PackAsset[]
  createdAt: string
  updatedAt: string
}

function makePack(overrides: Partial<PackProject> = {}): PackProject {
  return {
    pack_id: 'my-pack',
    pack_version: '1.0.0',
    content_type: 'ability_icons',
    priority: 100,
    covers: {},
    assets: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides
  }
}

let api: MockApi
const onSave = vi.fn()
const onStatus = vi.fn()

beforeEach(() => {
  api = installMockApi()
  onSave.mockReset()
  onStatus.mockReset()
})

describe('PackEditor — initial render', () => {
  it('shows pack id, version, priority, content type, and asset count', () => {
    render(
      <PackEditor
        pack={makePack({ pack_id: 'fancy-pack', pack_version: '2.1.0', priority: 50 })}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )
    // pack_id appears in the header h6 and in the Pack ID text field
    expect(screen.getAllByText(/fancy-pack/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Type: ability_icons/)).toBeInTheDocument()
    expect(screen.getByText(/0 assets/)).toBeInTheDocument()
  })

  it('lists existing assets in the table with their slot numbers', () => {
    const pack = makePack({
      assets: [
        { filename: 'skill_0001.png', sourcePath: '/src/a.png' },
        { filename: 'skill_0002.png', sourcePath: '/src/b.png' }
      ]
    })
    render(
      <PackEditor
        pack={pack}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )
    expect(screen.getByText('skill_0001.png')).toBeInTheDocument()
    expect(screen.getByText('skill_0002.png')).toBeInTheDocument()
    expect(screen.getByText(/2 assets/)).toBeInTheDocument()
  })

  it('disables Save initially (not dirty)', () => {
    render(
      <PackEditor
        pack={makePack()}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('disables Compile when there are no assets', () => {
    render(
      <PackEditor
        pack={makePack()}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )
    expect(screen.getByRole('button', { name: /compile \.datf/i })).toBeDisabled()
  })

  it('enables Compile when there is at least one asset', () => {
    const pack = makePack({ assets: [{ filename: 'skill_0001.png', sourcePath: '/x' }] })
    render(
      <PackEditor
        pack={pack}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )
    expect(screen.getByRole('button', { name: /compile \.datf/i })).not.toBeDisabled()
  })
})

describe('PackEditor — field edits and dirty state', () => {
  it('sanitizes pack_id (lowercase, allowed chars only)', async () => {
    const user = userEvent.setup()
    render(
      <PackEditor
        pack={makePack({ pack_id: 'a' })}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )
    const idField = screen.getByLabelText('Pack ID') as HTMLInputElement
    await user.clear(idField)
    await user.type(idField, 'My PACK!@#')
    // 'My PACK!@#' → lowercase 'my pack!@#' → replace 4 disallowed chars (space, !, @, #) with '-' → 'my-pack---'
    expect(idField.value).toBe('my-pack---')
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled()
  })

  it('parses Priority as int and falls back to 100 when blank', async () => {
    const user = userEvent.setup()
    render(
      <PackEditor
        pack={makePack({ priority: 50 })}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )
    const priorityField = screen.getByLabelText('Priority') as HTMLInputElement
    expect(priorityField.value).toBe('50')

    await user.clear(priorityField)
    // After clearing, the next render uses parseInt('') || 100 → 100
    expect(priorityField.value).toBe('100')
  })
})

describe('PackEditor — save flow', () => {
  it('Save calls packSave, onSave, onStatus, and clears dirty', async () => {
    const user = userEvent.setup()
    api.packSave.mockResolvedValue(undefined)
    render(
      <PackEditor
        pack={makePack()}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )

    // Edit a field to make it dirty
    const versionField = screen.getByLabelText('Version') as HTMLInputElement
    await user.clear(versionField)
    await user.type(versionField, '2.0.0')

    const saveBtn = screen.getByRole('button', { name: /save/i })
    expect(saveBtn).not.toBeDisabled()
    await user.click(saveBtn)

    await waitFor(() => expect(api.packSave).toHaveBeenCalledTimes(1))
    expect(api.packSave).toHaveBeenCalledWith(
      '/p/pack.json',
      expect.objectContaining({ pack_version: '2.0.0' })
    )
    expect(onSave).toHaveBeenCalled()
    expect(onStatus).toHaveBeenCalledWith('Pack saved')
    expect(saveBtn).toBeDisabled() // dirty cleared
  })
})

describe('PackEditor — add and remove assets', () => {
  it('Add PNG opens file dialog and appends a new asset with the next slot id', async () => {
    const user = userEvent.setup()
    const pack = makePack({
      content_type: 'ability_icons',
      assets: [{ filename: 'skill_0007.png', sourcePath: '/src/old.png' }]
    })
    api.openFile.mockResolvedValue('/src/new.png')
    api.packAddAsset.mockResolvedValue(undefined)

    render(
      <PackEditor
        pack={pack}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )
    await user.click(screen.getByRole('button', { name: /add png/i }))

    await waitFor(() => expect(api.packAddAsset).toHaveBeenCalled())
    expect(api.packAddAsset).toHaveBeenCalledWith('/p', '/src/new.png', 'skill_0008.png')
    expect(onStatus).toHaveBeenCalledWith('Added skill_0008.png')
    expect(await screen.findByText('skill_0008.png')).toBeInTheDocument()
  })

  it('Add PNG with content_type=nation_badges uses the nation prefix', async () => {
    const user = userEvent.setup()
    api.openFile.mockResolvedValue('/src/n.png')
    api.packAddAsset.mockResolvedValue(undefined)

    render(
      <PackEditor
        pack={makePack({ content_type: 'nation_badges', assets: [] })}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )
    await user.click(screen.getByRole('button', { name: /add png/i }))

    await waitFor(() => expect(api.packAddAsset).toHaveBeenCalled())
    expect(api.packAddAsset).toHaveBeenCalledWith('/p', '/src/n.png', 'nation0001.png')
  })

  it('Add PNG aborts cleanly when the user cancels the dialog', async () => {
    const user = userEvent.setup()
    api.openFile.mockResolvedValue(null)
    render(
      <PackEditor
        pack={makePack()}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )

    await user.click(screen.getByRole('button', { name: /add png/i }))
    // No state changes — assertion is the absence of side effects.
    await new Promise((r) => setTimeout(r, 0))
    expect(api.packAddAsset).not.toHaveBeenCalled()
    expect(onStatus).not.toHaveBeenCalled()
  })

  it('Delete row calls packRemoveAsset and removes it from the table', async () => {
    const user = userEvent.setup()
    const pack = makePack({
      assets: [
        { filename: 'skill_0001.png', sourcePath: '/a' },
        { filename: 'skill_0002.png', sourcePath: '/b' }
      ]
    })
    api.packRemoveAsset.mockResolvedValue(undefined)
    render(
      <PackEditor
        pack={pack}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )

    // Find the row containing skill_0001 and click its delete IconButton.
    const targetRow = screen.getByText('skill_0001.png').closest('tr')!
    const deleteBtn = within(targetRow).getByRole('button')
    await user.click(deleteBtn)

    await waitFor(() => expect(api.packRemoveAsset).toHaveBeenCalledWith('/p', 'skill_0001.png'))
    await waitFor(() => expect(screen.queryByText('skill_0001.png')).toBeNull())
    expect(screen.getByText('skill_0002.png')).toBeInTheDocument()
  })
})

describe('PackEditor — compile flow', () => {
  it('Compile saves first, prompts for output path, then calls packCompile', async () => {
    const user = userEvent.setup()
    const pack = makePack({
      pack_id: 'my-pack',
      priority: 50,
      assets: [{ filename: 'skill_0001.png', sourcePath: '/a' }]
    })
    api.packSave.mockResolvedValue(undefined)
    api.saveFile.mockResolvedValue('/out/my-pack.datf')
    api.packCompile.mockResolvedValue(undefined)

    render(
      <PackEditor
        pack={pack}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )
    await user.click(screen.getByRole('button', { name: /compile \.datf/i }))

    await waitFor(() => expect(api.packCompile).toHaveBeenCalled())
    expect(api.packSave).toHaveBeenCalledWith('/p/pack.json', expect.any(Object))
    expect(api.saveFile).toHaveBeenCalledWith(
      [{ name: 'DATF Asset Pack', extensions: ['datf'] }],
      'my-pack.datf'
    )
    expect(api.packCompile).toHaveBeenCalledWith(
      '/p',
      expect.objectContaining({
        schema_version: 1,
        pack_id: 'my-pack',
        priority: 50
      }),
      ['skill_0001.png'],
      '/out/my-pack.datf'
    )
    expect(onStatus).toHaveBeenCalledWith('Compiled my-pack.datf (1 assets)')
  })

  it('Compile aborts when the save dialog is cancelled', async () => {
    const user = userEvent.setup()
    const pack = makePack({
      assets: [{ filename: 'skill_0001.png', sourcePath: '/a' }]
    })
    api.packSave.mockResolvedValue(undefined)
    api.saveFile.mockResolvedValue(null)

    render(
      <PackEditor
        pack={pack}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )
    await user.click(screen.getByRole('button', { name: /compile \.datf/i }))

    await waitFor(() => expect(api.packSave).toHaveBeenCalled())
    expect(api.packCompile).not.toHaveBeenCalled()
  })

  it('Compile reports failure via onStatus when packCompile rejects', async () => {
    const user = userEvent.setup()
    const pack = makePack({ assets: [{ filename: 'skill_0001.png', sourcePath: '/a' }] })
    api.packSave.mockResolvedValue(undefined)
    api.saveFile.mockResolvedValue('/out/x.datf')
    api.packCompile.mockRejectedValue(new Error('zip failed'))

    render(
      <PackEditor
        pack={pack}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )
    await user.click(screen.getByRole('button', { name: /compile \.datf/i }))

    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith(expect.stringMatching(/Compile failed: zip failed/))
    })
  })
})

describe('PackEditor — pack prop reset', () => {
  it('reverts draft and clears dirty when the pack prop changes', async () => {
    const user = userEvent.setup()
    const initial = makePack({ pack_version: '1.0.0' })
    const { rerender } = render(
      <PackEditor
        pack={initial}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )
    const versionField = screen.getByLabelText('Version') as HTMLInputElement
    await user.clear(versionField)
    await user.type(versionField, '9.9.9')
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled()

    // Reload the editor with a new pack — should reset draft to incoming pack
    rerender(
      <PackEditor
        pack={makePack({ pack_version: '2.0.0', pack_id: 'reloaded' })}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )

    // Use getByDisplayValue for the new value to avoid duplicate-text matches
    expect(screen.getByDisplayValue('2.0.0')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })
})
