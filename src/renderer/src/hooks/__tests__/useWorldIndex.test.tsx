import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useWorldIndex } from '../useWorldIndex'
import { activeLibraryState } from '../../recoil/atoms'
import { makeRecoilWrapper, recoilOverride } from '../../__tests__/setup/recoilWrapper'
import { installMockApi, type MockApi } from '../../__tests__/setup/mockApi'

let api: MockApi

const fakeIndex = {
  libraryPath: '/lib',
  builtAt: '2025-01-01T00:00:00Z',
  // … (the WorldIndex shape has many fields; tests don't read them)
} as unknown as WorldIndex

beforeEach(() => {
  api = installMockApi()
})

function withLibrary(value: string | null) {
  return makeRecoilWrapper([recoilOverride(activeLibraryState, value)])
}

describe('useWorldIndex', () => {
  it('returns null index and never calls indexRead when no library is active', async () => {
    const { result } = renderHook(() => useWorldIndex(), { wrapper: withLibrary(null) })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.index).toBeNull()
    expect(api.indexRead).not.toHaveBeenCalled()
  })

  it('reads index when library becomes active', async () => {
    api.indexRead.mockResolvedValue(fakeIndex)
    const { result } = renderHook(() => useWorldIndex(), { wrapper: withLibrary('/lib') })
    await waitFor(() => expect(result.current.index).toBe(fakeIndex))
    expect(api.indexRead).toHaveBeenCalledWith('/lib')
    expect(result.current.loading).toBe(false)
  })

  it('build() invokes indexBuild and stores the result', async () => {
    api.indexRead.mockResolvedValue(null)
    const newIndex = { ...fakeIndex, builtAt: '2025-02-02T00:00:00Z' } as WorldIndex
    api.indexBuild.mockResolvedValue(newIndex)

    const { result } = renderHook(() => useWorldIndex(), { wrapper: withLibrary('/lib') })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.build() })
    expect(api.indexBuild).toHaveBeenCalledWith('/lib')
    expect(result.current.index).toBe(newIndex)
    expect(result.current.building).toBe(false)
    expect(result.current.buildError).toBeNull()
  })

  it('build() sets buildError on failure', async () => {
    api.indexRead.mockResolvedValue(null)
    api.indexBuild.mockRejectedValue(new Error('parse failed'))

    const { result } = renderHook(() => useWorldIndex(), { wrapper: withLibrary('/lib') })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.build() })
    expect(result.current.buildError).toBe('parse failed')
    expect(result.current.building).toBe(false)
  })

  it('build() with non-Error rejection falls back to a default message', async () => {
    api.indexRead.mockResolvedValue(null)
    api.indexBuild.mockRejectedValue('something weird')

    const { result } = renderHook(() => useWorldIndex(), { wrapper: withLibrary('/lib') })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.build() })
    expect(result.current.buildError).toBe('Index build failed')
  })

  it('build() is a no-op when no library is active', async () => {
    const { result } = renderHook(() => useWorldIndex(), { wrapper: withLibrary(null) })
    await act(async () => { await result.current.build() })
    expect(api.indexBuild).not.toHaveBeenCalled()
  })
})
