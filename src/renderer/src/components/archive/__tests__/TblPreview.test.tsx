import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TblPreview from '../TblPreview'

// dalib-ts is deliberately NOT mocked here: the point of this suite is that a
// real table from the real parsers reaches the screen. The reading rules
// themselves are covered in utils/__tests__/tblTables.test.ts.

function renderTbl(entryName: string, text: string): void {
  const buf = new TextEncoder().encode(text)
  const entry = { entryName, fileSize: buf.length, toUint8Array: () => buf }
  const archive = { getEntryBuffer: () => buf }
  render(<TblPreview entry={entry as never} archive={archive as never} />)
}

describe('TblPreview', () => {
  it('names a tile animation table and shows its sequence', () => {
    renderTbl('gndani.tbl', '1 2 3 5\n')
    expect(screen.getByText('Tile animation table')).toBeInTheDocument()
    expect(screen.getByText('1 → 2 → 3')).toBeInTheDocument()
    expect(screen.getByText('500 ms')).toBeInTheDocument()
  })

  it('names a palette table and reports the rule that identified it', () => {
    renderTbl('stcpal.tbl', '2 10 5\n')
    expect(screen.getByText('Palette table')).toBeInTheDocument()
    expect(screen.getByText('2–10')).toBeInTheDocument()
    expect(screen.getByText(/identified by named \*pal\.tbl/)).toBeInTheDocument()
  })

  it('numbers effect slots from 1 and marks empty ones', () => {
    renderTbl('effect.tbl', '2\n1 2\n\n')
    expect(screen.getByText('Effect table')).toBeInTheDocument()
    expect(screen.getByText('1 → 2')).toBeInTheDocument()
    expect(screen.getByText('(empty slot)')).toBeInTheDocument()
  })

  it('marks a luminance-blended palette number', () => {
    renderTbl('stcpal.tbl', '4 1007\n')
    expect(screen.getByText('7 (luminance blended)')).toBeInTheDocument()
  })

  it('falls back to the text view when nothing identifies the file', () => {
    renderTbl('readme.tbl', 'this is not a table')
    expect(screen.queryByText('Palette table')).not.toBeInTheDocument()
    expect(screen.getByText(/this is not a table/)).toBeInTheDocument()
  })

  it('still shows dye swatches for a colour table', () => {
    renderTbl('color0.tbl', '1\n0\n255,0,0\n')
    expect(screen.getByText(/ColorTable · 1 entry/)).toBeInTheDocument()
  })
})
