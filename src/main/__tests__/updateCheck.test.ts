import { describe, it, expect, vi } from 'vitest'
import { isNewerVersion, checkForUpdate } from '../updateCheck'

/**
 * HTOO-65. `fetch` is injected, so every branch here runs without a network —
 * which matters more than usual: the interesting cases are all failures, and not
 * one of them is reachable from a test that has to reach GitHub.
 */
function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response
}

describe('isNewerVersion', () => {
  it('compares numerically, not as strings', () => {
    // The case a string compare gets backwards, and the one this repo will
    // actually meet: 2.10.0 follows 2.9.0.
    expect(isNewerVersion('2.9.0', '2.10.0')).toBe(true)
    expect(isNewerVersion('2.10.0', '2.9.0')).toBe(false)
  })

  it('ignores a v prefix on either side', () => {
    expect(isNewerVersion('2.9.0', 'v2.9.1')).toBe(true)
    expect(isNewerVersion('v2.9.1', '2.9.1')).toBe(false)
  })

  it('is false for the same version', () => {
    // The common case by far: nothing is shown, so this must not be "true when
    // in doubt".
    expect(isNewerVersion('2.9.0', '2.9.0')).toBe(false)
  })

  it('ignores a pre-release suffix rather than mis-parsing it', () => {
    expect(isNewerVersion('2.9.0', '2.9.1-beta.1')).toBe(true)
    expect(isNewerVersion('2.9.1', '2.9.1-beta.1')).toBe(false)
  })

  it('treats a missing component as zero', () => {
    expect(isNewerVersion('2.9', '2.9.1')).toBe(true)
    expect(isNewerVersion('2.9.0', '2.9')).toBe(false)
  })
})

describe('checkForUpdate', () => {
  it('reports a newer stable release, without the v prefix', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ tag_name: 'v2.10.0', html_url: 'https://example.invalid/r/2.10.0' })
    )
    await expect(checkForUpdate('2.9.0', fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      version: '2.10.0',
      url: 'https://example.invalid/r/2.10.0'
    })
  })

  it('says nothing when the running version is current', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ tag_name: 'v2.9.0' }))
    await expect(checkForUpdate('2.9.0', fetchImpl as unknown as typeof fetch)).resolves.toBeNull()
  })

  it('ignores a draft or a prerelease', async () => {
    // `/releases/latest` already excludes both, so this is belt and braces
    // against the endpoint or the release process changing under us.
    const draft = vi.fn(async () => jsonResponse({ tag_name: 'v3.0.0', draft: true }))
    const pre = vi.fn(async () => jsonResponse({ tag_name: 'v3.0.0', prerelease: true }))
    await expect(checkForUpdate('2.9.0', draft as unknown as typeof fetch)).resolves.toBeNull()
    await expect(checkForUpdate('2.9.0', pre as unknown as typeof fetch)).resolves.toBeNull()
  })

  it('swallows a non-OK response, a rejected request and malformed JSON alike', async () => {
    // Rate-limited, offline, and a shape we do not recognise. All three are the
    // same thing to the user — nothing appears — and none may reach startup as
    // an error.
    const rateLimited = vi.fn(async () => jsonResponse({}, false))
    const offline = vi.fn(async () => {
      throw new Error('ENOTFOUND')
    })
    const nonsense = vi.fn(
      async () => ({ ok: true, json: async () => 'not an object' }) as Response
    )
    for (const impl of [rateLimited, offline, nonsense]) {
      await expect(checkForUpdate('2.9.0', impl as unknown as typeof fetch)).resolves.toBeNull()
    }
  })

  it('asks GitHub for this repo, with a User-Agent', async () => {
    // The API refuses a request with no User-Agent, which would make the check
    // silently never work — and silence is this feature's only failure mode.
    const fetchImpl = vi.fn(async () => jsonResponse({ tag_name: 'v2.9.0' }))
    await checkForUpdate('2.9.0', fetchImpl as unknown as typeof fetch)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.github.com/repos/hybrasyl/taliesin/releases/latest')
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('taliesin')
  })
})
