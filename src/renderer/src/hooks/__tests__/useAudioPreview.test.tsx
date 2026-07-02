import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAudioPreview } from '../useAudioPreview'

// jsdom implements neither URL.createObjectURL nor HTMLMediaElement.play; stub
// both so the hook's blob-URL + <audio> lifecycle is exercisable.
let createObjectURL: ReturnType<typeof vi.fn>
let revokeObjectURL: ReturnType<typeof vi.fn>
let play: ReturnType<typeof vi.fn>
let pause: ReturnType<typeof vi.fn>

beforeEach(() => {
  let n = 0
  createObjectURL = vi.fn(() => `blob:mock/${++n}`)
  revokeObjectURL = vi.fn()
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
  vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
  HTMLMediaElement.prototype.play = play
  HTMLMediaElement.prototype.pause = pause
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const bytes = { bytes: [1, 2, 3], mime: 'audio/mpeg' }

describe('useAudioPreview', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useAudioPreview())
    expect(result.current.playing).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.isPlaying(true)).toBe(false)
  })

  it('plays a track: creates a blob URL and marks the key playing', async () => {
    const { result } = renderHook(() => useAudioPreview())
    await act(async () => {
      await result.current.toggle(true, async () => bytes)
    })
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(play).toHaveBeenCalledOnce()
    expect(result.current.playing).toBe(true)
    expect(result.current.isPlaying(true)).toBe(true)
  })

  it('toggling the same key stops and revokes the blob URL', async () => {
    const { result } = renderHook(() => useAudioPreview())
    await act(async () => {
      await result.current.toggle(true, async () => bytes)
    })
    await act(async () => {
      await result.current.toggle(true, async () => bytes)
    })
    expect(pause).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock/1')
    expect(result.current.playing).toBeNull()
  })

  it('is a no-op when load resolves null', async () => {
    const load = vi.fn(async () => null)
    const { result } = renderHook(() => useAudioPreview())
    await act(async () => {
      await result.current.toggle(true, load)
    })
    expect(load).toHaveBeenCalledOnce()
    expect(play).not.toHaveBeenCalled()
    expect(result.current.playing).toBeNull()
  })

  it('sets error from a thrown Error and stays stopped', async () => {
    const { result } = renderHook(() => useAudioPreview())
    await act(async () => {
      await result.current.toggle(true, async () => {
        throw new Error('boom')
      })
    })
    expect(result.current.error).toBe('boom')
    expect(result.current.playing).toBeNull()
  })

  it('uses the fallback message for a non-Error throw', async () => {
    const { result } = renderHook(() => useAudioPreview('Failed to play music'))
    await act(async () => {
      await result.current.toggle(true, async () => {
        throw 'nope'
      })
    })
    expect(result.current.error).toBe('Failed to play music')
  })

  it('switches between keyed tracks (list semantics)', async () => {
    const { result } = renderHook(() => useAudioPreview<number>())
    await act(async () => {
      await result.current.toggle(1, async () => bytes)
    })
    expect(result.current.isPlaying(1)).toBe(true)
    await act(async () => {
      await result.current.toggle(2, async () => bytes)
    })
    expect(result.current.isPlaying(1)).toBe(false)
    expect(result.current.isPlaying(2)).toBe(true)
    // Switching revokes the first track's URL and creates a second.
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock/1')
    expect(createObjectURL).toHaveBeenCalledTimes(2)
  })

  it('stop() clears playing and error', async () => {
    const { result } = renderHook(() => useAudioPreview())
    await act(async () => {
      await result.current.toggle(true, async () => {
        throw new Error('boom')
      })
    })
    expect(result.current.error).toBe('boom')
    act(() => result.current.stop())
    await waitFor(() => expect(result.current.error).toBeNull())
    expect(result.current.playing).toBeNull()
  })

  it('revokes the blob URL on unmount', async () => {
    const { result, unmount } = renderHook(() => useAudioPreview())
    await act(async () => {
      await result.current.toggle(true, async () => bytes)
    })
    unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock/1')
  })
})
