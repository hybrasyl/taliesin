// house module: editor-shell v1 — change it in the template, then port
import React, { useRef } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListItemButton } from '@mui/material'
import EditorPageShell, {
  type EditorPageShellHandle,
  type EditorPageShellProps
} from '../EditorPageShell'
import { useEditorAlert } from '../EditorAlerts'
import EditorHeader from '../EditorHeader'

interface Row {
  path: string
  rel: string
  archived?: boolean
  staged?: boolean
}

const abel: Row = { path: '/w/maps/Abel.xml', rel: 'Abel.xml' }
const piet: Row = { path: '/w/maps/Piet.xml', rel: 'Piet.xml' }
const old: Row = { path: '/w/maps/.ignore/Old.xml', rel: '.ignore/Old.xml', archived: true }
const draft: Row = { path: '/w/.staging/maps/Draft.xml', rel: 'Draft.xml', staged: true }

function renderShell(props: Partial<EditorPageShellProps<Row>> = {}, children?: React.ReactNode) {
  const handlers = {
    onNew: vi.fn(),
    onFolderModeChange: vi.fn(),
    onShownSetsChange: vi.fn(),
    onArchive: vi.fn(),
    onUnarchive: vi.fn(),
    onStage: vi.fn(),
    onRelease: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onActionDone: vi.fn()
  }
  function Page(): React.JSX.Element {
    const shell = useRef<EditorPageShellHandle>(null)
    return (
      <EditorPageShell<Row>
        ref={shell}
        title="Maps"
        entityLabel="map"
        folderMode={false}
        sets={[
          { key: 'staged', label: 'Staged', count: 1 },
          { key: 'archived', label: 'Archived', count: 1 },
          { key: 'active', label: 'Active', count: 2 }
        ]}
        shownSets={['active']}
        selection={[]}
        describeFile={(f) => f.rel}
        list={
          <ListItemButton
            data-testid="row"
            onContextMenu={(e) => shell.current?.openContextMenu(e)}
          >
            Abel
          </ListItemButton>
        }
        {...handlers}
        {...props}
      >
        {children}
      </EditorPageShell>
    )
  }
  render(<Page />)
  return handlers
}

const toolbar = () => within(screen.getByTestId('page-toolbar'))
const button = (name: string) => toolbar().getByRole('button', { name })
/** The tooltip of a toolbar button, which the wrapping span carries. */
const tooltipOf = (name: string) => button(name).parentElement?.getAttribute('aria-label')

