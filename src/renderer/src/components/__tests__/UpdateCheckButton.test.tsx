// house module: update-check v1 — change it in the template, then port
import React from 'react'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { appIdentity } from '../../../../shared/appIdentity'
import type { UpdateCheckResult } from '../../../../shared/updateVersion'
import UpdateCheckButton from '../UpdateCheckButton'
import { installMockApi } from '../../__tests__/setup/mockApi'

// Taliesin's jsdom setup has no global window.api; the template's does.
beforeEach(() => {
  installMockApi()
})

const URL_020 = `${appIdentity.releaseUrlPrefix}tag/v0.2.0`

async function clickWith(result: UpdateCheckResult | Error): Promise<ReturnType<typeof vi.fn>> {
  const check = vi.fn(async () => {
    if (result instanceof Error) throw result
    return result
  })
  window.api.checkForUpdate = check
  render(<UpdateCheckButton currentVersion="0.1.0" />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /check for updates/i }))
  })
  return check
}

describe('UpdateCheckButton', () => {
  it('shows nothing until the user asks', () => {
    window.api.checkForUpdate = vi.fn()
    render(<UpdateCheckButton currentVersion="0.1.0" />)
    expect(window.api.checkForUpdate).not.toHaveBeenCalled()
    expect(screen.queryByTestId('update-check-result')).not.toBeInTheDocument()
  })

  it('says the app is up to date, with the running version', async () => {
    await clickWith({ ok: true, update: null })
    expect(screen.getByTestId('update-check-result')).toHaveTextContent(
      `${appIdentity.productName} is up to date (0.1.0).`
    )
  })

  it('names a newer version and links to it', async () => {
    await clickWith({ ok: true, update: { version: '0.2.0', url: URL_020 } })
    expect(screen.getByTestId('update-check-result')).toHaveTextContent('0.2.0 is available.')
    expect(screen.getByRole('link', { name: /view release/i })).toHaveAttribute('href', URL_020)
  })

  it('shows a version the user closed in the notice: they asked', async () => {
    window.localStorage.setItem(`${appIdentity.updateKey}:dismissedVersion`, '0.2.0')
    await clickWith({ ok: true, update: { version: '0.2.0', url: URL_020 } })
    expect(screen.getByTestId('update-check-result')).toHaveTextContent('0.2.0 is available.')
  })

  it('explains a failure in plain words', async () => {
    await clickWith({ ok: false, reason: 'no-entry' })
    expect(screen.getByTestId('update-check-result')).toHaveTextContent(
      'Could not check for updates. The version list has no entry for this app yet.'
    )
  })

  it('reports a rejected IPC as a failure, not as up to date', async () => {
    await clickWith(new Error('ipc'))
    expect(screen.getByTestId('update-check-result')).toHaveTextContent(/Could not check/)
  })

  it('is disabled while a check runs', async () => {
    let finish: (r: UpdateCheckResult) => void = () => undefined
    window.api.checkForUpdate = vi.fn(
      () => new Promise<UpdateCheckResult>((resolve) => (finish = resolve))
    )
    render(<UpdateCheckButton currentVersion="0.1.0" />)
    fireEvent.click(screen.getByRole('button', { name: /check for updates/i }))
    expect(screen.getByRole('button', { name: /checking/i })).toBeDisabled()
    await act(async () => finish({ ok: true, update: null }))
    expect(screen.getByRole('button', { name: /check for updates/i })).toBeEnabled()
  })
})
