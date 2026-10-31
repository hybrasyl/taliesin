import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import RenameReferrersDialog from '../RenameReferrersDialog'

/** A referrer in staging is listed, and its row says so (HTOO-635). */
describe('RenameReferrersDialog', () => {
  it('marks a staged referrer, and names an item teleport', () => {
    render(
      <RenameReferrersDialog
        open
        oldName="Abel"
        newName="Abel Town"
        referrers={[
          { file: 'Inn.xml', count: 2, section: 'maps' },
          { file: 'draft/Docks.xml', count: 1, section: 'maps', staged: true },
          { file: 'song.xml', count: 1, section: 'items', staged: true }
        ]}
        busy={false}
        onUpdate={vi.fn()}
        onSkip={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByText('2 warps')).toBeInTheDocument()
    expect(screen.getByText('1 warp · staged')).toBeInTheDocument()
    expect(screen.getByText('1 teleport · staged')).toBeInTheDocument()
    expect(screen.getByText(/3 warps in 2 maps, 1 teleport in 1 item/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update 4' })).toBeInTheDocument()
  })
})
