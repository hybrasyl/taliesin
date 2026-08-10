import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Report Issue / diagnostics, driven through the renderer bridge (HTOO-175).
 *
 * These five channels used to be STUBBED in handlerBridge.ts, so the only
 * coverage they had ran through a page: the page-level specs proved the UI
 * called something, never that the handler assembled a correct report. That is
 * the wrong shape for this module in particular, because its whole value is
 * that it builds a *scrubbed* report — the scrubbing is what makes it safe to
 * file into a PUBLIC repo (hybrasyl/cernunnos, label `app:taliesin`). A stub
 * meant the scrubber saw whatever a page happened to send rather than the cases
 * that would embarrass us.
 *
 * So the cases below are deliberately hostile: a home directory, a Windows
 * account path, a deep world-library path, an email address and an IP, all
 * pushed in through `window.api.reportRendererError` the way a real crash
 * would, then read back out of the assembled report.
 *
 * `electron` is mocked here rather than in the shared setup. The bridge routes
 * these to the real bodies, which reach `clipboard` and `shell`; without the
 * mock the named imports are undefined and the call throws, which is the loud
 * failure we want over a test that quietly proves nothing.
 */

const memfs = vi.hoisted(async () => {
  const { createMemoryFs } = await import('../setup/handlerBridge')
  return createMemoryFs()
})

const electron = vi.hoisted(() => ({
  clipboard: { writeText: vi.fn() },
  shell: { openExternal: vi.fn(), openPath: vi.fn() }
}))

vi.mock('fs', async () => (await memfs).fsModule)
vi.mock('electron', () => electron)

const { installBridgedApi } = await import('../setup/handlerBridge')

// Variable-path imports keep TypeScript from graph-resolving src/main/ into the
// renderer's tsconfig project (TS6307). Vitest still resolves them at runtime.
// Same idiom as AssetPackPage.integration.test.tsx.
const HANDLERS_PATH = '../../../../main/handlers'
const SESSION_LOG_PATH = '../../../../main/report/sessionLog'
const handlers = await import(/* @vite-ignore */ HANDLERS_PATH)
const sessionLog = await import(/* @vite-ignore */ SESSION_LOG_PATH)

beforeEach(async () => {
  const fs = await memfs
  fs.reset()
  electron.clipboard.writeText.mockClear()
  electron.shell.openExternal.mockClear()
  electron.shell.openPath.mockClear()
  sessionLog._resetForTests()
  installBridgedApi(handlers, {
    settingsPath: '/appdata/Taliesin',
    settingsManager: { load: async () => ({}), save: async () => undefined },
    appGetVersion: () => '9.9.9-test'
  })
})

describe('diagnostics — the assembled report', () => {
  it('builds a block carrying the product, version and OS', async () => {
    const report = await window.api.buildDiagnostics()
    expect(report).toContain('Taliesin 9.9.9-test')
    expect(report).toMatch(/^OS: .+$/m)
  })

  it('says so plainly when no error was captured', async () => {
    const report = await window.api.buildDiagnostics()
    expect(report).toContain('No errors captured this session.')
  })

  it('attaches a renderer error reported through the bridge', async () => {
    await window.api.reportRendererError({
      source: 'window.onerror',
      message: 'Cannot read properties of null',
      stack: 'at Foo\nat Bar'
    })
    const report = await window.api.buildDiagnostics()
    expect(report).not.toContain('No errors captured this session.')
    expect(report).toContain('Cannot read properties of null')
    expect(report).toContain('[window.onerror]')
    // The origin is stamped by the handler, not sent by the renderer — a
    // renderer-reported error must not be able to claim it came from main.
    expect(report).toContain('renderer ::')
    // Multi-line stacks are flattened so one error stays one line.
    expect(report).toContain('at Foo | at Bar')
  })

  it('keeps the newest errors in order', async () => {
    await window.api.reportRendererError({ source: 'a', message: 'first' })
    await window.api.reportRendererError({ source: 'b', message: 'second' })
    const report = await window.api.buildDiagnostics()
    expect(report.indexOf('first')).toBeLessThan(report.indexOf('second'))
  })
})

describe('diagnostics — the scrubber removes what it claims to', () => {
  it('strips an email address', async () => {
    await window.api.reportRendererError({
      source: 'test',
      message: 'failed to notify sabrael@hybrasyl.com about it'
    })
    const report = await window.api.buildDiagnostics()
    expect(report).not.toContain('sabrael@hybrasyl.com')
    expect(report).toContain('<email>')
  })

  it('strips an IPv4 address', async () => {
    await window.api.reportRendererError({
      source: 'test',
      message: 'connect ECONNREFUSED 192.168.1.42'
    })
    const report = await window.api.buildDiagnostics()
    expect(report).not.toContain('192.168.1.42')
    expect(report).toContain('<ip>')
  })

  it('collapses a deep Windows path, dropping the account name with it', async () => {
    await window.api.reportRendererError({
      source: 'test',
      message: 'ENOENT: C:\\Users\\sabrael\\Documents\\Hybrasyl\\world\\items\\Stick.xml'
    })
    const report = await window.api.buildDiagnostics()
    expect(report).not.toContain('sabrael')
    expect(report).not.toContain('Documents')
    // The basename survives, because it is the useful part for debugging.
    expect(report).toContain('Stick.xml')
  })

  it('collapses a deep POSIX path the same way', async () => {
    await window.api.reportRendererError({
      source: 'test',
      message: 'ENOENT: /home/sabrael/dev/world/items/Stick.xml'
    })
    const report = await window.api.buildDiagnostics()
    expect(report).not.toContain('/home/sabrael')
    expect(report).toContain('Stick.xml')
  })

  it('scrubs the stack, not only the message', async () => {
    await window.api.reportRendererError({
      source: 'test',
      message: 'boom',
      stack: 'at load (C:\\Users\\sabrael\\AppData\\Local\\Erisco\\Taliesin\\app.js:1:1)'
    })
    const report = await window.api.buildDiagnostics()
    expect(report).not.toContain('sabrael')
    expect(report).not.toContain('AppData')
  })

  it('leaves an ordinary message untouched', async () => {
    await window.api.reportRendererError({
      source: 'test',
      message: 'TypeError: palette is not a function'
    })
    const report = await window.api.buildDiagnostics()
    expect(report).toContain('TypeError: palette is not a function')
  })
})

