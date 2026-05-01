import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installMockApi, type MockApi } from '../../../__tests__/setup/mockApi'
import type { ContentType, PackProject } from '../../../packKinds'

// Mock the renderer-side image loader so tests don't need a real canvas.
// Returns a fake 32×32 buffer by default; per-test overrides set custom
// dimensions or pixel data via vi.mocked(loadPixelBufferFromPath).
vi.mock('../../../utils/imageLoader', () => ({
  loadPixelBufferFromPath: vi.fn(async () => ({
    data: new Uint8ClampedArray(32 * 32 * 4),
    width: 32,
    height: 32
  }))
}))

import PackEditor from '../PackEditor'
import { loadPixelBufferFromPath } from '../../../utils/imageLoader'

const mockLoadPng = vi.mocked(loadPixelBufferFromPath)

function makePack(overrides: Partial<PackProject> = {}): PackProject {
  return {
    pack_id: 'my-pack',
    pack_version: '1.0.0',
    content_type: 'ability_icons' as ContentType,
    priority: 100,
    covers: { ability_icons: { dimensions: [32, 32] } },
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
  // Reset the PNG decoder mock to a default 32×32 buffer.
  mockLoadPng.mockResolvedValue({
    data: new Uint8ClampedArray(32 * 32 * 4),
    width: 32,
    height: 32
  })
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
    expect(screen.getAllByText(/fancy-pack/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Type: ability_icons/)).toBeInTheDocument()
    expect(screen.getByText(/0 assets/)).toBeInTheDocument()
  })

  it('lists existing assets in the table with their slot identity', () => {
    const pack = makePack({
      assets: [
        { filename: 'skill0001.png', sourcePath: '/src/a.png' },
        { filename: 'skill0002.png', sourcePath: '/src/b.png' }
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
    expect(screen.getByText('skill0001.png')).toBeInTheDocument()
    expect(screen.getByText('skill0002.png')).toBeInTheDocument()
    expect(screen.getByText(/2 assets/)).toBeInTheDocument()
    // Slot column shows namespace + id
    expect(screen.getByText('skill 1')).toBeInTheDocument()
    expect(screen.getByText('skill 2')).toBeInTheDocument()
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
    const pack = makePack({ assets: [{ filename: 'skill0001.png', sourcePath: '/x' }] })
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
    expect(saveBtn).toBeDisabled()
  })
})

describe('PackEditor — add and remove assets', () => {
  it('ability_icons opens a menu and adding a Skill produces skill0008.png after skill0007', async () => {
    const user = userEvent.setup()
    const pack = makePack({
      content_type: 'ability_icons',
      assets: [{ filename: 'skill0007.png', sourcePath: '/src/old.png' }]
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
    // Menu opens — pick "skill"
    await user.click(await screen.findByRole('menuitem', { name: 'skill' }))

    await waitFor(() => expect(api.packAddAsset).toHaveBeenCalled())
    expect(api.packAddAsset).toHaveBeenCalledWith('/p', '/src/new.png', 'skill0008.png')
    expect(onStatus).toHaveBeenCalledWith('Added skill0008.png')
    expect(await screen.findByText('skill0008.png')).toBeInTheDocument()
  })

  it('ability_icons spell namespace produces spell0001.png independently of skill numbering', async () => {
    const user = userEvent.setup()
    const pack = makePack({
      content_type: 'ability_icons',
      assets: [
        { filename: 'skill0001.png', sourcePath: '/a' },
        { filename: 'skill0002.png', sourcePath: '/b' }
      ]
    })
    api.openFile.mockResolvedValue('/src/sp.png')
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
    await user.click(await screen.findByRole('menuitem', { name: 'spell' }))

    await waitFor(() => expect(api.packAddAsset).toHaveBeenCalled())
    expect(api.packAddAsset).toHaveBeenCalledWith('/p', '/src/sp.png', 'spell0001.png')
  })

  it('nation_badges has no menu and adds nation0001.png on first click', async () => {
    const user = userEvent.setup()
    api.openFile.mockResolvedValue('/src/n.png')
    api.packAddAsset.mockResolvedValue(undefined)

    render(
      <PackEditor
        pack={makePack({
          content_type: 'nation_badges',
          covers: { nation_badges: {} },
          assets: []
        })}
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

  it('legend_mark_icons starts at legend0000.png (0-based) with a 20×20 PNG', async () => {
    const user = userEvent.setup()
    mockLoadPng.mockResolvedValue({
      data: new Uint8ClampedArray(20 * 20 * 4),
      width: 20,
      height: 20
    })
    api.openFile.mockResolvedValue('/src/l.png')
    api.packAddAsset.mockResolvedValue(undefined)

    render(
      <PackEditor
        pack={makePack({
          content_type: 'legend_mark_icons',
          covers: { legend_mark_icons: {} },
          assets: []
        })}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )
    await user.click(screen.getByRole('button', { name: /add png/i }))

    await waitFor(() => expect(api.packAddAsset).toHaveBeenCalled())
    expect(api.packAddAsset).toHaveBeenCalledWith('/p', '/src/l.png', 'legend0000.png')
  })

  it('item_icons starts at item00001.png (5-digit, 1-based)', async () => {
    const user = userEvent.setup()
    api.openFile.mockResolvedValue('/src/i.png')
    api.packAddAsset.mockResolvedValue(undefined)

    render(
      <PackEditor
        pack={makePack({
          content_type: 'item_icons',
          covers: { item_icons: {} },
          assets: []
        })}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )
    await user.click(screen.getByRole('button', { name: /add png/i }))

    await waitFor(() => expect(api.packAddAsset).toHaveBeenCalled())
    expect(api.packAddAsset).toHaveBeenCalledWith('/p', '/src/i.png', 'item00001.png')
  })

  it('ui_sprite_overrides "New source file…" opens dialog, then adds nested mile.spf/0000.png', async () => {
    const user = userEvent.setup()
    api.openFile.mockResolvedValue('/src/u.png')
    api.packAddAsset.mockResolvedValue(undefined)

    render(
      <PackEditor
        pack={makePack({
          content_type: 'ui_sprite_overrides',
          covers: { ui_sprite_overrides: {} },
          assets: []
        })}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )

    await user.click(screen.getByRole('button', { name: /add png/i }))
    // Only the "New source file…" item should be present (no existing namespaces yet)
    await user.click(await screen.findByRole('menuitem', { name: /new source file/i }))

    // Custom-namespace dialog opens
    const sourceField = await screen.findByLabelText('Source filename')
    await user.type(sourceField, 'mile.spf')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => expect(api.packAddAsset).toHaveBeenCalled())
    expect(api.packAddAsset).toHaveBeenCalledWith('/p', '/src/u.png', 'mile.spf/0000.png')
  })

  it('ui_sprite_overrides menu lists existing source-file namespaces and increments per-namespace', async () => {
    const user = userEvent.setup()
    api.openFile.mockResolvedValue('/src/u.png')
    api.packAddAsset.mockResolvedValue(undefined)

    render(
      <PackEditor
        pack={makePack({
          content_type: 'ui_sprite_overrides',
          covers: { ui_sprite_overrides: {} },
          assets: [
            { filename: 'mile.spf/0000.png', sourcePath: '/a' },
            { filename: 'mile.spf/0001.png', sourcePath: '/b' },
            { filename: 'nation.spf/0000.png', sourcePath: '/c' }
          ]
        })}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )

    await user.click(screen.getByRole('button', { name: /add png/i }))
    // Menu should list mile.spf, nation.spf, and "New source file…"
    expect(await screen.findByRole('menuitem', { name: 'mile.spf' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'nation.spf' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /new source file/i })).toBeInTheDocument()

    await user.click(screen.getByRole('menuitem', { name: 'mile.spf' }))

    await waitFor(() => expect(api.packAddAsset).toHaveBeenCalled())
    expect(api.packAddAsset).toHaveBeenCalledWith('/p', '/src/u.png', 'mile.spf/0002.png')
  })

  it('Add aborts cleanly when the file dialog is cancelled (kind without menu)', async () => {
    const user = userEvent.setup()
    api.openFile.mockResolvedValue(null)
    render(
      <PackEditor
        pack={makePack({
          content_type: 'nation_badges',
          covers: { nation_badges: {} },
          assets: []
        })}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )
    await user.click(screen.getByRole('button', { name: /add png/i }))
    await new Promise((r) => setTimeout(r, 0))
    expect(api.packAddAsset).not.toHaveBeenCalled()
    expect(onStatus).not.toHaveBeenCalled()
  })

  it('Delete row calls packRemoveAsset and removes it from the table', async () => {
    const user = userEvent.setup()
    const pack = makePack({
      assets: [
        { filename: 'skill0001.png', sourcePath: '/a' },
        { filename: 'skill0002.png', sourcePath: '/b' }
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

    const targetRow = screen.getByText('skill0001.png').closest('tr')!
    const deleteBtn = within(targetRow).getByRole('button', { name: /delete skill0001/i })
    await user.click(deleteBtn)

    await waitFor(() => expect(api.packRemoveAsset).toHaveBeenCalledWith('/p', 'skill0001.png'))
    await waitFor(() => expect(screen.queryByText('skill0001.png')).toBeNull())
    expect(screen.getByText('skill0002.png')).toBeInTheDocument()
  })
})

describe('PackEditor — compile flow', () => {
  it('Compile saves first, prompts for output path, then calls packCompile', async () => {
    const user = userEvent.setup()
    const pack = makePack({
      pack_id: 'my-pack',
      priority: 50,
      assets: [{ filename: 'skill0001.png', sourcePath: '/a' }]
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
      ['skill0001.png'],
      '/out/my-pack.datf'
    )
    expect(onStatus).toHaveBeenCalledWith('Compiled my-pack.datf (1 assets)')
  })

  it('Compile aborts when the save dialog is cancelled', async () => {
    const user = userEvent.setup()
    const pack = makePack({
      assets: [{ filename: 'skill0001.png', sourcePath: '/a' }]
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
    const pack = makePack({ assets: [{ filename: 'skill0001.png', sourcePath: '/a' }] })
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

describe('PackEditor — dimension validation', () => {
  it('rejects a 29×29 PNG into an ability_icons pack (expects 32×32)', async () => {
    const user = userEvent.setup()
    mockLoadPng.mockResolvedValue({
      data: new Uint8ClampedArray(29 * 29 * 4),
      width: 29,
      height: 29
    })
    api.openFile.mockResolvedValue('/src/wrong-size.png')

    render(
      <PackEditor
        pack={makePack({ content_type: 'ability_icons' })}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )
    await user.click(screen.getByRole('button', { name: /add png/i }))
    await user.click(await screen.findByRole('menuitem', { name: 'skill' }))

    await waitFor(() =>
      expect(onStatus).toHaveBeenCalledWith(expect.stringMatching(/Rejected.*32×32/))
    )
    expect(api.packAddAsset).not.toHaveBeenCalled()
  })

  it('rejects a 22×20 PNG into a legend_mark_icons pack', async () => {
    const user = userEvent.setup()
    mockLoadPng.mockResolvedValue({
      data: new Uint8ClampedArray(22 * 20 * 4),
      width: 22,
      height: 20
    })
    api.openFile.mockResolvedValue('/src/wrong.png')

    render(
      <PackEditor
        pack={makePack({
          content_type: 'legend_mark_icons',
          covers: { legend_mark_icons: {} }
        })}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )
    await user.click(screen.getByRole('button', { name: /add png/i }))

    await waitFor(() =>
      expect(onStatus).toHaveBeenCalledWith(expect.stringMatching(/Rejected.*width/))
    )
    expect(api.packAddAsset).not.toHaveBeenCalled()
  })

  it('reports decoder failure via onStatus and does not call packAddAsset', async () => {
    const user = userEvent.setup()
    mockLoadPng.mockRejectedValue(new Error('not a PNG'))
    api.openFile.mockResolvedValue('/src/garbage.png')

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
    await user.click(await screen.findByRole('menuitem', { name: 'skill' }))

    await waitFor(() =>
      expect(onStatus).toHaveBeenCalledWith(expect.stringMatching(/Failed to read image/))
    )
    expect(api.packAddAsset).not.toHaveBeenCalled()
  })
})

describe('PackEditor — item_icons dye flow', () => {
  it('toggling No dye on an item_icons asset and saving puts the slot id into covers.item_icons.no_dye', async () => {
    const user = userEvent.setup()
    api.packSave.mockResolvedValue(undefined)
    const pack = makePack({
      content_type: 'item_icons',
      covers: { item_icons: {} },
      assets: [
        { filename: 'item00001.png', sourcePath: '/a' },
        { filename: 'item00002.png', sourcePath: '/b' },
        { filename: 'item00003.png', sourcePath: '/c' }
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

    // Toggle No dye on item 1 and item 3
    const checkbox1 = screen.getByLabelText('No dye for item00001.png') as HTMLInputElement
    const checkbox3 = screen.getByLabelText('No dye for item00003.png') as HTMLInputElement
    await user.click(checkbox1)
    await user.click(checkbox3)

    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(api.packSave).toHaveBeenCalled())
    const savedArg = api.packSave.mock.calls[0][1] as PackProject
    expect(savedArg.covers).toEqual({ item_icons: { no_dye: [1, 3] } })
    expect(savedArg.assetMeta).toEqual({
      'item00001.png': { noDye: true },
      'item00003.png': { noDye: true }
    })
  })

  it('warns about non-canonical near-purple pixels when adding an item_icons PNG', async () => {
    const user = userEvent.setup()
    // Build a 16×16 buffer with a few off-palette purple pixels
    const data = new Uint8ClampedArray(16 * 16 * 4)
    // First 4 pixels are off-palette purple (200, 100, 200) at full alpha
    for (let i = 0; i < 4; i++) {
      data[i * 4] = 200
      data[i * 4 + 1] = 100
      data[i * 4 + 2] = 200
      data[i * 4 + 3] = 255
    }
    mockLoadPng.mockResolvedValue({ data, width: 16, height: 16 })
    api.openFile.mockResolvedValue('/src/i.png')
    api.packAddAsset.mockResolvedValue(undefined)

    render(
      <PackEditor
        pack={makePack({ content_type: 'item_icons', covers: { item_icons: {} } })}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )
    await user.click(screen.getByRole('button', { name: /add png/i }))

    await waitFor(() => expect(api.packAddAsset).toHaveBeenCalled())
    // Asset is still added — the warning is non-blocking — but onStatus
    // includes the heuristic message.
    expect(onStatus).toHaveBeenCalledWith(
      expect.stringMatching(/Added item00001\.png.*near-purple pixels/)
    )
  })

  it('renders the dye palette swatches via the kind Panel', () => {
    render(
      <PackEditor
        pack={makePack({ content_type: 'item_icons', covers: { item_icons: {} } })}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )
    expect(screen.getByText(/Dye palette/i)).toBeInTheDocument()
    expect(screen.getByText('No items flagged no_dye.')).toBeInTheDocument()
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

    rerender(
      <PackEditor
        pack={makePack({ pack_version: '2.0.0', pack_id: 'reloaded' })}
        packDir="/p"
        packFilePath="/p/pack.json"
        onSave={onSave}
        onStatus={onStatus}
      />
    )

    expect(screen.getByDisplayValue('2.0.0')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })
})
