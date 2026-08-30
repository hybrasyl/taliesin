import { describe, it, expect, beforeEach } from 'vitest'
import type { MapFile } from '@eriscorp/dalib-ts'
import { createTab, resetMapMakerStore, useMapMakerStore } from '../../store/mapMakerStore'
import { hasDirtyTabs, saveDirtyTabs, saveTab } from '../mapMakerSave'
import { installMockApi, type MockApi } from '../../__tests__/setup/mockApi'

const fakeMap = (byte: number): MapFile =>
  ({ toUint8Array: () => new Uint8Array([byte]) }) as unknown as MapFile

let api: MockApi

beforeEach(() => {
  api = installMockApi()
  resetMapMakerStore()
})

describe('saveTab', () => {
  it('writes a saved tab back to its own path and clears dirty', async () => {
    const tab = createTab(fakeMap(7), 'C:/maps/a.map', true)
    useMapMakerStore.getState().addTab(tab)
    expect(await saveTab(tab)).toBe(true)
    expect(api.saveFile).not.toHaveBeenCalled()
    expect(api.writeBytes).toHaveBeenCalledWith('C:/maps/a.map', new Uint8Array([7]))
    expect(useMapMakerStore.getState().tabs[0].dirty).toBe(false)
  })

  it('asks for a path for an unsaved tab, and keeps it dirty when cancelled', async () => {
    const tab = createTab(fakeMap(1), null, true)
    useMapMakerStore.getState().addTab(tab)
    api.saveFile.mockResolvedValue(null)
    expect(await saveTab(tab)).toBe(false)
    expect(api.writeBytes).not.toHaveBeenCalled()
    expect(useMapMakerStore.getState().tabs[0].dirty).toBe(true)
  })

  it('records the chosen path on the tab', async () => {
    const tab = createTab(fakeMap(1), null, true)
    useMapMakerStore.getState().addTab(tab)
    api.saveFile.mockResolvedValue('C:/maps/new.map')
    expect(await saveTab(tab)).toBe(true)
    const saved = useMapMakerStore.getState().tabs[0]
    expect(saved.filePath).toBe('C:/maps/new.map')
    expect(saved.dirty).toBe(false)
  })

  it('has nothing to save for an empty tab', async () => {
    expect(await saveTab(createTab(null, null, false))).toBe(false)
  })
})

describe('hasDirtyTabs / saveDirtyTabs', () => {
  it('saves only the dirty tabs and reports clean afterwards', async () => {
    const store = useMapMakerStore.getState()
    store.addTab(createTab(fakeMap(1), 'C:/maps/a.map', true))
    store.addTab(createTab(fakeMap(2), 'C:/maps/b.map', false))
    store.addTab(createTab(fakeMap(3), 'C:/maps/c.map', true))
    expect(hasDirtyTabs()).toBe(true)
    await saveDirtyTabs()
    expect(api.writeBytes).toHaveBeenCalledTimes(2)
    expect(api.writeBytes).toHaveBeenCalledWith('C:/maps/a.map', new Uint8Array([1]))
    expect(api.writeBytes).toHaveBeenCalledWith('C:/maps/c.map', new Uint8Array([3]))
    expect(hasDirtyTabs()).toBe(false)
  })

  it('a cancelled dialog leaves that tab dirty, so the close is refused', async () => {
    const store = useMapMakerStore.getState()
    store.addTab(createTab(fakeMap(1), null, true))
    api.saveFile.mockResolvedValue(null)
    await saveDirtyTabs()
    expect(hasDirtyTabs()).toBe(true)
  })
})
