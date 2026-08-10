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
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
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

  it('does not clear the spinner for the library now loading when the old one settles', async () => {
    // The finally blocks must be guarded too, not just the success/error sets:
    // A settling after a switch to B would otherwise report B as idle mid-build.
    activate('/libA')
    const a = deferred<WorldIndex>()
    api.indexRead.mockReturnValueOnce(a.promise)
    const inFlightA = useWorldIndexStore.getState().ensure('/libA')

    activate('/libB')
    api.indexStatus.mockResolvedValue({ exists: false })
    api.indexBuild.mockReturnValue(deferred<WorldIndex>().promise) // B never settles
    const inFlightB = useWorldIndexStore.getState().ensure('/libB')
    await Promise.resolve()

    a.resolve(fakeIndex)
    await inFlightA

    expect(useWorldIndexStore.getState().building).toBe(true)
    expect(useWorldIndexStore.getState().loading).toBe(true)
    void inFlightB
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

describe('refresh', () => {
  // HTOO-335: no write path refreshed the index, so a map you had just created
  // could not be picked as a warp destination and its name stayed blank.

  it('rebuilds and republishes the index', async () => {
    activate('/lib')
    await useWorldIndexStore.getState().ensure('/lib')
    expect(api.indexBuild).not.toHaveBeenCalled()

    const rebuilt = { ...fakeIndex, builtAt: '2025-02-02T00:00:00Z' } as unknown as WorldIndex
    api.indexBuild.mockResolvedValue(rebuilt)
    await useWorldIndexStore.getState().refresh('/lib')

    expect(api.indexBuild).toHaveBeenCalledWith('/lib')
    expect(useWorldIndexStore.getState().index).toBe(rebuilt)
  })

  // The trap the card calls out: `ensure` short-circuits on `loadedFor`, so an
  // ensure-based refresh is a silent no-op and looks exactly like the bug being
  // unfixed. `refresh` must not inherit that.
  it('is not short-circuited by the index already being loaded', async () => {
    activate('/lib')
    await useWorldIndexStore.getState().ensure('/lib')
    expect(useWorldIndexStore.getState().loadedFor).toBe('/lib')

    api.indexBuild.mockResolvedValue(fakeIndex)
    await useWorldIndexStore.getState().refresh('/lib')
    await useWorldIndexStore.getState().refresh('/lib')
    expect(api.indexBuild).toHaveBeenCalledTimes(2)
  })

  // A build already running may have scanned the tree before this write landed,
  // so joining it would return a result without the change that prompted the
  // refresh.
  it('waits out an in-flight build rather than joining it', async () => {
    activate('/lib')
    const first = deferred<WorldIndex>()
    api.indexBuild.mockReturnValueOnce(first.promise)
    const building = useWorldIndexStore.getState().build('/lib')
    expect(api.indexBuild).toHaveBeenCalledTimes(1)

    const after = { ...fakeIndex, builtAt: 'after-write' } as unknown as WorldIndex
    api.indexBuild.mockResolvedValue(after)
    const refreshing = useWorldIndexStore.getState().refresh('/lib')

    first.resolve(fakeIndex)
    await building
    await refreshing
    expect(api.indexBuild).toHaveBeenCalledTimes(2)
    expect(useWorldIndexStore.getState().index).toBe(after)
  })

  it('collapses two saves during one build onto a single follow-up build', async () => {
    activate('/lib')
    const first = deferred<WorldIndex>()
    api.indexBuild.mockReturnValueOnce(first.promise)
    const building = useWorldIndexStore.getState().build('/lib')

    api.indexBuild.mockResolvedValue(fakeIndex)
    const a = useWorldIndexStore.getState().refresh('/lib')
    const b = useWorldIndexStore.getState().refresh('/lib')

    first.resolve(fakeIndex)
    await Promise.all([building, a, b])
    // One for the original build, one shared follow-up — not one per save.
    expect(api.indexBuild).toHaveBeenCalledTimes(2)
  })

  it('does nothing without a library', async () => {
    await useWorldIndexStore.getState().refresh(null)
    expect(api.indexBuild).not.toHaveBeenCalled()
  })

  it('records a failed refresh instead of throwing at the caller', async () => {
    activate('/lib')
    api.indexBuild.mockRejectedValue(new Error('disk gone'))
    await useWorldIndexStore.getState().refresh('/lib')
    expect(useWorldIndexStore.getState().buildError).toBe('disk gone')
    expect(useWorldIndexStore.getState().building).toBe(false)
  })
})

describe('refresh after a failed build', () => {
  // The in-flight build is waited out, not joined — including when it fails.
  // A failed build must not stop the refresh that follows it from running.
  it('still rebuilds when the build it waited on rejected', async () => {
    activate('/lib')
    const first = deferred<WorldIndex>()
    api.indexBuild.mockReturnValueOnce(first.promise as unknown as Promise<WorldIndex>)
    const building = useWorldIndexStore.getState().build('/lib')

    api.indexBuild.mockResolvedValue(fakeIndex)
    const refreshing = useWorldIndexStore.getState().refresh('/lib')

    first.reject(new Error('first build failed'))
    await building
    await refreshing
    expect(api.indexBuild).toHaveBeenCalledTimes(2)
    expect(useWorldIndexStore.getState().index).toBe(fakeIndex)
  })
})
