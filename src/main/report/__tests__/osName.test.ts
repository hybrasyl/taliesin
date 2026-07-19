import { describe, it, expect } from 'vitest'
import { simplifyPlatform } from '../osName'

describe('simplifyPlatform', () => {
  it('maps known platforms to coarse families', () => {
    expect(simplifyPlatform('win32')).toBe('windows')
    expect(simplifyPlatform('darwin')).toBe('macOS')
    expect(simplifyPlatform('linux')).toBe('linux')
  })

  it('falls back to "other" for anything else', () => {
    expect(simplifyPlatform('freebsd')).toBe('other')
    expect(simplifyPlatform(undefined)).toBe('other')
    expect(simplifyPlatform('')).toBe('other')
  })
})
