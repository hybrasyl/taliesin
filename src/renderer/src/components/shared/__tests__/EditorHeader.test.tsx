import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EditorHeader from '../EditorHeader'

/**
 * The filename warning has to describe the save it is warning about.
 *
 * It read "Saving will create X and archive Y" in every case. That stopped
 * being true when the save became a move: the file is renamed in place, one
 * file the whole time, and nothing is archived (HTOO-379). A warning that names
 * the wrong operation is worse than no warning — it sends the author looking
 * for an archived copy that was never made.
 */

function renderHeader(props: Partial<React.ComponentProps<typeof EditorHeader>> = {}) {
  return render(
    <EditorHeader
      title="Mileth Inn"
      fileName="Mileth Inn.xml"
      initialFileName="Mileth Inn.xml"
      computedFileName="Mileth Inn.xml"
      isExisting
      onFileNameChange={vi.fn()}
      onRegenerate={vi.fn()}
      onSave={vi.fn()}
      {...props}
    />
  )
}

describe('EditorHeader — what the save will do', () => {
  it('says nothing when neither the name nor the folder has changed', () => {
    renderHeader()
    expect(screen.queryByText(/^Save /)).toBeNull()
  })

  it('says rename when only the name changed', () => {
    renderHeader({ fileName: 'Mileth Tavern.xml' })
    const text = screen.getByText(/^Save /).textContent ?? ''
    expect(text).toContain('renames')
    expect(text).toContain('Mileth Tavern.xml')
    // The word that was wrong.
    expect(text).not.toContain('archive')
  })

  it('says move when only the folder changed', () => {
    renderHeader({ folder: 'towns', initialFolder: '', folderOptions: ['towns'] })
    const text = screen.getByText(/^Save /).textContent ?? ''
    expect(text).toContain('moves')
    expect(text).toContain('towns')
    expect(text).not.toContain('renames')
    expect(text).not.toContain('archive')
  })

  it('says both when both changed', () => {
    renderHeader({
      fileName: 'Mileth Tavern.xml',
      folder: 'towns',
      initialFolder: 'drafts',
      folderOptions: ['towns', 'drafts']
    })
    const text = screen.getByText(/^Save /).textContent ?? ''
    expect(text).toContain('moves and renames')
    expect(text).toContain('drafts/Mileth Inn.xml')
    expect(text).toContain('towns/Mileth Tavern.xml')
  })

  it('names the top level rather than an empty folder', () => {
    renderHeader({ folder: '', initialFolder: 'drafts', folderOptions: ['drafts'] })
    expect(screen.getByText(/^Save /).textContent).toContain('the top level')
  })

  it('offers the computed name without claiming a new file is made', () => {
    // Applying the computed name renames the file too — it does not save a
    // second copy beside the first.
    renderHeader({ computedFileName: 'Mileth Tavern.xml' })
    const text = screen.getByText(/Computed name/).textContent ?? ''
    expect(text).toContain('renames the file')
    expect(text).not.toContain('new file')
  })

  it('enables Rename only when the name or the folder changed', async () => {
    const onRenameFile = vi.fn()
    const { rerender } = renderHeader({ onRenameFile })
    expect(screen.getByRole('button', { name: 'Rename' })).toBeDisabled()
    rerender(
      <EditorHeader
        title="Mileth Inn"
        fileName="Mileth Tavern.xml"
        initialFileName="Mileth Inn.xml"
        computedFileName="Mileth Inn.xml"
        isExisting
        onFileNameChange={vi.fn()}
        onRegenerate={vi.fn()}
        onSave={vi.fn()}
        onRenameFile={onRenameFile}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))
    expect(onRenameFile).toHaveBeenCalledTimes(1)
  })

  it('has no Rename button when the editor offers no rename', () => {
    renderHeader()
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull()
  })

  it('puts the regenerate button inside the Filename field', () => {
    renderHeader({ computedFileName: 'Mileth Tavern.xml' })
    const field = screen.getByLabelText('Filename').closest('.MuiInputBase-root')
    expect(field?.querySelector('button[aria-label="Apply computed filename"]')).not.toBeNull()
  })

  it('says nothing at all for a file that does not exist yet', () => {
    // No initial filename: there is nothing to rename or move.
    renderHeader({ initialFileName: undefined, fileName: 'New Map.xml', isExisting: false })
    expect(screen.queryByText(/^Save /)).toBeNull()
  })
})
