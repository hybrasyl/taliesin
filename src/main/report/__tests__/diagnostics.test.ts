import { describe, it, expect, vi, beforeEach } from 'vitest'

// Since Electron 44 the main-process clipboard returns a Promise (HTOO-553). These
// tests hold the write open and prove that nothing reports success, and no browser
// opens, before the report is on the clipboard.
const { clipboard, shell } = vi.hoisted(() => ({
  clipboard: { writeText: vi.fn() },
  shell: { openExternal: vi.fn(async () => undefined), openPath: vi.fn() }
}))
vi.mock('electron', () => ({ clipboard, shell }))

import { copyReport, openIssue } from '../diagnostics'

/** A clipboard write that completes only when the test says so. */
function holdWrite(): () => void {
  let release: () => void = () => {}
  clipboard.writeText.mockImplementationOnce(
    () => new Promise<void>((resolve) => (release = resolve))
  )
  return () => release()
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('openIssue', () => {
  it('opens the browser only after the report is on the clipboard', async () => {
    const release = holdWrite()
    const done = openIssue({ title: 'T', body: 'the report' })
    await settle()
    expect(clipboard.writeText).toHaveBeenCalledWith('the report')
    expect(shell.openExternal).not.toHaveBeenCalled()

    release()
    await expect(done).resolves.toMatchObject({ ok: true })
    expect(shell.openExternal).toHaveBeenCalledTimes(1)
  })

  it('opens no browser when the clipboard write fails', async () => {
    clipboard.writeText.mockRejectedValueOnce(new Error('clipboard busy'))
    await expect(openIssue({ title: 'T', body: 'b' })).rejects.toThrow('clipboard busy')
    expect(shell.openExternal).not.toHaveBeenCalled()
  })
})

describe('copyReport', () => {
  it('reports success only after the write completes', async () => {
    const release = holdWrite()
    let finished = false
    const done = copyReport({ body: 'the report' }).then((r) => {
      finished = true
      return r
    })
    await settle()
    expect(finished).toBe(false)

    release()
    await expect(done).resolves.toEqual({ ok: true })
  })
})
