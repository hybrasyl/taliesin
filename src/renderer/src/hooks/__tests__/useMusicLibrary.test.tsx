import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import {
  useMusicLibrary,
  formatDuration,
  cleanupMeta,
  migrateLongTagsToDescription,
  countEntriesWithLongTags,
  needsEnrichment,
  MAX_TAG_LENGTH
} from '../useMusicLibrary'
import { installMockApi, type MockApi } from '../../__tests__/setup/mockApi'

let api: MockApi

beforeEach(() => {
  api = installMockApi()
  api.musicScan.mockResolvedValue([])
  api.musicMetadataLoad.mockResolvedValue({})
  api.musicMetadataSave.mockResolvedValue(undefined)
  api.deleteFile.mockResolvedValue(undefined)
})

// ── formatDuration ────────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('formats whole seconds as M:SS with zero-padded seconds', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(5)).toBe('0:05')
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(194)).toBe('3:14')
    expect(formatDuration(3599)).toBe('59:59')
    expect(formatDuration(3600)).toBe('60:00')
  })
  it('rounds fractional seconds', () => {
    expect(formatDuration(59.5)).toBe('1:00')
    expect(formatDuration(59.4)).toBe('0:59')
  })
  it('returns null for null/undefined/negative/non-finite', () => {
    expect(formatDuration(null)).toBeNull()
    expect(formatDuration(undefined)).toBeNull()
    expect(formatDuration(-1)).toBeNull()
    expect(formatDuration(Number.NaN)).toBeNull()
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

// ── cleanupMeta ───────────────────────────────────────────────────────────────

describe('cleanupMeta', () => {
  it('returns changed=false when nothing needs fixing', () => {
    const meta: MusicMeta = { name: 'song', tags: ['rock', 'fast'] }
    const out = cleanupMeta(meta)
    expect(out.changed).toBe(false)
    expect(out.meta).toBe(meta)
  })

  it('flattens nested-array tags from older buggy writes', () => {
    const meta = { name: 'x', tags: [['a', 'b'], 'c'] as unknown as string[] }
    const out = cleanupMeta(meta)
    expect(out.changed).toBe(true)
    expect(out.meta.tags).toEqual(['a', 'b', 'c'])
  })

  it('moves overlong tags into description', () => {
    const long = 'x'.repeat(MAX_TAG_LENGTH + 1)
    const out = cleanupMeta({ name: 'x', tags: ['short', long] })
    expect(out.changed).toBe(true)
    expect(out.meta.tags).toEqual(['short'])
    expect(out.meta.description).toBe(long)
  })

  it('discards an overlong tag when it duplicates the prompt', () => {
    const long = 'y'.repeat(MAX_TAG_LENGTH + 1)
    const out = cleanupMeta({ name: 'x', tags: [long], prompt: long })
    expect(out.meta.description).toBeUndefined()
    expect(out.meta.tags).toEqual([])
  })

  it('clears description when it equals the prompt', () => {
    const out = cleanupMeta({ name: 'x', tags: [], description: 'same', prompt: 'same' })
    expect(out.meta.description).toBeUndefined()
  })
})

// ── migrateLongTagsToDescription ──────────────────────────────────────────────

describe('migrateLongTagsToDescription', () => {
  it('processes every entry and counts changes', () => {
    const long = 'q'.repeat(MAX_TAG_LENGTH + 1)
    const meta: Record<string, MusicMeta> = {
      'a.mus': { name: 'A', tags: ['ok'] },
      'b.mus': { name: 'B', tags: [long] },
      'c.mus': { name: 'C', tags: [['nested', 'arr']] as unknown as string[] }
    }
    const result = migrateLongTagsToDescription(meta)
    expect(result.movedCount).toBe(2) // b and c changed; a did not
    expect(result.updated['b.mus'].description).toBe(long)
    expect(result.updated['c.mus'].tags).toEqual(['nested', 'arr'])
  })
})

// ── countEntriesWithLongTags ──────────────────────────────────────────────────

describe('countEntriesWithLongTags', () => {
  it('counts entries with overlong or nested tag arrays', () => {
    const long = 'z'.repeat(MAX_TAG_LENGTH + 1)
    const meta: Record<string, MusicMeta> = {
      a: { tags: ['short'] },
      b: { tags: [long] },
      c: { tags: [['nested']] as unknown as string[] },
      d: {}
    }
    expect(countEntriesWithLongTags(meta)).toBe(2)
  })
})

// ── needsEnrichment ───────────────────────────────────────────────────────────

describe('needsEnrichment', () => {
  it('returns true for missing meta or missing fields', () => {
    expect(needsEnrichment(undefined)).toBe(true)
    expect(needsEnrichment({})).toBe(true)
    expect(needsEnrichment({ name: 'x' })).toBe(true) // no duration
    expect(needsEnrichment({ name: 'x', duration: 0 })).toBe(false)
  })
})

// ── useMusicLibrary hook ──────────────────────────────────────────────────────

describe('useMusicLibrary', () => {
  it('returns empty state when dirPath is null', async () => {
    const { result } = renderHook(() => useMusicLibrary(null))
    await waitFor(() => expect(result.current.scanning).toBe(false))
    expect(result.current.entries).toEqual([])
    expect(result.current.metadata).toEqual({})
    expect(api.musicScan).not.toHaveBeenCalled()
  })

  it('auto-scans and loads metadata when dirPath is set', async () => {
    api.musicScan.mockResolvedValue([
      { filename: '1.mus', sizeBytes: 100 },
      { filename: '2.mus', sizeBytes: 200 }
    ])
    api.musicMetadataLoad.mockResolvedValue({ '1.mus': { name: 'Track One', duration: 60 } })

    const { result } = renderHook(() => useMusicLibrary('/lib'))
    await waitFor(() => expect(result.current.scanning).toBe(false))

    expect(api.musicScan).toHaveBeenCalledWith('/lib')
    expect(api.musicMetadataLoad).toHaveBeenCalledWith('/lib')
    expect(result.current.entries.map((e) => e.filename)).toEqual(['1.mus', '2.mus'])
    expect(result.current.metadata['1.mus'].name).toBe('Track One')
  })

  it('sorts numeric .mus files by id and non-numeric files alphabetically after', async () => {
    api.musicScan.mockResolvedValue([
      { filename: 'b.flac', sizeBytes: 1 },
      { filename: '10.mus', sizeBytes: 1 },
      { filename: 'a.flac', sizeBytes: 1 },
      { filename: '2.mus', sizeBytes: 1 }
    ])
    const { result } = renderHook(() => useMusicLibrary('/lib'))
    await waitFor(() => expect(result.current.entries.length).toBe(4))
    expect(result.current.entries.map((e) => e.filename)).toEqual([
      '2.mus',
      '10.mus',
      'a.flac',
      'b.flac'
    ])
  })

  it('parses musicId only for ###.mus filenames', async () => {
    api.musicScan.mockResolvedValue([
      { filename: '5.mus', sizeBytes: 1 },
      { filename: 'song.mus', sizeBytes: 1 },
      { filename: '7.flac', sizeBytes: 1 }
    ])
    const { result } = renderHook(() => useMusicLibrary('/lib'))
    await waitFor(() => expect(result.current.entries.length).toBe(3))
    const byFilename = Object.fromEntries(
      result.current.entries.map((e) => [e.filename, e.musicId])
    )
    expect(byFilename['5.mus']).toBe(5)
    expect(byFilename['song.mus']).toBeNull()
    expect(byFilename['7.flac']).toBeNull()
  })

  it('select() populates the draft without re-enrichment for already-enriched entries', async () => {
    api.musicScan.mockResolvedValue([{ filename: '1.mus', sizeBytes: 100 }])
    api.musicMetadataLoad.mockResolvedValue({
      '1.mus': { name: 'Done', duration: 60, tags: ['x'] }
    })
    const { result } = renderHook(() => useMusicLibrary('/lib'))
    await waitFor(() => expect(result.current.scanning).toBe(false))

    await act(async () => {
      await result.current.select('1.mus')
    })
    expect(result.current.draft.name).toBe('Done')
    expect(api.musicReadFileMeta).not.toHaveBeenCalled()
  })

  it('updateDraft sets dirty', async () => {
    const { result } = renderHook(() => useMusicLibrary('/lib'))
    await waitFor(() => expect(result.current.scanning).toBe(false))
    act(() => result.current.updateDraft({ name: 'Edit' }))
    expect(result.current.dirty).toBe(true)
    expect(result.current.draft.name).toBe('Edit')
  })

  it('save() persists merged metadata and clears dirty', async () => {
    api.musicScan.mockResolvedValue([{ filename: '1.mus', sizeBytes: 100 }])
    api.musicMetadataLoad.mockResolvedValue({ '1.mus': { name: 'Old', duration: 1 } })
    const { result } = renderHook(() => useMusicLibrary('/lib'))
    await waitFor(() => expect(result.current.scanning).toBe(false))

    await act(async () => {
      await result.current.select('1.mus')
    })
    act(() => result.current.updateDraft({ name: 'New' }))
    await act(async () => {
      await result.current.save()
    })

    expect(api.musicMetadataSave).toHaveBeenCalledWith(
      '/lib',
      expect.objectContaining({
        '1.mus': expect.objectContaining({ name: 'New' })
      })
    )
    expect(result.current.dirty).toBe(false)
  })

  it('remove() deletes file, drops metadata, and clears selection if it was selected', async () => {
    api.musicScan.mockResolvedValue([{ filename: '1.mus', sizeBytes: 100 }])
    api.musicMetadataLoad.mockResolvedValue({ '1.mus': { name: 'Doomed', duration: 1 } })
    const { result } = renderHook(() => useMusicLibrary('/lib'))
    await waitFor(() => expect(result.current.scanning).toBe(false))

    await act(async () => {
      await result.current.select('1.mus')
    })
    await act(async () => {
      await result.current.remove('1.mus')
    })

    expect(api.deleteFile).toHaveBeenCalledWith('/lib/1.mus')
    expect(result.current.entries).toEqual([])
    expect(result.current.selectedFilename).toBeNull()
  })

  it('migrateLongTags() returns 0 when nothing needs migrating', async () => {
    api.musicScan.mockResolvedValue([{ filename: '1.mus', sizeBytes: 100 }])
    api.musicMetadataLoad.mockResolvedValue({
      '1.mus': { name: 'ok', tags: ['short'], duration: 1 }
    })
    const { result } = renderHook(() => useMusicLibrary('/lib'))
    await waitFor(() => expect(result.current.scanning).toBe(false))

    let moved = 0
    await act(async () => {
      moved = await result.current.migrateLongTags()
    })
    expect(moved).toBe(0)
    expect(api.musicMetadataSave).not.toHaveBeenCalled()
  })

  it('migrateLongTags() moves overlong tags and persists the result', async () => {
    const long = 'p'.repeat(MAX_TAG_LENGTH + 1)
    api.musicScan.mockResolvedValue([{ filename: '1.mus', sizeBytes: 100 }])
    api.musicMetadataLoad.mockResolvedValue({ '1.mus': { name: 'x', tags: [long], duration: 1 } })
    const { result } = renderHook(() => useMusicLibrary('/lib'))
    await waitFor(() => expect(result.current.scanning).toBe(false))

    let moved = 0
    await act(async () => {
      moved = await result.current.migrateLongTags()
    })
    expect(moved).toBe(1)
    expect(api.musicMetadataSave).toHaveBeenCalledWith(
      '/lib',
      expect.objectContaining({
        '1.mus': expect.objectContaining({ description: long, tags: [] })
      })
    )
  })
})
