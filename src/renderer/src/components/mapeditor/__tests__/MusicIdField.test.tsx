import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MusicIdField } from '../MapEditorPanel'
import { installMockApi, type MockApi } from '../../../__tests__/setup/mockApi'

let api: MockApi

beforeEach(() => {
  api = installMockApi()
  vi.clearAllMocks()
  // Default: client has no deployed music tracks.
  api.musicClientScan.mockResolvedValue([])
})

function renderField(opts: { value?: number; clientPath?: string | null } = {}) {
  const onChange = vi.fn<(v: number | undefined) => void>()
  const utils = render(
    <MusicIdField
      value={opts.value}
      onChange={onChange}
      clientPath={opts.clientPath ?? null}
    />,
  )
  return { onChange, ...utils }
}

describe('MusicIdField — input + clear', () => {
  it('renders empty when value is undefined', () => {
    renderField({ value: undefined })
    expect(screen.getByLabelText('Music Id')).toHaveValue(null)
  })

  it('renders the numeric value when set', () => {
    renderField({ value: 42 })
    expect(screen.getByLabelText('Music Id')).toHaveValue(42)
  })

  it('typing a valid number calls onChange with that number', async () => {
    const user = userEvent.setup()
    const { onChange } = renderField({ value: undefined })
    const input = screen.getByLabelText('Music Id')
    await user.type(input, '5')
    expect(onChange).toHaveBeenCalledWith(5)
  })

  it('clamps values above 256 down to 256', async () => {
    const user = userEvent.setup()
    const { onChange } = renderField({ value: undefined })
    await user.type(screen.getByLabelText('Music Id'), '300')
    // Last call wins; the final clamped value should be 256.
    expect(onChange).toHaveBeenLastCalledWith(256)
  })

  it('clamps values below 1 up to 1', async () => {
    const user = userEvent.setup()
    const { onChange } = renderField({ value: undefined })
    await user.type(screen.getByLabelText('Music Id'), '0')
    expect(onChange).toHaveBeenLastCalledWith(1)
  })

  it('clearing the input calls onChange(undefined)', async () => {
    const user = userEvent.setup()
    const { onChange } = renderField({ value: 42 })
    const input = screen.getByLabelText('Music Id')
    await user.clear(input)
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('clear button calls onChange(undefined) and is disabled when value is unset', async () => {
    const user = userEvent.setup()
    const { onChange, rerender } = renderField({ value: 7 })
    const findClearBtn = () => {
      const buttons = screen.getAllByRole('button')
      const btn = buttons.find(b => b.querySelector('[data-testid="ClearIcon"]'))
      if (!btn) throw new Error('Clear button not found')
      return btn
    }
    expect(findClearBtn()).not.toBeDisabled()
    await user.click(findClearBtn())
    expect(onChange).toHaveBeenCalledWith(undefined)

    rerender(<MusicIdField value={undefined} onChange={onChange} clientPath={null} />)
    expect(findClearBtn()).toBeDisabled()
  })
})

describe('MusicIdField — play button gating', () => {
  it('disables Play when clientPath is null', () => {
    renderField({ value: 5, clientPath: null })
    // Look up by tooltip text — both <span> wrapper and IconButton render. The
    // IconButton inside is disabled, so checking aria-disabled is sufficient.
    const buttons = screen.getAllByRole('button')
    const playBtn = buttons.find(b => b.querySelector('[data-testid="PlayArrowIcon"]'))
    expect(playBtn).toBeDefined()
    expect(playBtn).toBeDisabled()
  })

  it('disables Play when value is undefined', () => {
    renderField({ value: undefined, clientPath: '/dark-ages' })
    const buttons = screen.getAllByRole('button')
    const playBtn = buttons.find(b => b.querySelector('[data-testid="PlayArrowIcon"]'))
    expect(playBtn).toBeDisabled()
  })

  it('disables Play when {id}.mus is not deployed in the client', async () => {
    api.musicClientScan.mockResolvedValue([{ filename: '1.mus', sizeBytes: 100 }])
    renderField({ value: 99, clientPath: '/dark-ages' })

    await waitFor(() => expect(api.musicClientScan).toHaveBeenCalledWith('/dark-ages'))
    const buttons = screen.getAllByRole('button')
    const playBtn = buttons.find(b => b.querySelector('[data-testid="PlayArrowIcon"]'))
    expect(playBtn).toBeDisabled()
  })

  it('enables Play when {id}.mus exists for the chosen value', async () => {
    api.musicClientScan.mockResolvedValue([
      { filename: '1.mus', sizeBytes: 100 },
      { filename: '5.mus', sizeBytes: 200 },
    ])
    renderField({ value: 5, clientPath: '/dark-ages' })

    await waitFor(() => {
      const buttons = screen.getAllByRole('button')
      const playBtn = buttons.find(b => b.querySelector('[data-testid="PlayArrowIcon"]'))
      expect(playBtn).not.toBeDisabled()
    })
  })
})
