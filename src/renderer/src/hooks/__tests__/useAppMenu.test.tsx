import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, renderHook } from '@testing-library/react'
import { runMenuCommand, isModalOpen, useAppMenu } from '../useAppMenu'
import { useMenuRequest } from '../useMenuRequest'
import { useUiStore } from '../../store/uiStore'
import { useMenuStore } from '../../store/menuStore'
import { installMockApi, type MockApi } from '../../__tests__/setup/mockApi'

// The renderer half of the macOS application menu (HTOO-569). Ported from creidhne.

let api: MockApi
const actions = { launchCompanion: vi.fn(async () => {}) }

beforeEach(() => {
  api = installMockApi()
  api.companionStatus.mockResolvedValue({ resolved: null })
  useUiStore.setState({
    currentPage: 'dashboard',
    pendingPage: null,
    dirtyEditor: null,
    reportIssueOpen: false
  })
  useMenuStore.setState({ pending: {} })
  actions.launchCompanion.mockClear()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('runMenuCommand', () => {
  it('Go switches the page through the guarded setter', () => {
    runMenuCommand({ command: 'go:mapmaker' }, actions)
    expect(useUiStore.getState().currentPage).toBe('mapmaker')
  })

  it('Go over a dirty editor parks the page for the unsaved-changes dialog', () => {
    useUiStore.setState({ dirtyEditor: { label: 'Map', onSave: async () => {} } })
    runMenuCommand({ command: 'go:mapmaker' }, actions)
    expect(useUiStore.getState().currentPage).toBe('dashboard')
    expect(useUiStore.getState().pendingPage).toBe('mapmaker')
  })

  it('ignores a page the renderer does not know, and a malformed message', () => {
    runMenuCommand({ command: 'go:nowhere' }, actions)
    runMenuCommand({ command: 7 }, actions)
    runMenuCommand(null, actions)
    expect(useUiStore.getState().currentPage).toBe('dashboard')
  })

  it('About and What’s New go to Settings and leave a request there', () => {
    runMenuCommand({ command: 'about' }, actions)
    expect(useUiStore.getState().currentPage).toBe('settings')
    expect(useMenuStore.getState().pending.about).toBeDefined()
  })

  it('Save runs the dirty editor’s save', () => {
    const onSave = vi.fn(async () => {})
    useUiStore.setState({ dirtyEditor: { label: 'Map', onSave } })
    runMenuCommand({ command: 'save' }, actions)
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('Report an Issue opens the dialog, and Launch Creidhne launches it', () => {
    runMenuCommand({ command: 'reportIssue' }, actions)
    expect(useUiStore.getState().reportIssueOpen).toBe(true)
    runMenuCommand({ command: 'launchCompanion' }, actions)
    expect(actions.launchCompanion).toHaveBeenCalledTimes(1)
  })

  it('does nothing while a modal is open', () => {
    // A page change would unmount the page under a dialog that belongs to it.
    document.body.innerHTML = '<div class="MuiModal-root"></div>'
    expect(isModalOpen()).toBe(true)
    runMenuCommand({ command: 'go:mapmaker' }, actions)
    runMenuCommand({ command: 'reportIssue' }, actions)
    expect(useUiStore.getState().currentPage).toBe('dashboard')
    expect(useUiStore.getState().reportIssueOpen).toBe(false)
  })

  it('a hidden modal that stays mounted does not block the menu', () => {
    document.body.innerHTML = '<div class="MuiModal-root MuiModal-hidden"></div>'
    expect(isModalOpen()).toBe(false)
  })
})

describe('useMenuRequest', () => {
  it('runs a request made before the component mounted, once', () => {
    useMenuStore.getState().request('about')
    const handler = vi.fn()
    const Probe = (): React.ReactElement => {
      useMenuRequest('about', handler)
      return <div />
    }
    const { rerender } = render(<Probe />)
    rerender(<Probe />)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(useMenuStore.getState().pending.about).toBeUndefined()
  })

  it('runs a request made while mounted', () => {
    const handler = vi.fn()
    renderHook(() => useMenuRequest('whatsNew', handler))
    act(() => useMenuStore.getState().request('whatsNew'))
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('useAppMenu', () => {
  it('on macOS, listens for commands and reports the state', async () => {
    api.platform = 'darwin'
    renderHook(() => useAppMenu(true))
    expect(api.menu.onCommand).toHaveBeenCalledTimes(1)
    expect(api.menu.setState).toHaveBeenLastCalledWith({
      page: 'dashboard',
      canSave: false,
      canLaunchCompanion: false
    })

    act(() => useUiStore.getState().setCurrentPage('archive'))
    expect(api.menu.setState).toHaveBeenLastCalledWith(expect.objectContaining({ page: 'archive' }))
  })

  it('runs a command the menu sends', () => {
    api.platform = 'darwin'
    let deliver: (msg: { command: string }) => void = () => {}
    api.menu.onCommand.mockImplementation((cb: typeof deliver) => {
      deliver = cb
      return () => {}
    })
    renderHook(() => useAppMenu(true))
    act(() => deliver({ command: 'go:uiforge' }))
    expect(useUiStore.getState().currentPage).toBe('uiforge')
  })

  it('does nothing on Windows, or before settings hydrate', () => {
    renderHook(() => useAppMenu(true))
    api.platform = 'darwin'
    renderHook(() => useAppMenu(false))
    expect(api.menu.onCommand).not.toHaveBeenCalled()
    expect(api.menu.setState).not.toHaveBeenCalled()
    expect(api.companionStatus).not.toHaveBeenCalled()
  })
})
