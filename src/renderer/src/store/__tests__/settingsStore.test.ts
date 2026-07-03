import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSettingsStore, deriveMapFilesDirectory, DEFAULT_SETTINGS } from '../settingsStore'
import { installMockApi, type MockApi } from '../../__tests__/setup/mockApi'

let api: MockApi

function resetStore() {
  useSettingsStore.setState({
    ...DEFAULT_SETTINGS,
    libraries: [],
    mapDirectories: [],
    musicWorkingDirs: []
  })
}

beforeEach(() => {
  api = installMockApi()
  resetStore()
})

describe('deriveMapFilesDirectory', () => {
  it('returns null when no library is active', () => {
    expect(deriveMapFilesDirectory(null)).toBeNull()
  })

  it('swaps the trailing xml segment for a sibling mapfiles dir', () => {
    expect(deriveMapFilesDirectory('/world/xml')).toBe('/world/mapfiles')
  })

  it('normalizes backslashes and strips trailing slashes', () => {
    expect(deriveMapFilesDirectory('C:\\world\\xml\\')).toBe('C:/world/mapfiles')
  })

  it('returns null when there is no parent segment', () => {
    expect(deriveMapFilesDirectory('xml')).toBeNull()
    expect(deriveMapFilesDirectory('/xml')).toBeNull()
  })
})

describe('settingsStore setters', () => {
  it('each setter updates its field', () => {
    const s = useSettingsStore.getState()
    s.setTheme('chadul')
    s.setClientPath('/client')
    s.setLibraries(['a', 'b'])
    s.setMusEncodeKbps(128)
    const next = useSettingsStore.getState()
    expect(next.theme).toBe('chadul')
    expect(next.clientPath).toBe('/client')
    expect(next.libraries).toEqual(['a', 'b'])
    expect(next.musEncodeKbps).toBe(128)
  })
})

describe('settingsStore.hydrate', () => {
  it('loads and coerces well-typed persisted settings', async () => {
    api.loadSettings.mockResolvedValue({
      theme: 'danaan',
      clientPath: '/client',
      libraries: ['libA'],
      mapDirectories: [{ path: '/m', name: 'M' }],
      musEncodeKbps: 96
    })
    await useSettingsStore.getState().hydrate()
    const s = useSettingsStore.getState()
    expect(s.theme).toBe('danaan')
    expect(s.clientPath).toBe('/client')
    expect(s.libraries).toEqual(['libA'])
    expect(s.mapDirectories).toEqual([{ path: '/m', name: 'M' }])
    expect(s.musEncodeKbps).toBe(96)
  })

  it('ignores wrong-typed / unknown-theme fields (coerce guards)', async () => {
    api.loadSettings.mockResolvedValue({
      theme: 'not-a-theme',
      clientPath: 123,
      libraries: 'nope',
      musEncodeKbps: 'fast'
    })
    await useSettingsStore.getState().hydrate()
    const s = useSettingsStore.getState()
    expect(s.theme).toBe('hybrasyl') // default kept
    expect(s.clientPath).toBeNull()
    expect(s.libraries).toEqual([])
    expect(s.musEncodeKbps).toBe(64)
  })
})

describe('settingsStore persistence', () => {
  it('debounces a setter change into a single saveSettings call', () => {
    vi.useFakeTimers()
    try {
      // Drain any pending suppress/timer from earlier writes, then start clean.
      useSettingsStore.getState().setClientPath('/warmup')
      vi.advanceTimersByTime(200)
      api.saveSettings.mockClear()

      useSettingsStore.getState().setActiveLibrary('/world/xml')
      useSettingsStore.getState().setActiveLibrary('/world2/xml')
      // Not yet — still within the debounce window.
      expect(api.saveSettings).not.toHaveBeenCalled()
      vi.advanceTimersByTime(200)
      expect(api.saveSettings).toHaveBeenCalledTimes(1)
      expect(api.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ activeLibrary: '/world2/xml' })
      )
    } finally {
      vi.useRealTimers()
    }
  })
})
