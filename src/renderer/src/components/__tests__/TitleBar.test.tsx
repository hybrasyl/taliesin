import React from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import TitleBar from '../TitleBar'
import { installMockApi, type MockApi } from '../../__tests__/setup/mockApi'

// HTOO-569. On macOS the bar is an empty drag region that holds the native
// stoplights: no logo, no name, no window buttons. The padding is checked in
// e2e/title-bar.spec.js, because jsdom does not apply the Toolbar's media query.

let api: MockApi

beforeEach(() => {
  api = installMockApi()
})

describe('TitleBar', () => {
  it('draws the logo, the name and three window buttons on Windows and Linux', () => {
    render(<TitleBar />)
    expect(screen.getByTestId('app-title')).toHaveTextContent('Taliesin')
    expect(screen.getByAltText('Taliesin')).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  it('is empty on macOS', () => {
    api.platform = 'darwin'
    render(<TitleBar />)
    expect(screen.getByTestId('title-bar')).toBeInTheDocument()
    expect(screen.queryByTestId('app-title')).not.toBeInTheDocument()
    expect(screen.queryByAltText('Taliesin')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
