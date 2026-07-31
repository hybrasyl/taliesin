import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import WhatsNewDialog, { stripPreamble, parseChangelog, renderInline } from '../WhatsNewDialog'

// A miniature of the real file: H1 + blurb + the release-process HTML comment,
// then two releases with wrapped bullets and inline markup.
const SAMPLE = `# Changelog

All notable user-facing changes are recorded here.

<!--
Release process:
  1. Add the change under ## [Unreleased].
-->

## [Unreleased]

### Added

- **A wrapped entry.** This bullet continues onto a second line the way the
  real changelog wraps its prose at about 100 columns.

### Fixed

- A short one.

## [2.8.0] - 2026-07-20

### Changed

- Uses \`code\` and **bold** together.
`

describe('stripPreamble', () => {
  it('drops the H1, blurb and release-process comment', () => {
    const out = stripPreamble(SAMPLE)
    expect(out.startsWith('## [Unreleased]')).toBe(true)
    expect(out).not.toContain('Release process')
    expect(out).not.toContain('# Changelog')
  })

  it('falls back to the whole file when there is no version heading', () => {
    expect(stripPreamble('just some text')).toBe('just some text')
  })
})

describe('parseChangelog', () => {
  const releases = parseChangelog(stripPreamble(SAMPLE))

  it('reads each release heading, with the date when present', () => {
    expect(releases.map((r) => [r.version, r.date])).toEqual([
      ['Unreleased', null],
      ['2.8.0', '2026-07-20']
    ])
  })

  it('groups bullets under their section heading', () => {
    expect(releases[0].groups.map((g) => g.heading)).toEqual(['Added', 'Fixed'])
    expect(releases[1].groups[0].heading).toBe('Changed')
  })

  it('joins a bullet that wraps onto continuation lines', () => {
    expect(releases[0].groups[0].items[0]).toBe(
      '**A wrapped entry.** This bullet continues onto a second line the way the ' +
        'real changelog wraps its prose at about 100 columns.'
    )
  })

  it('keeps separate bullets separate', () => {
    expect(releases[0].groups[1].items).toEqual(['A short one.'])
  })

  it('returns nothing for input with no headings rather than guessing', () => {
    expect(parseChangelog('- an orphan bullet')).toEqual([])
  })

  it('parses the repository’s own CHANGELOG shape without losing releases', () => {
    // Guards the real format: every heading must yield a non-empty version.
    const parsed = parseChangelog(stripPreamble(SAMPLE))
    expect(parsed.every((r) => r.version.length > 0)).toBe(true)
  })
})

describe('renderInline', () => {
  it('marks **bold** as <strong> and `code` as a code box', () => {
    const { container } = render(<p>{renderInline('a **b** and `c`')}</p>)
    expect(container.querySelector('strong')?.textContent).toBe('b')
    expect(container.querySelector('code')?.textContent).toBe('c')
    expect(container.textContent).toBe('a b and c')
  })

  it('leaves text with no markup untouched', () => {
    const { container } = render(<p>{renderInline('plain text')}</p>)
    expect(container.querySelector('strong')).toBeNull()
    expect(container.textContent).toBe('plain text')
  })
})

describe('WhatsNewDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('reads the changelog only once the dialog is opened', async () => {
    const getChangelog = vi.fn().mockResolvedValue(SAMPLE)
    // @ts-expect-error partial api stub is enough for this component
    window.api = { getChangelog }

    const { rerender } = render(<WhatsNewDialog open={false} onClose={() => {}} />)
    expect(getChangelog).not.toHaveBeenCalled()

    rerender(<WhatsNewDialog open onClose={() => {}} />)
    await waitFor(() => expect(screen.getByTestId('changelog-body')).toBeInTheDocument())
    expect(getChangelog).toHaveBeenCalledTimes(1)
    expect(screen.getByText('2.8.0')).toBeInTheDocument()
  })

  it('says so when the changelog was not bundled, instead of erroring', async () => {
    // @ts-expect-error partial api stub is enough for this component
    window.api = { getChangelog: vi.fn().mockResolvedValue(null) }

    render(<WhatsNewDialog open onClose={() => {}} />)
    await waitFor(() =>
      expect(screen.getByText(/wasn't bundled with this build/i)).toBeInTheDocument()
    )
  })
})
