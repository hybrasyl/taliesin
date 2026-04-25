import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useMusicPacks } from '../useMusicPacks'
import { installMockApi, type MockApi } from '../../__tests__/setup/mockApi'

let api: MockApi

function makePack(id: string, name = 'Pack', tracks: MusicPackTrack[] = []): MusicPack {
  return {
    id,
    name,
    description: '',
    tracks,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  }
}

beforeEach(() => {
  api = installMockApi()
  api.musicPacksLoad.mockResolvedValue([])
  api.musicPacksSave.mockResolvedValue(undefined)
})

describe('useMusicPacks', () => {
  it('returns empty state and skips IPC when libraryDir is null', async () => {
    const { result } = renderHook(() => useMusicPacks(null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.packs).toEqual([])
    expect(result.current.selectedPack).toBeNull()
    expect(api.musicPacksLoad).not.toHaveBeenCalled()
  })

  it('loads packs from disk when libraryDir is provided', async () => {
    const seed = [makePack('p1', 'Alpha'), makePack('p2', 'Beta')]
    api.musicPacksLoad.mockResolvedValue(seed)

    const { result } = renderHook(() => useMusicPacks('/lib'))
    await waitFor(() => expect(result.current.packs).toEqual(seed))
    expect(api.musicPacksLoad).toHaveBeenCalledWith('/lib')
  })

  it('createPack appends a pack, persists, and selects it', async () => {
    const { result } = renderHook(() => useMusicPacks('/lib'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let created: MusicPack | undefined
    await act(async () => { created = await result.current.createPack('New Pack') })
    expect(created?.name).toBe('New Pack')
    expect(api.musicPacksSave).toHaveBeenCalledWith('/lib', expect.arrayContaining([created]))
    expect(result.current.selectedPackId).toBe(created!.id)
    expect(result.current.selectedPack).toEqual(created)
  })

  it('renamePack updates name and bumps updatedAt', async () => {
    const seed = [makePack('p1', 'Old')]
    api.musicPacksLoad.mockResolvedValue(seed)
    const { result } = renderHook(() => useMusicPacks('/lib'))
    await waitFor(() => expect(result.current.packs.length).toBe(1))

    await act(async () => { await result.current.renamePack('p1', 'Renamed') })
    expect(result.current.packs[0].name).toBe('Renamed')
    expect(result.current.packs[0].updatedAt).not.toBe('2024-01-01T00:00:00Z')
  })

  it('deletePack removes the pack and clears selection if it was selected', async () => {
    const seed = [makePack('p1'), makePack('p2')]
    api.musicPacksLoad.mockResolvedValue(seed)
    const { result } = renderHook(() => useMusicPacks('/lib'))
    await waitFor(() => expect(result.current.packs.length).toBe(2))

    act(() => result.current.setSelectedPackId('p1'))
    await act(async () => { await result.current.deletePack('p1') })

    expect(result.current.packs.map((p) => p.id)).toEqual(['p2'])
    expect(result.current.selectedPackId).toBe('p2') // falls back to first remaining
  })

  it('deletePack with no remaining packs sets selection to null', async () => {
    const seed = [makePack('only')]
    api.musicPacksLoad.mockResolvedValue(seed)
    const { result } = renderHook(() => useMusicPacks('/lib'))
    await waitFor(() => expect(result.current.packs.length).toBe(1))

    act(() => result.current.setSelectedPackId('only'))
    await act(async () => { await result.current.deletePack('only') })
    expect(result.current.selectedPackId).toBeNull()
  })

  it('addTrack appends a track and ignores duplicates by sourceFile', async () => {
    const seed = [makePack('p1')]
    api.musicPacksLoad.mockResolvedValue(seed)
    const { result } = renderHook(() => useMusicPacks('/lib'))
    await waitFor(() => expect(result.current.packs.length).toBe(1))

    await act(async () => { await result.current.addTrack('p1', '/m/song.mp3', 7) })
    expect(result.current.packs[0].tracks).toEqual([{ musicId: 7, sourceFile: '/m/song.mp3' }])

    // Duplicate sourceFile should be a no-op (same array reference returned by hook)
    await act(async () => { await result.current.addTrack('p1', '/m/song.mp3', 99) })
    expect(result.current.packs[0].tracks).toEqual([{ musicId: 7, sourceFile: '/m/song.mp3' }])
  })

  it('removeTrack drops the matching track', async () => {
    const seed = [makePack('p1', 'P', [
      { musicId: 1, sourceFile: '/a.mp3' },
      { musicId: 2, sourceFile: '/b.mp3' },
    ])]
    api.musicPacksLoad.mockResolvedValue(seed)
    const { result } = renderHook(() => useMusicPacks('/lib'))
    await waitFor(() => expect(result.current.packs[0].tracks).toHaveLength(2))

    await act(async () => { await result.current.removeTrack('p1', '/a.mp3') })
    expect(result.current.packs[0].tracks).toEqual([{ musicId: 2, sourceFile: '/b.mp3' }])
  })

  it('updateTrackId changes the musicId for the matching track', async () => {
    const seed = [makePack('p1', 'P', [{ musicId: 1, sourceFile: '/a.mp3' }])]
    api.musicPacksLoad.mockResolvedValue(seed)
    const { result } = renderHook(() => useMusicPacks('/lib'))
    await waitFor(() => expect(result.current.packs[0].tracks).toHaveLength(1))

    await act(async () => { await result.current.updateTrackId('p1', '/a.mp3', 42) })
    expect(result.current.packs[0].tracks[0].musicId).toBe(42)
  })

  it('reorderTracks replaces the tracks array wholesale', async () => {
    const seed = [makePack('p1', 'P', [
      { musicId: 1, sourceFile: '/a.mp3' },
      { musicId: 2, sourceFile: '/b.mp3' },
    ])]
    api.musicPacksLoad.mockResolvedValue(seed)
    const { result } = renderHook(() => useMusicPacks('/lib'))
    await waitFor(() => expect(result.current.packs[0].tracks).toHaveLength(2))

    const reordered: MusicPackTrack[] = [
      { musicId: 2, sourceFile: '/b.mp3' },
      { musicId: 1, sourceFile: '/a.mp3' },
    ]
    await act(async () => { await result.current.reorderTracks('p1', reordered) })
    expect(result.current.packs[0].tracks).toEqual(reordered)
  })

  it('deployPack calls musicDeployPack with the resolved pack', async () => {
    const pack = makePack('p1', 'Deploy Me', [{ musicId: 1, sourceFile: '/a.mp3' }])
    api.musicPacksLoad.mockResolvedValue([pack])
    api.musicDeployPack.mockResolvedValue(undefined)
    const { result } = renderHook(() => useMusicPacks('/lib'))
    await waitFor(() => expect(result.current.packs.length).toBe(1))

    await act(async () => {
      await result.current.deployPack('p1', '/lib', '/dest', '/usr/bin/ffmpeg', 96, 44100)
    })
    expect(api.musicDeployPack).toHaveBeenCalledWith('/lib', pack, '/dest', '/usr/bin/ffmpeg', 96, 44100)
  })

  it('deployPack throws when the pack id is unknown', async () => {
    const { result } = renderHook(() => useMusicPacks('/lib'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await expect(
      result.current.deployPack('missing', '/lib', '/dest', null, 64, 22050),
    ).rejects.toThrow(/Pack missing not found/)
  })
})
