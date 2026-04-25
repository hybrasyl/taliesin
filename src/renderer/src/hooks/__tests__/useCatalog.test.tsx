import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import {
  useCatalog,
  parseMapFilename,
  xmlPrefix,
  worldName,
  buildMapXmlStub,
} from '../useCatalog'
import { installMockApi, type MockApi } from '../../__tests__/setup/mockApi'

let api: MockApi

beforeEach(() => {
  api = installMockApi()
  api.catalogLoad.mockResolvedValue({})
  api.catalogScan.mockResolvedValue([])
  api.catalogSave.mockResolvedValue(undefined)
})

// ── Pure helpers ──────────────────────────────────────────────────────────────

describe('parseMapFilename', () => {
  it('parses a canonical lod###.map filename', () => {
    expect(parseMapFilename('lod00500.map')).toEqual({ mapNumber: 500, variant: null })
  })
  it('parses a variant filename', () => {
    expect(parseMapFilename('lod00500-summer.map')).toEqual({ mapNumber: 500, variant: 'summer' })
  })
  it('returns null for non-map filenames', () => {
    expect(parseMapFilename('readme.txt')).toBeNull()
    expect(parseMapFilename('lod.map')).toBeNull()
  })
  it('is case-insensitive on the .map extension', () => {
    expect(parseMapFilename('lod00500.MAP')).toEqual({ mapNumber: 500, variant: null })
  })
})

describe('xmlPrefix', () => {
  it('returns lod for ids < 30000', () => {
    expect(xmlPrefix(1)).toBe('lod')
    expect(xmlPrefix(29999)).toBe('lod')
  })
  it('returns hyb for ids ≥ 30000', () => {
    expect(xmlPrefix(30000)).toBe('hyb')
    expect(xmlPrefix(99999)).toBe('hyb')
  })
})

describe('worldName', () => {
  it('returns the segment two levels up from world/xml', () => {
    expect(worldName('/repos/loures/world/xml')).toBe('loures')
    expect(worldName('C:\\repos\\loures\\world\\xml')).toBe('loures')
  })
  it('handles trailing slashes', () => {
    expect(worldName('/repos/loures/world/xml/')).toBe('loures')
  })
  it('falls back to last segment when path is too shallow', () => {
    expect(worldName('/foo')).toBe('foo')
  })
})

describe('buildMapXmlStub', () => {
  it('emits a valid xml header with the given fields', () => {
    const xml = buildMapXmlStub(123, 'My Map', 40, 60)
    expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>')
    expect(xml).toContain('Id="123"')
    expect(xml).toContain('Name="My Map"')
    expect(xml).toContain('X="40"')
    expect(xml).toContain('Y="60"')
  })
  it('escapes special characters in the name', () => {
    const xml = buildMapXmlStub(1, 'A & "B" <C>', 10, 10)
    expect(xml).toContain('Name="A &amp; &quot;B&quot; &lt;C&gt;"')
  })
})

// ── Hook ──────────────────────────────────────────────────────────────────────