describe('diagnostics — opening the issue', () => {
  const body = 'App: Taliesin 9.9.9-test\nOS: linux\nsomething went wrong'

  it('opens a prefilled issue on the public intake repo with the app label', async () => {
    const res = await window.api.openIssue({ title: 'Crash on open', body })
    expect(res).toEqual({ ok: true, truncated: false })

    expect(electron.shell.openExternal).toHaveBeenCalledTimes(1)
    const url = new URL(electron.shell.openExternal.mock.calls[0][0] as string)
    expect(url.origin).toBe('https://github.com')
    expect(url.pathname).toBe('/hybrasyl/cernunnos/issues/new')
    expect(url.searchParams.get('title')).toBe('Crash on open')
    expect(url.searchParams.get('body')).toBe(body)
    // The per-app label is what lets a maintainer triage by source app. Only
    // labels that already exist on the repo are applied by GitHub, so an
    // unbounded version label would silently no-op — hence exactly this one.
    expect(url.searchParams.get('labels')).toBe('app:taliesin')
  })

  it('copies the full body to the clipboard before opening anything', async () => {
    await window.api.openIssue({ title: 'Crash on open', body })
    expect(electron.clipboard.writeText).toHaveBeenCalledWith(body)
  })

  it('truncates an oversized body for the URL but never for the clipboard', async () => {
    const huge = `${body}\n${'x'.repeat(5000)}`
    const res = await window.api.openIssue({ title: 'Crash on open', body: huge })

    expect(res.truncated).toBe(true)
    // The clipboard is the fallback the truncation note points at, so it has to
    // hold the whole thing — truncating both would lose the report outright.
    expect(electron.clipboard.writeText).toHaveBeenCalledWith(huge)

    const url = electron.shell.openExternal.mock.calls[0][0] as string
    expect(url.length).toBeLessThanOrEqual(1800)
    // Read the body back through URLSearchParams rather than decodeURIComponent:
    // the query encodes spaces as '+', which decodeURIComponent leaves alone.
    const sent = new URL(url).searchParams.get('body') ?? ''
    expect(sent).toContain('full report copied to your clipboard')
    expect(sent.length).toBeLessThan(huge.length)
  })

  it('copyReport puts the body on the clipboard and opens nothing', async () => {
    const res = await window.api.copyReport({ body })
    expect(res).toEqual({ ok: true })
    expect(electron.clipboard.writeText).toHaveBeenCalledWith(body)
    expect(electron.shell.openExternal).not.toHaveBeenCalled()
  })
})

describe('diagnostics — revealing the logs folder', () => {
  it('does nothing when no session log was ever started', async () => {
    await window.api.revealLogs()
    expect(electron.shell.openPath).not.toHaveBeenCalled()
  })

  it('opens the app-owned logs directory once a session exists', async () => {
    await sessionLog.initSessionLog('/appdata/Taliesin/logs')
    await window.api.revealLogs()
    expect(electron.shell.openPath).toHaveBeenCalledWith('/appdata/Taliesin/logs')
  })

  it('writes the scrubbed error to the session log, not the raw one', async () => {
    // The module's claim is that on-disk session logs are already safe to attach
    // to a report, because scrubbing happens at CAPTURE time rather than on the
    // way out. This is that claim, checked against the bytes on disk.
    await sessionLog.initSessionLog('/appdata/Taliesin/logs')
    await window.api.reportRendererError({
      source: 'window.onerror',
      message: 'ENOENT: /home/sabrael/dev/world/items/Stick.xml'
    })

    const fs = await memfs
    const written = [...fs.files.entries()]
      .filter(([path]) => path.includes('/logs/session-'))
      .map(([, buf]) => buf.toString('utf-8'))
      .join('')

    expect(written).toContain('Stick.xml')
    expect(written).not.toContain('/home/sabrael')
  })
})

describe('diagnostics — a malformed payload does not reach the report', () => {
  it('rejects a renderer error that fails its schema, and captures nothing', async () => {
    // parseOrLog is the boundary for every diagnostics:* payload, and it THROWS
    // rather than dropping quietly — the caller finds out. What matters here is
    // the second half: a refused payload must not reach the ring buffer, or an
    // unvalidated string would ride into a public issue body.
    await expect(
      window.api.reportRendererError({
        source: 'x'.repeat(200), // schema caps source at 40
        message: 'this should not be captured'
      })
    ).rejects.toThrow(/Invalid diagnostics:reportRendererError payload/)

    const report = await window.api.buildDiagnostics()
    expect(report).toContain('No errors captured this session.')
    expect(report).not.toContain('this should not be captured')
  })
})
