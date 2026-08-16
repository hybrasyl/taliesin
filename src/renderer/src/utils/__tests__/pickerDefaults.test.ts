import { describe, it, expect, beforeEach } from 'vitest'
import {
  dirOf,
  fileIn,
  mapFilesDir,
  brigidAssetsDir,
  packWorkingDir,
  musicDir,
  clientDir
} from '../pickerDefaults'
import { useSettingsStore, DEFAULT_SETTINGS } from '../../store/settingsStore'

/** Put the store back to defaults, so each case states its own preconditions. */
function reset(): void {
  useSettingsStore.setState({ ...DEFAULT_SETTINGS })
}

describe('dirOf', () => {
  it('returns the directory part of a Windows or POSIX path', () => {
    expect(dirOf('E:\\worlds\\prime\\mapfiles\\lod500.map')).toBe('E:\\worlds\\prime\\mapfiles')
    expect(dirOf('/home/s/maps/lod500.map')).toBe('/home/s/maps')
  })

  it('returns undefined for nothing to take a directory from', () => {
    expect(dirOf(null)).toBeUndefined()
    expect(dirOf(undefined)).toBeUndefined()
    expect(dirOf('')).toBeUndefined()
    expect(dirOf('lod500.map')).toBeUndefined()
  })
})

describe('fileIn', () => {
  it('joins the filename onto the directory', () => {
    expect(fileIn('E:\\packs', 'tiles.datf')).toBe('E:\\packs/tiles.datf')
  })

  it('drops a trailing separator so the join does not double it', () => {
    expect(fileIn('E:\\packs\\', 'tiles.datf')).toBe('E:\\packs/tiles.datf')
    expect(fileIn('/packs/', 'tiles.datf')).toBe('/packs/tiles.datf')
  })

  it('keeps the bare filename when there is no directory, so the name is still suggested', () => {
    expect(fileIn(null, 'tiles.datf')).toBe('tiles.datf')
  })
})

describe('settings-backed defaults', () => {
  beforeEach(reset)

  it('return undefined when nothing is configured, which leaves the picker to the OS', () => {
    expect(mapFilesDir()).toBeUndefined()
    expect(brigidAssetsDir()).toBeUndefined()
    expect(packWorkingDir()).toBeUndefined()
    expect(musicDir()).toBeUndefined()
    expect(clientDir()).toBeUndefined()
  })

  it('prefer the active map source over the library the world is in', () => {
    useSettingsStore.setState({
      activeMapDirectory: 'E:\\collections\\prime',
      activeLibrary: 'E:\\worlds\\prime\\xml'
    })
    expect(mapFilesDir()).toBe('E:\\collections\\prime')
  })

  it('fall back to the library mapfiles directory when no map source is active', () => {
    useSettingsStore.setState({ activeLibrary: 'E:/worlds/prime/xml' })
    expect(mapFilesDir()).toBe('E:/worlds/prime/mapfiles')
  })

  it('prefer the active music working directory over the library', () => {
    useSettingsStore.setState({
      activeMusicWorkingDir: 'E:\\audio\\wip',
      musicLibraryPath: 'E:\\audio\\library'
    })
    expect(musicDir()).toBe('E:\\audio\\wip')
    useSettingsStore.setState({ activeMusicWorkingDir: null })
    expect(musicDir()).toBe('E:\\audio\\library')
  })

  it('read the remaining directories straight from settings', () => {
    useSettingsStore.setState({
      brigidAssetsPath: 'E:\\brigid\\assets',
      packDir: 'E:\\packs',
      clientPath: 'C:\\Dark Ages'
    })
    expect(brigidAssetsDir()).toBe('E:\\brigid\\assets')
    expect(packWorkingDir()).toBe('E:\\packs')
    // clientPath is the install directory itself, not an executable.
    expect(clientDir()).toBe('C:\\Dark Ages')
  })
})