describe('useCatalog', () => {
  it('returns empty state when dirPath is null', async () => {
    const { result } = renderHook(() => useCatalog(null))
    await waitFor(() => expect(result.current.scanning).toBe(false))
    expect(result.current.entries).toEqual([])
    expect(result.current.selectedEntry).toBeNull()
    expect(api.catalogLoad).not.toHaveBeenCalled()
  })

  it('loads catalog when dirPath is set', async () => {
    api.catalogLoad.mockResolvedValue({ 'lod00001.map': { name: 'Hut' } })
    renderHook(() => useCatalog('/maps'))
    await waitFor(() => expect(api.catalogLoad).toHaveBeenCalledWith('/maps'))
  })

  it('scan() merges scanned files with catalog metadata, sorted by map number', async () => {
    api.catalogScan.mockResolvedValue([
      { filename: 'lod00010.map', sizeBytes: 100 },
      { filename: 'lod00010-summer.map', sizeBytes: 100 },
      { filename: 'lod00005.map', sizeBytes: 100 },
      { filename: 'readme.txt', sizeBytes: 1 }, // ignored
    ])
    api.catalogLoad.mockResolvedValue({
      'lod00010.map': { name: 'Town', notes: 'big' },
    })
    const { result } = renderHook(() => useCatalog('/maps'))
    await waitFor(() => expect(api.catalogLoad).toHaveBeenCalled())

    await act(async () => { await result.current.scan() })

    expect(result.current.entries.map((e) => e.filename)).toEqual([
      'lod00005.map',
      'lod00010.map',
      'lod00010-summer.map',
    ])
    expect(result.current.entries[1].name).toBe('Town')
    expect(result.current.entries[1].notes).toBe('big')
  })

  it('select(filename) populates the draft from the matching entry', async () => {
    api.catalogScan.mockResolvedValue([{ filename: 'lod00001.map', sizeBytes: 100 }])
    api.catalogLoad.mockResolvedValue({
      'lod00001.map': { name: 'Inn', notes: 'cozy', width: 20, height: 30 },
    })
    const { result } = renderHook(() => useCatalog('/maps'))
    await waitFor(() => expect(api.catalogLoad).toHaveBeenCalled())
    await act(async () => { await result.current.scan() })

    act(() => result.current.select('lod00001.map'))
    expect(result.current.selectedFilename).toBe('lod00001.map')
    expect(result.current.draft).toEqual({ name: 'Inn', notes: 'cozy', width: 20, height: 30 })
    expect(result.current.dirty).toBe(false)
  })

  it('select(null) clears the draft', async () => {
    const { result } = renderHook(() => useCatalog('/maps'))
    await waitFor(() => expect(result.current.scanning).toBe(false))
    act(() => result.current.select(null))
    expect(result.current.selectedFilename).toBeNull()
    expect(result.current.draft).toEqual({})
  })

  it('updateDraft sets dirty', async () => {
    const { result } = renderHook(() => useCatalog('/maps'))
    await waitFor(() => expect(result.current.scanning).toBe(false))
    act(() => result.current.updateDraft({ name: 'Edited' }))
    expect(result.current.dirty).toBe(true)
    expect(result.current.draft.name).toBe('Edited')
  })

  it('save() merges draft into catalog and persists via IPC', async () => {
    api.catalogScan.mockResolvedValue([{ filename: 'lod00001.map', sizeBytes: 100 }])
    api.catalogLoad.mockResolvedValue({})
    const { result } = renderHook(() => useCatalog('/maps'))
    await waitFor(() => expect(api.catalogLoad).toHaveBeenCalled())
    await act(async () => { await result.current.scan() })

    act(() => result.current.select('lod00001.map'))
    act(() => result.current.updateDraft({ name: 'Saved Name' }))
    await act(async () => { await result.current.save() })

    expect(api.catalogSave).toHaveBeenCalledWith('/maps', {
      'lod00001.map': expect.objectContaining({ name: 'Saved Name' }),
    })
    expect(result.current.dirty).toBe(false)
  })

  it('save() with overrides merges them atomically', async () => {
    api.catalogScan.mockResolvedValue([{ filename: 'lod00001.map', sizeBytes: 100 }])
    api.catalogLoad.mockResolvedValue({})
    const { result } = renderHook(() => useCatalog('/maps'))
    await waitFor(() => expect(api.catalogLoad).toHaveBeenCalled())
    await act(async () => { await result.current.scan() })

    act(() => result.current.select('lod00001.map'))
    act(() => result.current.updateDraft({ name: 'A' }))
    await act(async () => { await result.current.save({ width: 80, height: 60 }) })

    expect(api.catalogSave).toHaveBeenCalledWith('/maps', {
      'lod00001.map': expect.objectContaining({ name: 'A', width: 80, height: 60 }),
    })
  })

  it('appendNote concatenates new note onto existing notes with a newline', async () => {
    api.catalogScan.mockResolvedValue([{ filename: 'lod00001.map', sizeBytes: 100 }])
    api.catalogLoad.mockResolvedValue({ 'lod00001.map': { notes: 'first' } })
    const { result } = renderHook(() => useCatalog('/maps'))
    await waitFor(() => expect(api.catalogLoad).toHaveBeenCalled())
    await act(async () => { await result.current.scan() })

    await act(async () => { await result.current.appendNote('lod00001.map', 'second') })
    expect(api.catalogSave).toHaveBeenCalledWith('/maps', {
      'lod00001.map': expect.objectContaining({ notes: 'first\nsecond' }),
    })
  })
})
