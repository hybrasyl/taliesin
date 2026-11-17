import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SotpFile } from '@eriscorp/dalib-ts'
import { installMockApi, type MockApi } from '../../../__tests__/setup/mockApi'

/** Seed the world TileCollisions table from sotp.dat (HTOO-611). */

// When set, the writer emits this text instead of the real table, so a test can
// give the validation step a faulty output.
const writerOverride: { xml: string | null } = { xml: null }

vi.mock('../../../utils/tileCollisions', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/tileCollisions')>()
  return {
    ...real,
    serializeTileCollisionsXml: (...args: Parameters<typeof real.serializeTileCollisionsXml>) =>
      writerOverride.xml ?? real.serializeTileCollisionsXml(...args)
  }
})

import TileCollisionsSeedButton, { suggestedTileCollisionsPath } from '../TileCollisionsSeedButton'

let api: MockApi

beforeEach(() => {
  api = installMockApi()
  vi.clearAllMocks()
  writerOverride.xml = null
  api.writeFile.mockResolvedValue(undefined)
})

// tile 1-3 blocked (one with the blend bit), tile 4 open, tile 5 up only.
const sotp = new SotpFile(Uint8Array.from([0x0f, 0x8f, 0x0f, 0x80, 0x08]))

function renderButton(s: SotpFile | null = sotp, activeLibrary: string | null = 'C:\\world\\xml') {
  const onStatus = vi.fn<(m: string) => void>()
  render(<TileCollisionsSeedButton sotp={s} activeLibrary={activeLibrary} onStatus={onStatus} />)
  return { onStatus, button: screen.getByRole('button', { name: /Seed TileCollisions/ }) }
}

describe('suggestedTileCollisionsPath', () => {
  it('opens in the world xml folder, with its separator', () => {
    expect(suggestedTileCollisionsPath('C:\\world\\xml\\')).toBe(
      'C:\\world\\xml\\tilecollisions\\tile_collisions.xml'
    )
    expect(suggestedTileCollisionsPath('/w/xml')).toBe('/w/xml/tilecollisions/tile_collisions.xml')
    expect(suggestedTileCollisionsPath(null)).toBe('tile_collisions.xml')
  })
})

describe('TileCollisionsSeedButton', () => {
  it('is off when no sotp.dat is loaded', () => {
    expect(renderButton(null).button).toBeDisabled()
  })

  it('writes the table where the author picks', async () => {
    api.saveFile.mockResolvedValue('C:\\world\\xml\\tilecollisions\\tile_collisions.xml')
    const { button, onStatus } = renderButton()
    await userEvent.click(button)
    await waitFor(() => expect(api.writeFile).toHaveBeenCalledTimes(1))
    expect(api.saveFile.mock.calls[0]![1]).toBe(
      'C:\\world\\xml\\tilecollisions\\tile_collisions.xml'
    )
    const [path, xml] = api.writeFile.mock.calls[0]!
    expect(path).toBe('C:\\world\\xml\\tilecollisions\\tile_collisions.xml')
    expect(xml).toContain('<Range Start="1" End="3" Block="All" />')
    expect(xml).toContain('<Tile Id="5" Block="Up" />')
    expect(xml).not.toContain('Id="4"')
    expect(onStatus).toHaveBeenCalledWith('Wrote TileCollisions: 1 ranges and 1 tiles')
  })

  it('writes nothing when the save dialog is cancelled', async () => {
    api.saveFile.mockResolvedValue(null)
    const { button } = renderButton()
    await userEvent.click(button)
    await waitFor(() => expect(api.saveFile).toHaveBeenCalled())
    expect(api.writeFile).not.toHaveBeenCalled()
  })

  it('writes nothing when the output is not valid', async () => {
    writerOverride.xml = `<TileCollisions>
      <Range Start="1" End="10" Block="All" />
      <Range Start="5" End="6" Block="Up" />
    </TileCollisions>`
    api.saveFile.mockResolvedValue('C:\\out.xml')
    const { button, onStatus } = renderButton()
    await userEvent.click(button)
    await waitFor(() => expect(onStatus).toHaveBeenCalled())
    expect(onStatus.mock.calls[0]![0]).toMatch(/not written: .*not valid/)
    expect(api.saveFile).not.toHaveBeenCalled()
    expect(api.writeFile).not.toHaveBeenCalled()
  })
})
