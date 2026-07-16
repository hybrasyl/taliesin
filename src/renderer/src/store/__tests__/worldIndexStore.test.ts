import { describe, it, expect, beforeEach } from 'vitest'
import { useWorldIndexStore } from '../worldIndexStore'
import { useSettingsStore } from '../settingsStore'
import { resetStores } from '../../__tests__/setup/storeWrapper'
import { installMockApi, type MockApi } from '../../__tests__/setup/mockApi'

let api: MockApi

const fakeIndex = { libraryPath: '/lib', builtAt: '2025-01-01T00:00:00Z' } as unknown as WorldIndex

/** The store only publishes for the active library, so seed it. */
function activate(library: string | null) {
  useSettingsStore.setState({ activeLibrary: library })
}

/** A promise we can settle by hand, to make "concurrent" deterministic. */
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

beforeEach(() => {
  resetStores()
  api = installMockApi()
  api.indexStatus.mockResolvedValue({ exists: true, stale: false })
  api.indexRead.mockResolvedValue(fakeIndex)
})

describe('ensure', () => {
  it('reads an up-to-date cache without building', async () => {
    activate('/lib')
    await useWorldIndexStore.getState().ensure('/lib')
    expect(useWorldIndexStore.getState().index).toBe(fakeIndex)
    expect(useWorldIndexStore.getState().loadedFor).toBe('/lib')
    expect(api.indexBuild).not.toHaveBeenCalled()
  })

  it('collapses concurrent calls onto one status check and one build', async () => {
    // The defect this closes: every mount checked status, all saw `stale`
    // before the first build had saved, and each started its own build.
    activate('/lib')
    api.indexStatus.mockResolvedValue({ exists: true, stale: true })
    const d = deferred<WorldIndex>()
    api.indexBuild.mockReturnValue(d.promise)

    const a = useWorldIndexStore.getState().ensure('/lib')
    const b = useWorldIndexStore.getState().ensure('/lib')
    d.resolve(fakeIndex)
    await Promise.all([a, b])

    expect(api.indexStatus).toHaveBeenCalledTimes(1)
    expect(api.indexBuild).toHaveBeenCalledTimes(1)
    expect(useWorldIndexStore.getState().index).toBe(fakeIndex)
  })

  it('is a no-op once the library is already loaded', async () => {
    // StrictMode remounts land here — the second pass must cost nothing.
    activate('/lib')
    await useWorldIndexStore.getState().ensure('/lib')
    await useWorldIndexStore.getState().ensure('/lib')
    expect(api.indexStatus).toHaveBeenCalledTimes(1)
    expect(api.indexRead).toHaveBeenCalledTimes(1)
  })

  it('clears state for a null library', async () => {
    activate('/lib')
    await useWorldIndexStore.getState().ensure('/lib')
    await useWorldIndexStore.getState().ensure(null)
    expect(useWorldIndexStore.getState().index).toBeNull()
    expect(useWorldIndexStore.getState().loadedFor).toBeNull()
  })

  it('does not publish a result for a library that is no longer active', async () => {
    // Switch A → B while A's read is in flight: A's late answer must not land.
    activate('/libA')
    const d = deferred<WorldIndex>()
    api.indexRead.mockReturnValue(d.promise)

    const inFlight = useWorldIndexStore.getState().ensure('/libA')
    activate('/libB')
    d.resolve(fakeIndex)
    await inFlight

    expect(useWorldIndexStore.getState().index).toBeNull()
    expect(useWorldIndexStore.getState().loadedFor).toBeNull()
  })

  it('records a build failure and stops building', async () => {
    activate('/lib')
    api.indexStatus.mockResolvedValue({ exists: false })
    api.indexBuild.mockRejectedValue(new Error('parse failed'))
    await useWorldIndexStore.getState().ensure('/lib')
    expect(useWorldIndexStore.getState().buildError).toBe('parse failed')
    expect(useWorldIndexStore.getState().building).toBe(false)
    expect(useWorldIndexStore.getState().loading).toBe(false)
  })

  it('retries after a failed build rather than staying stuck', async () => {
    activate('/lib')
    api.indexStatus.mockResolvedValue({ exists: false })
    api.indexBuild.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(fakeIndex)
    await useWorldIndexStore.getState().ensure('/lib')
    // The failure left `loadedFor` unset, so the next attempt is not skipped.
    await useWorldIndexStore.getState().ensure('/lib')
    expect(api.indexBuild).toHaveBeenCalledTimes(2)
    expect(useWorldIndexStore.getState().index).toBe(fakeIndex)
  })
})

describe('build', () => {
  it('rebuilds even when the library is already loaded', async () => {
    activate('/lib')
    await useWorldIndexStore.getState().ensure('/lib')
    const rebuilt = { ...fakeIndex, builtAt: '2025-02-02T00:00:00Z' } as WorldIndex
    api.indexBuild.mockResolvedValue(rebuilt)

    await useWorldIndexStore.getState().build('/lib')
    expect(api.indexBuild).toHaveBeenCalledTimes(1)
    expect(useWorldIndexStore.getState().index).toBe(rebuilt)
  })

  it('collapses concurrent rebuild clicks', async () => {
    activate('/lib')
    const d = deferred<WorldIndex>()
    api.indexBuild.mockReturnValue(d.promise)
    const a = useWorldIndexStore.getState().build('/lib')
    const b = useWorldIndexStore.getState().build('/lib')
    d.resolve(fakeIndex)
    await Promise.all([a, b])
    expect(api.indexBuild).toHaveBeenCalledTimes(1)
  })

  it('is a no-op with no library', async () => {
    await useWorldIndexStore.getState().build(null)
    expect(api.indexBuild).not.toHaveBeenCalled()
  })
})
