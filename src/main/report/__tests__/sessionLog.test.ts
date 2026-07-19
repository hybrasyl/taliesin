import { describe, it, expect, beforeEach, vi } from 'vitest'

// Stateful in-memory fs: readdir reflects appended/unlinked session files so
// rotation can be asserted end-to-end.
const { fsMock, os, state } = vi.hoisted(() => {
  const state = { files: new Set<string>(), appends: [] as string[], fail: false }
  const base = (p: string) => p.replace(/\\/g, '/').split('/').pop() as string
  return {
    state,
    fsMock: {
      promises: {
        readdir: vi.fn(async () => [...state.files].map(base)),
        unlink: vi.fn(async (p: string) => {
          if (state.fail) throw new Error('EACCES')
          state.files.delete(p.replace(/\\/g, '/'))
        }),
        mkdir: vi.fn(async () => undefined),
        appendFile: vi.fn(async (p: string, data: string) => {
          if (state.fail) throw new Error('EACCES')
          state.files.add(p.replace(/\\/g, '/'))
          if (data) state.appends.push(data)
        })
      }
    },
    os: {
      homedir: vi.fn(() => '/home/alice'),
      userInfo: vi.fn(() => ({ username: 'alice' }))
    }
  }
})

vi.mock('fs', () => ({ promises: fsMock.promises, default: { promises: fsMock.promises } }))
vi.mock('os', () => ({ ...os, default: os }))

const { initSessionLog, captureError, getRecentErrors, getLogsDir, _resetForTests } =
  await import('../sessionLog')

describe('sessionLog', () => {
  beforeEach(() => {
    state.files.clear()
    state.appends.length = 0
    state.fail = false
    vi.clearAllMocks()
    _resetForTests()
  })

  it('touches this run’s file and keeps exactly 5 sessions', async () => {
    for (let i = 1; i <= 6; i++) state.files.add(`/logs/session-2020010${i}-000000-000.log`)
    await initSessionLog('/logs')
    const remaining = [...state.files].filter((f) => /session-.*\.log$/.test(f))
    expect(remaining.length).toBe(5)
    expect(getLogsDir()).toBe('/logs')
  })

  it('scrubs an error before appending it to disk', async () => {
    await initSessionLog('/logs')
    state.appends.length = 0
    captureError({ message: 'failed at C:\\Users\\alice\\world\\Foo.xml' })
    await Promise.resolve()
    await Promise.resolve()
    expect(state.appends.join('')).toContain('…\\Foo.xml')
    expect(state.appends.join('')).not.toContain('alice')
  })

  it('caps the in-memory ring buffer at 20 entries', async () => {
    await initSessionLog('/logs')
    for (let i = 0; i < 25; i++) captureError({ message: `e${i}` })
    const recent = getRecentErrors()
    expect(recent.length).toBe(20)
    expect(recent[recent.length - 1].message).toBe('e24')
  })

  it('swallows filesystem failures without throwing', async () => {
    state.fail = true
    await expect(initSessionLog('/logs')).resolves.toBeUndefined()
    expect(() => captureError({ message: 'boom' })).not.toThrow()
  })
})