describe('EditorPageShell — the toolbar', () => {
  it('names the toolbar for the page, and New for the entity', async () => {
    const h = renderShell()
    expect(screen.getByRole('toolbar', { name: 'Maps toolbar' })).toBeInTheDocument()
    await userEvent.click(button('New Map'))
    expect(h.onNew).toHaveBeenCalled()
  })

  it('disables every item action with no selection, and says what to do', () => {
    renderShell()
    for (const name of ['Archive', 'Stage', 'Duplicate', 'Delete']) {
      expect(button(name), name).toBeDisabled()
    }
    expect(tooltipOf('Archive')).toBe('Select a map to archive it')
  })

  it('acts on the selection, and reports when it is done', async () => {
    const h = renderShell({ selection: [abel] })
    expect(tooltipOf('Archive')).toBe('Archive "Abel.xml"')
    await userEvent.click(button('Archive'))
    expect(h.onArchive).toHaveBeenCalledWith([abel])
    await userEvent.click(button('Stage'))
    expect(h.onStage).toHaveBeenCalledWith([abel])
    await userEvent.click(button('Duplicate'))
    expect(h.onDuplicate).toHaveBeenCalledWith(abel)
    expect(h.onActionDone).toHaveBeenCalledTimes(3)
  })

  it('turns Archive into Unarchive, and Stage into Release, with the reasons', async () => {
    const h = renderShell({ selection: [old] })
    expect(button('Stage')).toBeDisabled()
    expect(tooltipOf('Stage')).toBe('Unarchive this map before you stage it')
    await userEvent.click(button('Unarchive'))
    expect(h.onUnarchive).toHaveBeenCalledWith([old])
  })

  it('releases a staged file, and does not archive it', async () => {
    const h = renderShell({ selection: [draft] })
    expect(button('Archive')).toBeDisabled()
    expect(tooltipOf('Archive')).toBe('Release this map before you archive it')
    await userEvent.click(button('Release'))
    expect(h.onRelease).toHaveBeenCalledWith([draft])
  })

  it('counts a selection of more than one, and duplicates only one', () => {
    renderShell({ selection: [abel, piet] })
    expect(tooltipOf('Archive')).toBe('Archive 2 files')
    expect(button('Duplicate')).toBeDisabled()
    expect(tooltipOf('Duplicate')).toBe('Duplicate takes one file')
  })

  it('takes a reason from the page for an action that does not apply', () => {
    renderShell({ selection: [abel], disabledActions: { delete: 'A reference set stays' } })
    expect(button('Delete')).toBeDisabled()
    expect(tooltipOf('Delete')).toBe('A reference set stays')
  })

  it('has no Stage without both staging handlers, and no Archive without either', () => {
    renderShell({ onRelease: undefined, onArchive: undefined, onUnarchive: undefined })
    expect(toolbar().queryByRole('button', { name: 'Stage' })).toBeNull()
    expect(toolbar().queryByRole('button', { name: 'Archive' })).toBeNull()
  })

  it('keeps one set on', async () => {
    const h = renderShell()
    await userEvent.click(button('Active (2)'))
    expect(h.onShownSetsChange).not.toHaveBeenCalled()
    await userEvent.click(button('Staged (1)'))
    expect(h.onShownSetsChange).toHaveBeenCalledWith(['active', 'staged'])
  })

  it('shows no set toggles for a page with one set', () => {
    renderShell({ sets: [{ key: 'active', label: 'Active', count: 2 }] })
    expect(toolbar().queryByRole('group', { name: 'Sets to show' })).toBeNull()
  })

  it('switches the view, and disables expand-all while a filter is on', async () => {
    const onToggle = vi.fn()
    const h = renderShell({
      folderMode: true,
      expandAll: { allExpanded: false, filtering: true, onToggle }
    })
    expect(button('Expand all folders')).toBeDisabled()
    await userEvent.click(button('Switch to flat list'))
    expect(h.onFolderModeChange).toHaveBeenCalledWith(false)
  })

  it('opens a New menu when the page gives one', async () => {
    const pick = vi.fn()
    const h = renderShell({ newMenuItems: [{ label: 'From a template', onClick: pick }] })
    await userEvent.click(button('New Map'))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'From a template' }))
    expect(pick).toHaveBeenCalled()
    expect(h.onNew).not.toHaveBeenCalled()
  })

  it('puts the page extra actions before New', async () => {
    const back = vi.fn()
    renderShell({ extraActions: [{ icon: <span />, tooltip: 'Back', onClick: back }] })
    const names = toolbar()
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'))
    expect(names.indexOf('Back')).toBeLessThan(names.indexOf('New Map'))
    await userEvent.click(button('Back'))
    expect(back).toHaveBeenCalled()
  })
})

describe('EditorPageShell — delete and the context menu', () => {
  it('deletes only after the confirmation', async () => {
    const h = renderShell({ selection: [abel] })
    await userEvent.click(button('Delete'))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Delete this map?')
    expect(dialog).toHaveTextContent('"Abel.xml" moves to your system trash')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(h.onDelete).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await userEvent.click(button('Delete'))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' })
    )
    expect(h.onDelete).toHaveBeenCalledWith([abel])
    expect(h.onActionDone).toHaveBeenCalled()
  })

  it('lists the files of a delete of more than one', async () => {
    renderShell({ selection: [abel, piet] })
    await userEvent.click(button('Delete'))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Delete 2 files?')
    expect(within(dialog).getByText('Piet.xml')).toBeInTheDocument()
  })

  it('opens the context menu from the list, with the same actions', async () => {
    const h = renderShell({ selection: [abel, piet] })
    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByTestId('row') })
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: /Duplicate/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Archive (2)' }))
    expect(h.onArchive).toHaveBeenCalledWith([abel, piet])
  })
})

describe('EditorPageShell — the alerts area', () => {
  function Notice(): React.JSX.Element {
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

  it('shows a notice from the editor column under the header', () => {
    renderShell({}, <Notice />)
    const area = screen.getByTestId('editor-alerts')
    expect(area).toHaveTextContent('Alerts (1)')
    expect(area).toHaveTextContent('Two warps share a tile.')
  })
})
