import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// A synthetic font, not a real `.lft` buffer: the parser is dalib-ts's and is
// covered there. `LftFile`'s constructor is public, so the preview can be given
// a font with exactly one populated glyph and one empty one, which is what these
// tests are about. Everything else in dalib-ts stays real, so `renderLftText`
// and `measureLftText` run for real against it.
vi.mock('@eriscorp/dalib-ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@eriscorp/dalib-ts')>()

  // Keys are inlined rather than shared with the test body: this factory is
  // hoisted above every top-level binding in the file.
  const glyphs = new Array(65535)
  // 4 × 5 solid block at bitmap offset 4; row stride for width 4 is 4 bytes.
  glyphs[0x41] = {
    advance: 5,
    left: 0,
    top: 1,
    right: 4,
    bottom: 6,
    packedSize: 20,
    bitmapOffset: 4
  }
  // A record with no bitmap — the common case across the 65,535 keys.
  glyphs[0x20] = {
    advance: 3,
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    packedSize: 0,
    bitmapOffset: 0
  }
  const bitmapData = new Uint8Array(64)
  for (let row = 0; row < 5; row++) bitmapData[4 + row * 4] = 0xf0

  class TestLftFile extends actual.LftFile {
    static fromBuffer(): import('@eriscorp/dalib-ts').LftFile {
      return new actual.LftFile(8, 8, glyphs, bitmapData)
    }
  }

  return { ...actual, LftFile: TestLftFile }
})

import LftPreview from '../LftPreview'

function renderLft(): void {
  const buf = new Uint8Array([1, 2, 3, 4])
  const entry = { entryName: 'da.lft', fileSize: buf.length, toUint8Array: () => buf }
  const archive = { getEntryBuffer: () => buf }
  render(<LftPreview entry={entry as never} archive={archive as never} />)
}

describe('LftPreview', () => {
  it('summarises the font header and how many records carry a bitmap', () => {
    renderLft()
    expect(screen.getByText(/Nominal cell 8 × 8 px/)).toBeInTheDocument()
    expect(screen.getByText(/1 of 65535 records have a bitmap/)).toBeInTheDocument()
  })

  it('states that keys are not Unicode', () => {
    renderLft()
    expect(screen.getByText(/keys are raw byte values, not Unicode/)).toBeInTheDocument()
  })

  it('browses only the populated glyphs', () => {
    renderLft()
    expect(screen.getByText(/Glyphs 1–1 of 1/)).toBeInTheDocument()
    expect(screen.getByText(/Keys 0x41–0x41/)).toBeInTheDocument()
  })

  it('inspects a glyph by key, showing its metrics and code page', async () => {
    const user = userEvent.setup()
    renderLft()
    await user.type(screen.getByLabelText('Jump to key'), '0x41{Enter}')

    expect(screen.getByText(/0x0041 · single byte/)).toBeInTheDocument()
    expect(screen.getByText(/Windows-1252/)).toBeInTheDocument()
    expect(screen.getByText('advance')).toBeInTheDocument()
    expect(screen.getByText('4 × 5')).toBeInTheDocument()
  })

  it('accepts a decimal key too', async () => {
    const user = userEvent.setup()
    renderLft()
    await user.type(screen.getByLabelText('Jump to key'), '65{Enter}')
    expect(screen.getByText(/0x0041 · single byte/)).toBeInTheDocument()
  })

  it('refuses a key whose record has no bitmap', async () => {
    const user = userEvent.setup()
    renderLft()
    await user.type(screen.getByLabelText('Jump to key'), '0x20{Enter}')
    expect(screen.getByText('No glyph with a bitmap at that key.')).toBeInTheDocument()
  })

  it('reports a bad key rather than jumping', async () => {
    const user = userEvent.setup()
    renderLft()
    await user.type(screen.getByLabelText('Jump to key'), 'zzz{Enter}')
    expect(screen.getByText('Enter a key as 0x41 or 65.')).toBeInTheDocument()
  })

  it('measures a typed sample string with the font’s real advances', async () => {
    const user = userEvent.setup()
    renderLft()
    const sample = screen.getByLabelText('Sample text')
    await user.clear(sample)
    await user.type(sample, 'AAA')
    // Three glyphs at advance 5.
    expect(screen.getByText(/advance 15 px/)).toBeInTheDocument()
  })
})
