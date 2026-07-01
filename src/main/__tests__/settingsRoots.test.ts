import { describe, it, expect } from 'vitest'
import { applySettingsRoots, allRoots } from '../handlers'
import type { HandlerContext } from '../handlers'
import type { TaliesinSettings } from '../settingsManager'

function makeCtx(): HandlerContext {
  return {
    settingsPath: '/settings',
    settingsManager: {},
    appGetVersion: () => '0',
    settingsRoots: new Set<string>(),
    blessedRoots: new Set<string>()
  } as unknown as HandlerContext
}

const base: TaliesinSettings = {
  libraries: [],
  activeLibrary: null,
  mapDirectories: [],
  activeMapDirectory: null,
  musicWorkingDirs: [],
  musEncodeKbps: 64,
  musEncodeSampleRate: 22050
}

describe('applySettingsRoots', () => {
  it('whitelists every configured library (+ world parent), not just the active one', () => {
    const ctx = makeCtx()
    applySettingsRoots(ctx, {
      ...base,
      libraries: ['/repos/ceridwen/world/xml', '/f/Hybrasyl/world/xml'],
      activeLibrary: '/repos/ceridwen/world/xml'
    })
    const roots = new Set(allRoots(ctx))
    expect(roots.has('/repos/ceridwen/world/xml')).toBe(true)
    // The inactive library — the case that previously failed index:status.
    expect(roots.has('/f/Hybrasyl/world/xml')).toBe(true)
    expect(roots.has('/f/Hybrasyl/world')).toBe(true) // world parent
  })

  it('whitelists all music working dirs, not just the active one', () => {
    const ctx = makeCtx()
    applySettingsRoots(ctx, {
      ...base,
      musicWorkingDirs: ['/work/a', '/work/b'],
      activeMusicWorkingDir: '/work/a'
    })
    const roots = new Set(allRoots(ctx))
    expect(roots.has('/work/a')).toBe(true)
    expect(roots.has('/work/b')).toBe(true)
  })
})
