import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
    expect(screen.queryByText(/Saving will/)).toBeNull()
  })

  it('says rename when only the name changed', () => {
    renderHeader({ fileName: 'Mileth Tavern.xml' })
    const text = screen.getByText(/Saving will/).textContent ?? ''
    expect(text).toContain('rename')
    expect(text).toContain('Mileth Tavern.xml')
    // The word that was wrong.
    expect(text).not.toContain('archive')
  })

  it('says move when only the folder changed', () => {
    renderHeader({ folder: 'towns', initialFolder: '', folderOptions: ['towns'] })
    const text = screen.getByText(/Saving will/).textContent ?? ''
    expect(text).toContain('move')
    expect(text).toContain('towns')
    expect(text).not.toContain('rename')
    expect(text).not.toContain('archive')
  })

  it('says both when both changed', () => {
    renderHeader({
      fileName: 'Mileth Tavern.xml',
      folder: 'towns',
      initialFolder: 'drafts',
      folderOptions: ['towns', 'drafts']
    })
    const text = screen.getByText(/Saving will/).textContent ?? ''
    expect(text).toContain('move and rename')
    expect(text).toContain('drafts/Mileth Inn.xml')
    expect(text).toContain('towns/Mileth Tavern.xml')
  })

  it('names the top level rather than an empty folder', () => {
    renderHeader({ folder: '', initialFolder: 'drafts', folderOptions: ['drafts'] })
    expect(screen.getByText(/Saving will/).textContent).toContain('the top level')
  })

  it('offers the computed name without claiming a new file is made', () => {
    // Applying the computed name renames the file too — it does not save a
    // second copy beside the first.
    renderHeader({ computedFileName: 'Mileth Tavern.xml' })
    const text = screen.getByText(/Computed name/).textContent ?? ''
    expect(text).toContain('renames the file')
    expect(text).not.toContain('new file')
  })

  it('says nothing at all for a file that does not exist yet', () => {
    // No initial filename: there is nothing to rename or move.
    renderHeader({ initialFileName: undefined, fileName: 'New Map.xml', isExisting: false })
    expect(screen.queryByText(/Saving will/)).toBeNull()
  })
})
