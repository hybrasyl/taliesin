import { describe, it, expect } from 'vitest'
import { isSafeExternalUrl } from '../externalUrl'

describe('isSafeExternalUrl', () => {
  describe('allows the three schemes a desktop app has a reason to open', () => {
    // Taliesin's own outbound links, from AboutDialog and SettingsPage.
    it.each([
      'https://www.hybrasyl.com',
      'https://github.com/hybrasyl',
      'https://github.com/hybrasyl/taliesin/issues/new?title=x&body=y',
      'http://localhost:5173/',
      'mailto:someone@example.com'
    ])('%s', (url) => {
      expect(isSafeExternalUrl(url)).toBe(true)
    })
  })

  describe('refuses everything else', () => {
    // Each of these is honoured by shell.openExternal, which is why the gate is
    // an allowlist rather than a denylist of the ones we happened to think of.
    it.each([
      ['file:///C:/Windows/System32/calc.exe', 'opens a local path'],
      ['file://attacker.example/share/run.exe', 'opens a UNC path'],
      ['smb://attacker.example/share', 'opens a network share'],
      ['ms-msdt:/id PCWDiagnostic', 'launches a Windows troubleshooter'],
      ['javascript:alert(1)', 'script carrier'],
      ['data:text/html,<script>alert(1)</script>', 'script carrier'],
      ['vbscript:msgbox(1)', 'script carrier'],
      ['steam://run/440', 'arbitrary registered scheme'],
      ['about:blank', 'not ours to open']
    ])('%s -- %s', (url) => {
      expect(isSafeExternalUrl(url)).toBe(false)
    })
  })

  describe('refuses input it cannot parse rather than repairing it', () => {
    it.each(['', '   ', 'not a url', 'www.hybrasyl.com', '//hybrasyl.com', 'http:'])(
      '%s',
      (url) => {
        expect(isSafeExternalUrl(url)).toBe(false)
      }
    )

    // The bridge is typed, but a URL reaching this predicate has crossed an IPC
    // boundary, so the runtime behaviour on non-strings is worth pinning down.
    it.each([undefined, null, 42, {}])('%s', (value) => {
      expect(isSafeExternalUrl(value as unknown as string)).toBe(false)
    })
  })

  it('is scheme-case-insensitive, because the URL parser normalises', () => {
    expect(isSafeExternalUrl('HTTPS://www.hybrasyl.com')).toBe(true)
    expect(isSafeExternalUrl('FILE:///C:/Windows/System32/calc.exe')).toBe(false)
  })

  it('judges the scheme, not the host', () => {
    // A guard that also tried to allowlist hosts would be a different, larger
    // promise. This one says only "the OS may be asked to open this kind of thing".
    expect(isSafeExternalUrl('https://attacker.example/anything')).toBe(true)
  })
})
