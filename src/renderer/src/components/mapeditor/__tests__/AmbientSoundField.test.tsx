import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import AmbientSoundField, { parseAmbientInput } from '../AmbientSoundField'
import { installMockApi, type MockApi } from '../../../__tests__/setup/mockApi'

/** The map's ambient sound field and its picker (HXML-14, HTOO-624). */

let api: MockApi

beforeEach(() => {
  api = installMockApi()
  vi.clearAllMocks()
  api.packReload.mockResolvedValue(undefined)
  api.packListCoveredIds.mockResolvedValue([])
  api.packResolveAsset.mockResolvedValue(null)
})

function renderField(value?: number) {
  const onChange = vi.fn<(v: number | undefined) => void>()
  const utils = render(<AmbientSoundField value={value} onChange={onChange} />)
  return { onChange, ...utils }
}

const buttonWithIcon = (testId: string): HTMLElement => {
  const btn = screen
    .getAllByRole('button')
    .find((b) => b.querySelector(`[data-testid="${testId}"]`))
  if (!btn) throw new Error(`no button with ${testId}`)
  return btn
}

describe('parseAmbientInput', () => {
  it('reads 1..255, clamps above, and reads empty and 0 as no ambient sound', () => {
    expect(parseAmbientInput('7')).toBe(7)
    expect(parseAmbientInput('255')).toBe(255)
    expect(parseAmbientInput('300')).toBe(255)
    expect(parseAmbientInput('0')).toBeUndefined()
    expect(parseAmbientInput('')).toBeUndefined()
    expect(parseAmbientInput('  ')).toBeUndefined()
  })

  it('ignores text that is not a whole number', () => {
    expect(parseAmbientInput('2.5')).toBeNull()
    expect(parseAmbientInput('x')).toBeNull()
  })
})

describe('AmbientSoundField', () => {
  it('shows the value, and None when there is none', () => {
    const { unmount } = renderField(12)
    expect(screen.getByLabelText('Ambient Sound')).toHaveValue(12)
    unmount()
    renderField(undefined)
    expect(screen.getByLabelText('Ambient Sound')).toHaveValue(null)
  })

  it('typing an id calls onChange; 0 means no ambient sound', async () => {
    const user = userEvent.setup()
    const { onChange } = renderField(undefined)
    await user.type(screen.getByLabelText('Ambient Sound'), '9')
    expect(onChange).toHaveBeenLastCalledWith(9)
    await user.clear(screen.getByLabelText('Ambient Sound'))
    await user.type(screen.getByLabelText('Ambient Sound'), '0')
    expect(onChange).toHaveBeenLastCalledWith(undefined)
  })

  it('clear sets no ambient sound', async () => {
    const user = userEvent.setup()
    const { onChange } = renderField(5)
    await user.click(buttonWithIcon('ClearIcon'))
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('previews only an id that an installed pack covers', async () => {
    api.packListCoveredIds.mockResolvedValue([5])
    const { unmount } = renderField(5)
    await waitFor(() => expect(buttonWithIcon('PlayArrowIcon')).not.toBeDisabled())
    expect(api.packListCoveredIds).toHaveBeenCalledWith('ambient')
    unmount()
    renderField(6)
    await waitFor(() => expect(api.packListCoveredIds).toHaveBeenCalledTimes(2))
    expect(buttonWithIcon('PlayArrowIcon')).toBeDisabled()
  })

  it('the picker lists the installed ambient ids, and a pick sets the value', async () => {
    const user = userEvent.setup()
    api.packListCoveredIds.mockResolvedValue([3, 1])
    const { onChange } = renderField(undefined)
    await user.click(buttonWithIcon('GraphicEqIcon'))
    expect(await screen.findByText('amb_1')).toBeInTheDocument()
    expect(screen.getByText('amb_3')).toBeInTheDocument()
    await user.click(screen.getByText('amb_3'))
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('the picker says to type the id when no pack covers one', async () => {
    const user = userEvent.setup()
    renderField(undefined)
    await user.click(buttonWithIcon('GraphicEqIcon'))
    expect(await screen.findByText(/No installed ambient_sounds pack/)).toBeInTheDocument()
  })
})
