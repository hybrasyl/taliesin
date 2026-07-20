import { describe, it, expect, beforeEach } from 'vitest'
import { useUiStore } from '../uiStore'

beforeEach(() => {
  useUiStore.setState({
    currentPage: 'dashboard',
    pendingPage: null,
    dirtyEditor: null,
    activePaletteId: null,
    activeColorizeSource: null
  })
})

const dirty = (label = 'Map', onSave = async (): Promise<void> => {}): void =>
  useUiStore.getState().setDirtyEditor({ label, onSave })

describe('uiStore', () => {
  it('starts on the dashboard with no dirty editor or selections', () => {
    const s = useUiStore.getState()
    expect(s.currentPage).toBe('dashboard')
    expect(s.dirtyEditor).toBeNull()
    expect(s.activePaletteId).toBeNull()
    expect(s.activeColorizeSource).toBeNull()
  })

  it('setCurrentPage switches the active page', () => {
    useUiStore.getState().setCurrentPage('music')
    expect(useUiStore.getState().currentPage).toBe('music')
  })

  it('setDirtyEditor stores and clears the dirty descriptor', () => {
    const onSave = async () => {}
    useUiStore.getState().setDirtyEditor({ label: 'Map', onSave })
    expect(useUiStore.getState().dirtyEditor).toEqual({ label: 'Map', onSave })
    useUiStore.getState().setDirtyEditor(null)
    expect(useUiStore.getState().dirtyEditor).toBeNull()
  })

  it('parks the destination instead of navigating when an editor is dirty', () => {
    // The whole point of the guard: pages unmount on navigation, so leaving a
    // dirty editor has to be answered for before currentPage moves.
    dirty()
    useUiStore.getState().setCurrentPage('music')
    expect(useUiStore.getState().currentPage).toBe('dashboard')
    expect(useUiStore.getState().pendingPage).toBe('music')
  })

  it('does not park a navigation to the page already showing', () => {
    dirty()
    useUiStore.getState().setCurrentPage('dashboard')
    expect(useUiStore.getState().pendingPage).toBeNull()
  })

  it('commitPendingPage navigates and clears the dirty registration', () => {
    // Discard goes straight here, and the editor never gets to markClean, so
    // committing has to clear the slot itself or the guard fires forever.
    dirty()
    useUiStore.getState().setCurrentPage('music')
    useUiStore.getState().commitPendingPage()
    const s = useUiStore.getState()
    expect(s.currentPage).toBe('music')
    expect(s.pendingPage).toBeNull()
    expect(s.dirtyEditor).toBeNull()
  })

  it('commitPendingPage is a no-op with nothing pending', () => {
    useUiStore.getState().setCurrentPage('music')
    useUiStore.getState().commitPendingPage()
    expect(useUiStore.getState().currentPage).toBe('music')
  })

  it('cancelPendingPage stays put and keeps the editor dirty', () => {
    dirty()
    useUiStore.getState().setCurrentPage('music')
    useUiStore.getState().cancelPendingPage()
    const s = useUiStore.getState()
    expect(s.currentPage).toBe('dashboard')
    expect(s.pendingPage).toBeNull()
    expect(s.dirtyEditor).not.toBeNull()
  })

  it('navigates freely again once the editor is clean', () => {
    dirty()
    useUiStore.getState().setDirtyEditor(null)
    useUiStore.getState().setCurrentPage('music')
    expect(useUiStore.getState().currentPage).toBe('music')
    expect(useUiStore.getState().pendingPage).toBeNull()
  })

  it('setActivePaletteId and setActiveColorizeSource update their fields', () => {
    useUiStore.getState().setActivePaletteId('pal-1')
    useUiStore.getState().setActiveColorizeSource('/img/src.png')
    expect(useUiStore.getState().activePaletteId).toBe('pal-1')
    expect(useUiStore.getState().activeColorizeSource).toBe('/img/src.png')
  })
})
