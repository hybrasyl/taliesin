import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListItem, ListItemButton, ListItemText } from '@mui/material'
import EditorFileListPanel, { type PanelFile } from '../EditorFileListPanel'
import EditorHeader from '../EditorHeader'
import { useEditorAlert } from '../EditorAlerts'
import { resetStores } from '../../../__tests__/setup/storeWrapper'

/**
 * The page shell both world XML editors use (HTOO-633): the toolbar's item
 * actions follow the open file, the sets divide the list, and a notice in the
 * editor column shows under the editor header.
 */

interface Row extends PanelFile {
  display: string
}

const abel: Row = { rel: 'Abel.xml', path: '/w/maps/Abel.xml', display: 'Abel' }
const piet: Row = { rel: 'towns/Piet.xml', path: '/w/maps/towns/Piet.xml', display: 'towns/Piet' }
const old: Row = {
  rel: '.ignore/Old.xml',
  path: '/w/maps/.ignore/Old.xml',
  display: 'Old',
  archived: true
}

function renderPanel(
  props: Partial<React.ComponentProps<typeof EditorFileListPanel<Row>>> = {},
  children: React.ReactNode = null
) {
  const handlers = {
    onNew: vi.fn(),
    onArchive: vi.fn(),
    onUnarchive: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn()
  }
  const view = render(
    <EditorFileListPanel<Row>
      title="Maps"
      entityLabel="map"
      files={[abel, piet]}
      archivedFiles={[old]}
      archivedLabel="Archived"
      selectedFile={null}
      matches={(f, q) => f.display.toLowerCase().includes(q)}
      renderRow={(f) => (
        <ListItem disablePadding>
          <ListItemButton>
            <ListItemText primary={f.display} />
          </ListItemButton>
        </ListItem>
      )}
      emptyMessage="No maps."
      stagingPending
      {...handlers}
      {...props}
    >
      {children}
    </EditorFileListPanel>
  )
  return { ...view, handlers }
}

const toolbar = () => within(screen.getByTestId('page-toolbar'))

beforeEach(() => {
  resetStores()
})

describe('EditorFileListPanel — the item actions follow the open file', () => {
  it('disables every item action while no file is open', () => {
    renderPanel()
    for (const name of ['Archive', 'Stage', 'Duplicate', 'Delete']) {
      expect(toolbar().getByRole('button', { name }), name).toBeDisabled()
    }
    expect(toolbar().getByRole('button', { name: 'New Map' })).toBeEnabled()
  })

  it('archives the open active file', async () => {
    const { handlers } = renderPanel({ selectedFile: abel })
    await userEvent.click(toolbar().getByRole('button', { name: 'Archive' }))
    expect(handlers.onArchive).toHaveBeenCalledWith(abel)
  })

  it('turns Archive into Unarchive for an archived file', async () => {
    const { handlers } = renderPanel({ selectedFile: old })
    expect(toolbar().queryByRole('button', { name: 'Archive' })).toBeNull()
    await userEvent.click(toolbar().getByRole('button', { name: 'Unarchive' }))
    expect(handlers.onUnarchive).toHaveBeenCalledWith(old)
  })

  it('keeps Stage disabled while staging is pending', () => {
    renderPanel({ selectedFile: abel })
    expect(toolbar().getByRole('button', { name: 'Stage' })).toBeDisabled()
  })

  it('disables an action the page says does not apply', () => {
    renderPanel({ selectedFile: abel, disabledActions: { delete: 'Not here' } })
    expect(toolbar().getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(toolbar().getByRole('button', { name: 'Duplicate' })).toBeEnabled()
  })

  it('deletes only after the confirmation', async () => {
    const { handlers } = renderPanel({ selectedFile: abel })
    await userEvent.click(toolbar().getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('Abel.xml')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(handlers.onDelete).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await userEvent.click(toolbar().getByRole('button', { name: 'Delete' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' })
    )
    expect(handlers.onDelete).toHaveBeenCalledWith(abel)
  })
})

describe('EditorFileListPanel — the sets', () => {
  it('shows Active alone by default, with a header', () => {
    renderPanel()
    expect(screen.getByTestId('list-section-active')).toBeInTheDocument()
    expect(screen.queryByTestId('list-section-archived')).toBeNull()
    expect(screen.getByText('Abel')).toBeInTheDocument()
    expect(screen.queryByText('Old')).toBeNull()
  })

  it('adds the archived set from its toggle, and keeps one set on', async () => {
    renderPanel()
    await userEvent.click(toolbar().getByRole('button', { name: 'Archived (1)' }))
    expect(screen.getByTestId('list-section-archived')).toBeInTheDocument()
    expect(screen.getByText('Old')).toBeInTheDocument()

    // Active off, then Archived off: the last set stays on.
    await userEvent.click(toolbar().getByRole('button', { name: 'Active (2)' }))
    await userEvent.click(toolbar().getByRole('button', { name: 'Archived (1)' }))
    expect(screen.getByTestId('list-section-archived')).toBeInTheDocument()
  })

  it('collapses a set from its header', async () => {
    renderPanel()
    await userEvent.click(screen.getByTestId('list-section-active'))
    expect(screen.queryByText('Abel')).toBeNull()
    expect(screen.getByTestId('list-section-active')).toHaveAttribute('aria-expanded', 'false')
  })
})

function Notice(): React.ReactElement {
  useEditorAlert('n', { severity: 'warning', message: 'Two warps share a tile.' })
  return (
    <EditorHeader
      title="Abel"
      fileName="Abel.xml"
      onFileNameChange={vi.fn()}
      onRegenerate={vi.fn()}
      onSave={vi.fn()}
    />
  )
}

describe('EditorFileListPanel — the alerts area', () => {
  it('shows a notice from the editor column under the header', () => {
    renderPanel({}, <Notice />)
    const area = screen.getByTestId('editor-alerts')
    expect(area.textContent).toContain('Alerts (1)')
    expect(area.textContent).toContain('Two warps share a tile.')
  })
})
