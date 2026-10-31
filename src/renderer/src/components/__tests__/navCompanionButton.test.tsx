import React from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material'
import { themesByName } from '@renderer/themes'
import { useSettingsStore } from '../../store/settingsStore'
import MainLayout from '../MainLayout'
import { installMockApi } from '../../__tests__/setup/mockApi'

/**
 * The Launch Creidhne button has a name of its own. Its tooltip is on a wrapping
 * span, so that the tooltip shows when the button is disabled, and MUI puts the
 * tooltip's label on that span: the button had no name, for a screen reader or
 * for `getByRole` (found in the November 2026 Linux release pass).
 */
function renderLayout(): void {
  render(
    <ThemeProvider theme={themesByName.hybrasyl}>
      <MainLayout>
        <div />
      </MainLayout>
    </ThemeProvider>
  )
}

describe('the Launch Creidhne button', () => {
  let api: ReturnType<typeof installMockApi>

  beforeEach(() => {
    api = installMockApi()
    useSettingsStore.setState({ theme: 'hybrasyl' })
  })
  afterEach(cleanup)

  it('is named Launch Creidhne, and enabled, when Creidhne is found', async () => {
    api.companionStatus.mockResolvedValue({
      resolved: { target: '/apps/Creidhne.AppImage', kind: 'binary', source: 'sibling' },
      staleOverride: false
    })
    renderLayout()
    expect(await screen.findByRole('button', { name: 'Launch Creidhne' })).toBeEnabled()
  })

  it('says where to look, and is disabled, when Creidhne is not found', async () => {
    api.companionStatus.mockResolvedValue({ resolved: null, staleOverride: false })
    renderLayout()
    expect(
      await screen.findByRole('button', { name: 'Creidhne not found — see Settings' })
    ).toBeDisabled()
  })
})
