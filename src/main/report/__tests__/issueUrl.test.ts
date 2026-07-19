import { describe, it, expect } from 'vitest'
import { buildIssueUrl, truncateBodyForUrl } from '../issueUrl'

describe('buildIssueUrl', () => {
  it('builds a prefilled new-issue URL with encoded params', () => {
    const url = buildIssueUrl({
      owner: 'hybrasyl',
      repo: 'cernunnos',
      title: 'a b',
      body: 'x&y',
      labels: ['app:taliesin']
    })
    expect(url).toContain('https://github.com/hybrasyl/cernunnos/issues/new?')
    expect(url).toContain('title=a+b')
    expect(url).toContain('body=x%26y')
    expect(url).toContain('labels=app%3Ataliesin')
  })

  it('omits empty params', () => {
    expect(buildIssueUrl({ owner: 'o', repo: 'r' })).toBe('https://github.com/o/r/issues/new?')
  })
})

describe('truncateBodyForUrl', () => {
  const base = { owner: 'hybrasyl', repo: 'cernunnos', title: 't', labels: ['app:taliesin'] }

  it('leaves a short body untouched', () => {
    const { url, truncated } = truncateBodyForUrl({ ...base, body: 'short' }, 1800)
    expect(truncated).toBe(false)
    expect(url).toContain('body=short')
  })

  it('trims a long body to stay within budget and appends the paste note', () => {
    const body = 'x'.repeat(5000)
    const { url, truncated } = truncateBodyForUrl({ ...base, body }, 1800)
    expect(truncated).toBe(true)
    expect(url.length).toBeLessThanOrEqual(1800)
    // URLSearchParams encodes spaces as '+', so normalise before matching.
    expect(decodeURIComponent(url).replace(/\+/g, ' ')).toContain('diagnostics truncated')
  })
})
