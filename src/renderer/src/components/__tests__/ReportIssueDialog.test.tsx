import React from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import ReportIssueDialog from '../ReportIssueDialog'
import { installMockApi, type MockApi } from '../../__tests__/setup/mockApi'

let api: MockApi

beforeEach(() => {
  api = installMockApi()
  api.buildDiagnostics.mockResolvedValue('App: Taliesin test')
})

async function openIssue(): Promise<void> {
  const user = userEvent.setup()
  render(<ReportIssueDialog open onClose={() => {}} />)
  await user.click(screen.getByRole('button', { name: /open github issue/i }))
}

describe('ReportIssueDialog — opening the issue', () => {
  it('says the report is on the clipboard when the copy worked', async () => {
    api.openIssue.mockResolvedValue({ ok: true, truncated: false, copied: true })
    await openIssue()
    expect(await screen.findByText(/also copied to your clipboard/)).toBeInTheDocument()
  })

  // Electron 44's clipboard can fail (HTOO-553). The page still opens, so the
  // dialog must not claim a copy that did not happen.
  it('warns, and does not claim a copy, when the clipboard write failed', async () => {
    api.openIssue.mockResolvedValue({ ok: true, truncated: true, copied: false })
    await openIssue()
    expect(await screen.findByText(/could not copy it to your clipboard/)).toBeInTheDocument()
    expect(screen.queryByText(/was copied to your clipboard/)).not.toBeInTheDocument()
  })
})
