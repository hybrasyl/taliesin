import React from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import IndexCacheSection, { formatSize } from '../IndexCacheSection'
import { installMockApi, type MockApi } from '../../__tests__/setup/mockApi'

// Settings → World indexes (HTOO-583). Which caches are old is hybindex-ts's
// decision, tested in that package; this checks what the card does with the
// answer. The removal itself is driven through the built app in
// e2e/index-caches.spec.js.

const entry = (over: Partial<IndexCacheEntry> = {}): IndexCacheEntry => ({
  dir: '/cache/v5/world-abc',
  schemaVersion: 5,
  worldKey: 'world-abc',
  libraryPath: '/worlds/world/xml',
  builtAt: '2026-10-30T00:00:00.000Z',
  sizeBytes: 2048,
  removeReason: null,
  ...over
})

const OLD_SCHEMA = entry({
  dir: '/cache/v4/world-abc',
  schemaVersion: 4,
  sizeBytes: 1536,
  removeReason: 'oldSchema'
})
const MOVED = entry({
  dir: '/cache/v5/old-def',
  worldKey: 'old-def',
  libraryPath: '/worlds/moved/xml',
  sizeBytes: 512,
  removeReason: 'missingWorld'
})

let api: MockApi

beforeEach(() => {
  api = installMockApi()
  api.indexListCaches.mockResolvedValue([OLD_SCHEMA, entry(), MOVED])
  api.indexPruneCaches.mockResolvedValue([OLD_SCHEMA, MOVED])
})

describe('IndexCacheSection', () => {
  it('removes nothing until asked: it lists first', async () => {
    render(<IndexCacheSection />)
    expect(api.indexListCaches).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Find old indexes' }))
    expect(api.indexListCaches).toHaveBeenCalledTimes(1)
    expect(api.indexPruneCaches).not.toHaveBeenCalled()
  })

  it('lists only the caches that hybindex-ts marks, with the reason and the size', async () => {
    render(<IndexCacheSection />)
    await userEvent.click(screen.getByRole('button', { name: 'Find old indexes' }))
    const items = (await screen.findByTestId('old-index-list')).querySelectorAll('li')
    expect([...items].map((li) => li.textContent)).toEqual([
      '/worlds/world/xml (v4, 1.5 KB): An older index version',
      '/worlds/moved/xml (v5, 512 B): The world folder is gone'
    ])
    expect(screen.getByRole('button', { name: /^Remove 2 \(2\.0 KB\)$/ })).toBeInTheDocument()
  })

  it('names a cache with no _meta.json by its folder', async () => {
    api.indexListCaches.mockResolvedValue([
      entry({ libraryPath: null, worldKey: 'lost-123', removeReason: 'missingWorld' })
    ])
    render(<IndexCacheSection />)
    await userEvent.click(screen.getByRole('button', { name: 'Find old indexes' }))
    expect((await screen.findByTestId('old-index-list')).textContent).toContain('lost-123')
  })

  it('removes on the Remove button and says what it removed', async () => {
    render(<IndexCacheSection />)
    await userEvent.click(screen.getByRole('button', { name: 'Find old indexes' }))
    await userEvent.click(await screen.findByRole('button', { name: /^Remove 2/ }))
    expect(api.indexPruneCaches).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Removed 2 old indexes (2.0 KB).')).toBeInTheDocument()
    expect(screen.queryByTestId('old-index-list')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull()
  })

  it('says so when there is nothing to remove, and offers no Remove', async () => {
    api.indexListCaches.mockResolvedValue([entry()])
    render(<IndexCacheSection />)
    await userEvent.click(screen.getByRole('button', { name: 'Find old indexes' }))
    expect(await screen.findByText('No old indexes.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull()
  })

  // Creidhne's card has no catch: a failed IPC call is an unhandled rejection
  // and the card says nothing. This one says what failed.
  it('says what failed when the list or the removal throws', async () => {
    api.indexListCaches.mockRejectedValueOnce(new Error('EACCES'))
    render(<IndexCacheSection />)
    await userEvent.click(screen.getByRole('button', { name: 'Find old indexes' }))
    expect(await screen.findByText('Could not list the indexes: EACCES')).toBeInTheDocument()

    api.indexPruneCaches.mockRejectedValueOnce(new Error('EBUSY'))
    await userEvent.click(screen.getByRole('button', { name: 'Find old indexes' }))
    await userEvent.click(await screen.findByRole('button', { name: /^Remove 2/ }))
    expect(await screen.findByText('Could not remove the indexes: EBUSY')).toBeInTheDocument()
    // The list stays, so the user can try again.
    expect(screen.getByTestId('old-index-list')).toBeInTheDocument()
  })

  it('formats sizes', () => {
    expect(formatSize(0)).toBe('0 B')
    expect(formatSize(1023)).toBe('1023 B')
    expect(formatSize(2560)).toBe('2.5 KB')
    expect(formatSize(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
