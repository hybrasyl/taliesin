import { describe, it, expect, beforeEach } from 'vitest'
import { anyUnsaved, reportUnsaved, resetUnsavedReport } from '../unsavedReport'
import { useUiStore } from '../../store/uiStore'
import { installMockApi, type MockApi } from '../../__tests__/setup/mockApi'
import { resetStores } from '../../__tests__/setup/storeWrapper'

let api: MockApi

beforeEach(() => {
  api = installMockApi()
  resetStores()
  resetUnsavedReport()
})

function guard(id: string, dirty: boolean): void {
  useUiStore.getState().registerCloseGuard(id, {
    label: id,
    isDirty: () => dirty,
    onSave: async () => {}
  })
}

describe('unsavedReport', () => {
  it('reads the live close guards', () => {
    expect(anyUnsaved()).toBe(false)
    guard('a', false)
    expect(anyUnsaved()).toBe(false)
    guard('b', true)
    expect(anyUnsaved()).toBe(true)
  })

  it('sends only on a transition', () => {
    reportUnsaved()
    expect(api.setUnsaved).toHaveBeenCalledTimes(1)
    expect(api.setUnsaved).toHaveBeenLastCalledWith(false)
    reportUnsaved()
    expect(api.setUnsaved).toHaveBeenCalledTimes(1)
    guard('a', true)
    reportUnsaved()
    reportUnsaved()
    expect(api.setUnsaved).toHaveBeenCalledTimes(2)
    expect(api.setUnsaved).toHaveBeenLastCalledWith(true)
    useUiStore.getState().unregisterCloseGuard('a')
    reportUnsaved()
    expect(api.setUnsaved).toHaveBeenCalledTimes(3)
    expect(api.setUnsaved).toHaveBeenLastCalledWith(false)
  })
})
