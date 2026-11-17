import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installMockApi, type MockApi } from '../../../__tests__/setup/mockApi'

// The index is the input under test, so the hook is replaced by a plain value.
const indexState: { index: { mapDetails: { name: string; music?: number }[] } | null } = {
  index: null
}
vi.mock('../../../hooks/useWorldIndex', () => ({
  useWorldIndex: () => indexState
}))

import ClientMusicView from '../ClientMusicView'

let api: MockApi

async function scan(): Promise<void> {
  render(
    <ClientMusicView clientPath="C:/DA" playingFile={null} isPlaying={false} onPlay={vi.fn()} />
  )
  await userEvent.click(screen.getByRole('button', { name: /scan client music folder/i }))
  await screen.findByText(/tracks in/)
}

function rowFor(file: string): HTMLElement {
  return screen.getByText(file).closest('tr') as HTMLElement
}

beforeEach(() => {
  api = installMockApi()
  api.musicClientScan.mockResolvedValue([
    { filename: '0.mus', sizeBytes: 10 },
    { filename: '3.mus', sizeBytes: 10 },
    { filename: '9.mus', sizeBytes: 10 }
  ])
  indexState.index = null
})

describe('ClientMusicView Maps column (HTOO-358)', () => {
  it('lists the maps that play each track, and says None for a track no map plays', async () => {
    indexState.index = {
      mapDetails: [
        { name: 'Mileth', music: 3 },
        { name: 'Abel', music: 3 },
        { name: 'Silent Hall', music: 0 },
        { name: 'Unset' }
      ]
    }
    await scan()
    expect(screen.getByRole('columnheader', { name: 'Maps' })).toBeInTheDocument()
    const row3 = within(rowFor('3.mus'))
    expect(row3.getByText('Abel')).toBeInTheDocument()
    expect(row3.getByText('Mileth')).toBeInTheDocument()
    // 0 is a music id: the map that sets Music="0" shows on track 0.
    expect(within(rowFor('0.mus')).getByText('Silent Hall')).toBeInTheDocument()
    // A map without Music is not filed under 0.
    expect(screen.queryByText('Unset')).not.toBeInTheDocument()
    expect(within(rowFor('9.mus')).getByText('None')).toBeInTheDocument()
  })

  it('shows four maps and puts the rest in a +N chip', async () => {
    indexState.index = {
      mapDetails: ['A', 'B', 'C', 'D', 'E', 'F'].map((name) => ({ name, music: 3 }))
    }
    await scan()
    const row = within(rowFor('3.mus'))
    expect(row.getByText('D')).toBeInTheDocument()
    expect(row.queryByText('E')).not.toBeInTheDocument()
    expect(row.getByText('+2')).toBeInTheDocument()
  })

  it('hides the column when the index has no music data', async () => {
    indexState.index = { mapDetails: [{ name: 'Mileth' }, { name: 'Abel' }] }
    await scan()
    expect(screen.queryByRole('columnheader', { name: 'Maps' })).not.toBeInTheDocument()
    expect(screen.queryByText('None')).not.toBeInTheDocument()
  })

  it('hides the column when there is no index', async () => {
    await scan()
    expect(screen.queryByRole('columnheader', { name: 'Maps' })).not.toBeInTheDocument()
  })
})
