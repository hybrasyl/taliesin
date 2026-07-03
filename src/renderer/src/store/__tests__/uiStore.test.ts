import { describe, it, expect, beforeEach } from 'vitest'
import { useUiStore } from '../uiStore'

beforeEach(() => {
  useUiStore.setState({
    currentPage: 'dashboard',
    dirtyEditor: null,
    activePaletteId: null,
    activeColorizeSource: null
  })
})

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

  it('setActivePaletteId and setActiveColorizeSource update their fields', () => {
    useUiStore.getState().setActivePaletteId('pal-1')
    useUiStore.getState().setActiveColorizeSource('/img/src.png')
    expect(useUiStore.getState().activePaletteId).toBe('pal-1')
    expect(useUiStore.getState().activeColorizeSource).toBe('/img/src.png')
  })
})
