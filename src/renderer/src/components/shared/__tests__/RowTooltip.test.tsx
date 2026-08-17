import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RowTooltip } from '../RowTooltip'

/** The tooltip waits before showing, so hovering is not enough on its own. */
async function hover(label: string): Promise<void> {
  const user = userEvent.setup()
  await user.hover(screen.getByRole('button', { name: label }))
}

describe('RowTooltip', () => {
  it('shows every line it was given, whole', async () => {
    render(
      <RowTooltip
        details={[
          { label: 'File', value: 'towns/mileth/Mileth Inn.xml' },
          { label: 'Name', value: 'Mileth Inn' },
          { label: 'Map', value: 'lod500' }
        ]}
      >
        <button type="button">Mileth Inn</button>
      </RowTooltip>
    )
    await hover('Mileth Inn')
    await waitFor(() => expect(screen.getByText('towns/mileth/Mileth Inn.xml')).toBeTruthy())
    expect(screen.getByText('lod500')).toBeTruthy()
    // The row truncates the path; the tooltip is the thing that does not.
    expect(screen.getByText('File')).toBeTruthy()
    expect(screen.getByText('Map')).toBeTruthy()
  })

  it('leaves out a line with no value rather than showing it empty', async () => {
    render(
      <RowTooltip
        details={[
          { label: 'File', value: 'Draft.xml' },
          { label: 'Name', value: undefined },
          { label: 'Map', value: null },
          { label: 'Field', value: '' }
        ]}
      >
        <button type="button">Draft</button>
      </RowTooltip>
    )
    await hover('Draft')
    await waitFor(() => expect(screen.getByText('Draft.xml')).toBeTruthy())
    expect(screen.queryByText('Name')).toBeNull()
    expect(screen.queryByText('Map')).toBeNull()
    expect(screen.queryByText('Field')).toBeNull()
  })

  it('keeps a zero, which is a map number and not an absent one', async () => {
    render(
      <RowTooltip details={[{ label: 'Map', value: 0 }]}>
        <button type="button">Zero</button>
      </RowTooltip>
    )
    await hover('Zero')
    await waitFor(() => expect(screen.getByText('Map')).toBeTruthy())
  })

  it('renders the row alone when there is nothing to report', () => {
    const { container } = render(
      <RowTooltip details={[{ label: 'Name', value: undefined }]}>
        <button type="button">Bare</button>
      </RowTooltip>
    )
    // No wrapper, no aria-describedby — the row is returned untouched.
    expect(screen.getByRole('button', { name: 'Bare' })).toBeTruthy()
    expect(container.querySelector('[aria-describedby]')).toBeNull()
  })

  it('does not cover the row it describes', async () => {
    // An interactive tooltip over a list row swallows the click meant for the
    // row beneath it, so the row must still be clickable while it is showing.
    const user = userEvent.setup()
    let clicks = 0
    render(
      <RowTooltip details={[{ label: 'File', value: 'Abel.xml' }]}>
        <button type="button" onClick={() => clicks++}>
          Abel
        </button>
      </RowTooltip>
    )
    const row = screen.getByRole('button', { name: 'Abel' })
    await user.hover(row)
    await user.click(row)
    expect(clicks).toBe(1)
  })
})
