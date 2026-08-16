import React, { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilterField } from '../FilterField'

/**
 * A controlled host, because the clear button is driven by the value.
 *
 * `onKeyDown` sits on the wrapper, so it stands in for the dialog a field is
 * nested in — it fires only for keys FilterField lets bubble. `fieldKeyDown` is
 * the component's own pass-through prop.
 */
function Host({
  initial = '',
  onKeyDown,
  fieldKeyDown
}: {
  initial?: string
  onKeyDown?: () => void
  fieldKeyDown?: React.KeyboardEventHandler<HTMLDivElement>
}) {
  const [value, setValue] = useState(initial)
  return (
    <div onKeyDown={onKeyDown}>
      <FilterField
        value={value}
        onChange={setValue}
        placeholder="Filter…"
        onKeyDown={fieldKeyDown}
      />
    </div>
  )
}

const clearButton = () => screen.queryByRole('button', { name: 'Clear filter' })

describe('FilterField', () => {
  it('shows no clear button while the field is empty', () => {
    render(<Host />)
    expect(clearButton()).toBeNull()
  })

  it('shows the clear button once there is something to clear', async () => {
    render(<Host />)
    await userEvent.type(screen.getByPlaceholderText('Filter…'), 'lod5')
    expect(clearButton()).toBeInTheDocument()
  })

  it('clears the field and gives focus back to it', async () => {
    render(<Host initial="lod5" />)
    const field = screen.getByPlaceholderText('Filter…')
    await userEvent.click(clearButton()!)
    expect(field).toHaveValue('')
    expect(field).toHaveFocus()
    expect(clearButton()).toBeNull()
  })

  it('is not a tab stop, so the tab order does not move as the user types', async () => {
    render(<Host initial="lod5" />)
    expect(clearButton()).toHaveAttribute('tabindex', '-1')
  })

  it('clears on Escape, and stops the key there so a dialog does not also close', async () => {
    const onKeyDown = vi.fn()
    render(<Host initial="lod5" onKeyDown={onKeyDown} />)
    const field = screen.getByPlaceholderText('Filter…')
    field.focus()
    await userEvent.keyboard('{Escape}')
    expect(field).toHaveValue('')
    expect(onKeyDown).not.toHaveBeenCalled()
  })

  it('lets Escape through when the field is empty, so the dialog closes at once', async () => {
    const onKeyDown = vi.fn()
    render(<Host onKeyDown={onKeyDown} />)
    screen.getByPlaceholderText('Filter…').focus()
    await userEvent.keyboard('{Escape}')
    expect(onKeyDown).toHaveBeenCalled()
  })

  it('lets other keys bubble', async () => {
    const onKeyDown = vi.fn()
    render(<Host initial="lod5" onKeyDown={onKeyDown} />)
    screen.getByPlaceholderText('Filter…').focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(onKeyDown).toHaveBeenCalled()
  })

  it('passes other keys to its own onKeyDown, which is how a list is reached', async () => {
    const fieldKeyDown = vi.fn()
    render(<Host initial="lod5" fieldKeyDown={fieldKeyDown} />)
    screen.getByPlaceholderText('Filter…').focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(fieldKeyDown).toHaveBeenCalled()
    // Escape is consumed by the clear, so it never reaches the caller.
    fieldKeyDown.mockClear()
    await userEvent.keyboard('{Escape}')
    expect(fieldKeyDown).not.toHaveBeenCalled()
  })
})
