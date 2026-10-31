import { describe, it, expect } from 'vitest'
import { brigidAssetsExample } from '../brigidAssets'

// The example names the folder that "Use default location" fills in on each
// platform, with `Erisco` in capitals (HTOO-585).
describe('brigidAssetsExample', () => {
  it('gives the Windows folder on win32', () => {
    expect(brigidAssetsExample('win32')).toBe('e.g. %LOCALAPPDATA%\\Erisco\\Brigid\\assets')
  })

  it('gives the Application Support folder on macOS', () => {
    expect(brigidAssetsExample('darwin')).toBe(
      'e.g. ~/Library/Application Support/Erisco/Brigid/assets'
    )
  })

  it('gives the XDG config folder on Linux', () => {
    expect(brigidAssetsExample('linux')).toBe('e.g. ~/.config/Erisco/Brigid/assets')
  })

  it('never names the lower-case folder', () => {
    for (const p of ['win32', 'darwin', 'linux', undefined]) {
      expect(brigidAssetsExample(p)).not.toMatch(/erisco/)
    }
  })
})
