// house module: editor-shell v1 — change it in the template, then port
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EditorHeader, { describeMoveSave, type EditorHeaderProps } from '../EditorHeader'

function renderHeader(props: Partial<EditorHeaderProps> = {}) {
  const handlers = {
    onFileNameChange: vi.fn(),
    onRegenerate: vi.fn(),
    onSave: vi.fn(),
    onRenameFile: vi.fn()
  }
  render(
    <EditorHeader
      title="Abel"
      fileName="Abel.xml"
      initialFileName="Abel.xml"
      computedFileName="Abel.xml"
      isExisting
      folder=""
      initialFolder=""
      {...handlers}
      {...props}
    />
  )
  return handlers
}

describe('EditorHeader', () => {
  it('saves, and keeps Rename disabled while the name and folder are the same', async () => {
    const h = renderHeader()
    expect(screen.getByRole('button', { name: 'Rename' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(h.onSave).toHaveBeenCalled()
    expect(screen.queryByText(/Save /)).toBeNull()
  })

  it('enables Rename for a new filename, and says what the save does', async () => {
    const h = renderHeader({ fileName: 'Abel2.xml', computedFileName: 'Abel2.xml' })
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))
    expect(h.onRenameFile).toHaveBeenCalled()
    const field = screen.getByRole('textbox', { name: 'Filename' })
    const helper = document.getElementById(field.getAttribute('aria-describedby') ?? '')
    expect(helper).toHaveTextContent('Save renames "Abel.xml" to "Abel2.xml"')
  })

  it('takes the save sentence from the app', () => {
    renderHeader({ fileName: 'Abel2.xml', describeSave: (s) => `Archive ${s.origin}` })
    expect(screen.getByText('Archive Abel.xml')).toBeInTheDocument()
  })

  it('gives the folder picker whether the folder will change', () => {
    const picker = vi.fn(() => <span>picker</span>)
    renderHeader({ folder: 'towns', renderFolderPicker: picker })
    expect(picker).toHaveBeenCalledWith(true)
    expect(screen.getByText('Save moves "Abel.xml" to "towns"')).toBeInTheDocument()
  })

  it('puts the app controls before Rename, and hides Rename without a handler', () => {
    renderHeader({ controls: <button>Staging</button>, onRenameFile: undefined })
    expect(screen.getByRole('button', { name: 'Staging' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull()
  })

  it('applies the computed filename from ↺', async () => {
    const h = renderHeader({ computedFileName: 'lod00001.xml' })
    expect(screen.getByText(/Computed name: "lod00001.xml"/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Apply computed filename' }))
    expect(h.onRegenerate).toHaveBeenCalled()
  })

  it('says nothing for a new file', () => {
    renderHeader({ initialFileName: null, fileName: 'New.xml', computedFileName: 'Other.xml' })
    expect(screen.queryByText(/Computed name/)).toBeNull()
  })
})

describe('describeMoveSave', () => {
  const base = {
    willRename: false,
    willMove: false,
    recyclePending: false,
    origin: 'a/x.xml',
    destination: 'b/y.xml',
    initialFileName: 'x.xml',
    computedFileName: 'z.xml',
    folder: ''
  }
  it('names each case', () => {
    expect(describeMoveSave({ ...base, willRename: true, willMove: true })).toBe(
      'Save moves and renames "a/x.xml" to "b/y.xml"'
    )
    expect(describeMoveSave({ ...base, willMove: true })).toBe(
      'Save moves "x.xml" to the top level'
    )
    expect(describeMoveSave(base)).toBeUndefined()
  })
})
