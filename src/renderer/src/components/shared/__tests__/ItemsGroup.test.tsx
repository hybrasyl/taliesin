import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ItemsGroup, type ItemRow } from '../ItemsGroup'

function row(overrides: Partial<ItemRow> = {}): ItemRow {
  return {
    key: 0,
    label: 'row-0',
    selected: false,
    onSelect: vi.fn(),
    onEdit: vi.fn(),
    onRemove: vi.fn(),
    ...overrides
  }
}

describe('ItemsGroup', () => {
  it('renders header label, count and the "None placed" empty state', () => {
    render(<ItemsGroup label="NPCs" color="#4caf50" count={0} items={[]} onAdd={vi.fn()} />)
    expect(screen.getByText('NPCs')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('None placed')).toBeInTheDocument()
  })

  it('renders one row per item with its label', () => {
    render(
      <ItemsGroup
        label="NPCs"
        color="#4caf50"
        count={2}
        items={[row({ key: 0, label: 'a' }), row({ key: 1, label: 'b' })]}
        onAdd={vi.fn()}
      />
    )
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('b')).toBeInTheDocument()
  })

  it('shows the Add button and fires onAdd without toggling collapse', async () => {
    const onAdd = vi.fn()
    render(<ItemsGroup label="Signs" color="#ffc107" count={0} items={[]} onAdd={onAdd} />)
    await userEvent.click(screen.getByRole('button', { name: 'Place Sign' }))
    expect(onAdd).toHaveBeenCalledOnce()
    // Add click stops propagation, so the list stays expanded.
    expect(screen.getByText('None placed')).toBeInTheDocument()
  })

  it('hides the Add button when addDisabled', () => {
    render(
      <ItemsGroup label="Points" color="#2196f3" count={0} items={[]} onAdd={vi.fn()} addDisabled />
    )
    expect(screen.queryByRole('button', { name: 'Place Point' })).not.toBeInTheDocument()
  })

  it('toggles the expand/collapse chevron when the header is clicked', async () => {
    render(
      <ItemsGroup
        label="NPCs"
        color="#4caf50"
        count={1}
        items={[row({ label: 'visible' })]}
        onAdd={vi.fn()}
      />
    )
    // Starts expanded → "less" chevron. (MUI Collapse height animation isn't
    // observable in jsdom, so assert on the header state indicator instead.)
    expect(screen.getByTestId('ExpandLessIcon')).toBeInTheDocument()
    expect(screen.queryByTestId('ExpandMoreIcon')).not.toBeInTheDocument()
    await userEvent.click(screen.getByText('NPCs'))
    expect(screen.getByTestId('ExpandMoreIcon')).toBeInTheDocument()
    expect(screen.queryByTestId('ExpandLessIcon')).not.toBeInTheDocument()
  })

  it('fires row onSelect / onEdit / onRemove', async () => {
    const onSelect = vi.fn()
    const onEdit = vi.fn()
    const onRemove = vi.fn()
    render(
      <ItemsGroup
        label="NPCs"
        color="#4caf50"
        count={1}
        items={[row({ label: 'target', onSelect, onEdit, onRemove })]}
        onAdd={vi.fn()}
      />
    )
    await userEvent.click(screen.getByText('target'))
    expect(onSelect).toHaveBeenCalledOnce()

    const listItem = screen.getByText('target').closest('li')!
    const buttons = within(listItem).getAllByRole('button')
    // secondaryAction buttons: [edit, remove]
    await userEvent.click(buttons[buttons.length - 2])
    expect(onEdit).toHaveBeenCalledOnce()
    await userEvent.click(buttons[buttons.length - 1])
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('omits the edit button when a row has no onEdit', () => {
    render(
      <ItemsGroup
        label="Points"
        color="#2196f3"
        count={1}
        items={[row({ label: 'derived', onEdit: undefined })]}
        onAdd={vi.fn()}
      />
    )
    const listItem = screen.getByText('derived').closest('li')!
    // Row buttons = [ListItemButton, remove]; no edit button.
    const buttons = within(listItem).getAllByRole('button')
    expect(buttons).toHaveLength(2)
    expect(within(listItem).queryByTestId('EditIcon')).not.toBeInTheDocument()
  })

  it('flags orphan rows with a warning icon', () => {
    render(
      <ItemsGroup
        label="Points"
        color="#2196f3"
        count={1}
        items={[row({ label: 'orphan', isOrphan: true })]}
        onAdd={vi.fn()}
      />
    )
    const listItem = screen.getByText('orphan').closest('li')!
    expect(within(listItem).getByTestId('WarningAmberIcon')).toBeInTheDocument()
  })
})
