import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useWorldIndex } from '../useWorldIndex'
import { makeStoreWrapper } from '../../__tests__/setup/storeWrapper'
import { installMockApi, type MockApi } from '../../__tests__/setup/mockApi'

let api: MockApi

const fakeIndex = {
  libraryPath: '/lib',
  builtAt: '2025-01-01T00:00:00Z'
  // … (the WorldIndex shape has many fields; tests don't read them)
} as unknown as WorldIndex

beforeEach(() => {
  api = installMockApi()
  // Default: an up-to-date cache exists, so the hook takes the read path.
  // Individual tests override this to exercise the auto-build path.
  api.indexStatus.mockResolvedValue({ exists: true, stale: false })
})

function withLibrary(value: string | null) {
  return makeStoreWrapper({ settings: { activeLibrary: value } })
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

    await act(async () => {
      await result.current.build()
    })
    expect(api.indexBuild).toHaveBeenCalledWith('/lib')
    expect(result.current.index).toBe(newIndex)
    expect(result.current.building).toBe(false)
    expect(result.current.buildError).toBeNull()
  })

  // HTOO-335: pages call this after writing into the library, so the index they
  // read stops being the one loaded when the page opened.
  it('refresh() rebuilds for the active library', async () => {
    api.indexRead.mockResolvedValue(fakeIndex)
    const rebuilt = { ...fakeIndex, builtAt: '2025-03-03T00:00:00Z' } as WorldIndex
    api.indexBuild.mockResolvedValue(rebuilt)

    const { result } = renderHook(() => useWorldIndex(), { wrapper: withLibrary('/lib') })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.refresh()
    })
    expect(api.indexBuild).toHaveBeenCalledWith('/lib')
    expect(result.current.index).toBe(rebuilt)
  })

  it('refresh() is a no-op when no library is active', async () => {
    const { result } = renderHook(() => useWorldIndex(), { wrapper: withLibrary(null) })
    await act(async () => {
      await result.current.refresh()
    })
    expect(api.indexBuild).not.toHaveBeenCalled()
  })

  it('build() sets buildError on failure', async () => {
    api.indexRead.mockResolvedValue(null)
    api.indexBuild.mockRejectedValue(new Error('parse failed'))

    const { result } = renderHook(() => useWorldIndex(), { wrapper: withLibrary('/lib') })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.build()
    })
    expect(result.current.buildError).toBe('parse failed')
    expect(result.current.building).toBe(false)
  })

  it('build() with non-Error rejection falls back to a default message', async () => {
    api.indexRead.mockResolvedValue(null)
    api.indexBuild.mockRejectedValue('something weird')

    const { result } = renderHook(() => useWorldIndex(), { wrapper: withLibrary('/lib') })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.build()
    })
    expect(result.current.buildError).toBe('Index build failed')
  })

  it('build() is a no-op when no library is active', async () => {
    const { result } = renderHook(() => useWorldIndex(), { wrapper: withLibrary(null) })
    await act(async () => {
      await result.current.build()
    })
    expect(api.indexBuild).not.toHaveBeenCalled()
  })

  it('auto-builds when no cache exists on load', async () => {
    api.indexStatus.mockResolvedValue({ exists: false })
    const built = { ...fakeIndex, builtAt: '2025-03-03T00:00:00Z' } as WorldIndex
    api.indexBuild.mockResolvedValue(built)

    const { result } = renderHook(() => useWorldIndex(), { wrapper: withLibrary('/lib') })
    await waitFor(() => expect(result.current.index).toBe(built))
    expect(api.indexBuild).toHaveBeenCalledWith('/lib')
    expect(api.indexRead).not.toHaveBeenCalled()
  })

  it('auto-builds when the cache is stale on load', async () => {
    api.indexStatus.mockResolvedValue({ exists: true, stale: true })
    const built = { ...fakeIndex, builtAt: '2025-04-04T00:00:00Z' } as WorldIndex
    api.indexBuild.mockResolvedValue(built)

    const { result } = renderHook(() => useWorldIndex(), { wrapper: withLibrary('/lib') })
    await waitFor(() => expect(result.current.index).toBe(built))
    expect(api.indexBuild).toHaveBeenCalledWith('/lib')
  })

  it('shares one build across concurrent consumers of the same library', async () => {
    // The state is a shared store, not per-instance: six call sites mounting
    // against a stale cache must not each start their own build.
    api.indexStatus.mockResolvedValue({ exists: true, stale: true })
    api.indexBuild.mockResolvedValue(fakeIndex)
    const wrapper = withLibrary('/lib')

    const a = renderHook(() => useWorldIndex(), { wrapper })
    const b = renderHook(() => useWorldIndex(), { wrapper })

    await waitFor(() => expect(a.result.current.index).toBe(fakeIndex))
    await waitFor(() => expect(b.result.current.index).toBe(fakeIndex))
    expect(api.indexBuild).toHaveBeenCalledTimes(1)
  })
})
