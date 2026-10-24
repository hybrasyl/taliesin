import React from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import { hybrasylTheme } from '@renderer/themes'
import { appIdentity } from '@shared/appIdentity'
import { installMockApi, type MockApi } from '@renderer/__tests__/setup/mockApi'
import AppTitleBar from '../AppTitleBar'

let api: MockApi

beforeEach(() => {
  // Taliesin's setup installs no window.api; each test installs its own.
  api = installMockApi()
})

function renderAppTitleBar(): void {
  render(
    <ThemeProvider theme={hybrasylTheme}>
      <AppTitleBar />
    </ThemeProvider>
  )
}

/** Taliesin's wiring of the house TitleBar: its name, its icon, and the preload bridge. */
describe('AppTitleBar', () => {
  it("shows the app's product name", () => {
    renderAppTitleBar()
    expect(appIdentity.productName).toBe('Taliesin')
    expect(screen.getByTestId('title-bar')).toHaveTextContent(appIdentity.productName)
  })

  it('draws the bundled logo', () => {
    renderAppTitleBar()
    const logo = screen.getByTestId('title-bar').querySelector('img')
    expect(logo?.getAttribute('src')).toMatch(/taliesin\.webp/)
  })

  it('wires the window buttons to the preload bridge', async () => {
    const user = userEvent.setup()
    renderAppTitleBar()

    await user.click(screen.getByRole('button', { name: 'Minimize' }))
    expect(api.minimizeWindow).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Maximize' }))
    expect(api.maximizeWindow).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(api.closeWindow).toHaveBeenCalledOnce()
  })

  // HTOO-569. On macOS the bar is an empty drag region that holds the native
  // stoplights. The padding is checked in e2e/title-bar.spec.js, because jsdom
  // does not apply the Toolbar's media query.
  it('draws the empty drag region on macOS, with no logo and no name', () => {
    api.platform = 'darwin'
    renderAppTitleBar()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByTestId('title-bar').querySelector('img')).toBeNull()
    expect(screen.getByTestId('title-bar')).not.toHaveTextContent('Taliesin')
  })
})
