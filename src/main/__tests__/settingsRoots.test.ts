import { describe, it, expect } from 'vitest'
import { applySettingsRoots, allRoots, packSources } from '../handlers'
import type { HandlerContext } from '../handlers'
import type { TaliesinSettings } from '../settingsManager'

/**
 * A context whose grants cover `granted`. The default grants everything, for
 * the cases that test which settings fields become roots, not whether a grant
 * allows them.
 */
function makeCtx(granted: string[] = ['/']): HandlerContext {
  return {
    settingsPath: '/settings',
    settingsManager: {},
    appGetVersion: () => '0',
    settingsRoots: new Set<string>(),
    blessedRoots: new Set<string>(),
    grants: { dirs: new Set(granted), executables: {} }
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

  it('whitelists every configured map directory, not just the active one', () => {
    const ctx = makeCtx()
    applySettingsRoots(ctx, {
      ...base,
      mapDirectories: [
        { path: '/repos/world/mapfiles', name: 'World' },
        { path: '/hyb/Maps/map-collection-prime', name: 'Prime' },
        { path: '/games/Dark Ages/maps', name: 'Client' }
      ],
      activeMapDirectory: '/repos/world/mapfiles'
    })
    const roots = new Set(allRoots(ctx))
    expect(roots.has('/repos/world/mapfiles')).toBe(true)
    // The inactive sources. Switching to one of these used to be refused by
    // catalog:scan / catalog:load until the settings save round-tripped back.
    expect(roots.has('/hyb/Maps/map-collection-prime')).toBe(true)
    expect(roots.has('/games/Dark Ages/maps')).toBe(true)
  })

  it('whitelists an active map directory that is not in the configured list', () => {
    const ctx = makeCtx()
    applySettingsRoots(ctx, { ...base, activeMapDirectory: '/one/off' })
    expect(new Set(allRoots(ctx)).has('/one/off')).toBe(true)
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

describe('applySettingsRoots — grants (HTOO-674)', () => {
  it('a settings path with no grant is not a root, and is reported', () => {
    const ctx = makeCtx(['/granted'])
    const refused = applySettingsRoots(ctx, {
      ...base,
      packDir: '/elsewhere',
      musicWorkingDirs: ['/granted/music']
    })
    const roots = new Set(allRoots(ctx))
    expect(roots.has('/elsewhere')).toBe(false)
    expect(roots.has('/granted/music')).toBe(true)
    expect(refused).toEqual(['/elsewhere'])
  })

  it('a path inside a folder chosen in a dialog this session counts', () => {
    const ctx = makeCtx([])
    ctx.blessedRoots.add('/picked')
    applySettingsRoots(ctx, { ...base, libraries: ['/picked/world/xml'] })
    expect(new Set(allRoots(ctx)).has('/picked/world/xml')).toBe(true)
  })

  it('no grants at all means no settings roots', () => {
    const ctx = { ...makeCtx(), grants: undefined } as unknown as HandlerContext
    applySettingsRoots(ctx, { ...base, packDir: '/p', clientPath: '/c' })
    expect([...ctx.settingsRoots]).toEqual([])
    expect(ctx.clientPath).toBeNull()
  })

  it('the settings folder is not a root; only its BIK cache is', () => {
    const roots = [...allRoots(makeCtx())]
    expect(roots).not.toContain('/settings')
    expect(roots.some((r) => r.replace(/\\/g, '/') === '/settings/bik-cache')).toBe(true)
  })

  it('installed-pack sources count only when they are roots', () => {
    const ctx = makeCtx(['/assets'])
    applySettingsRoots(ctx, { ...base, brigidAssetsPath: '/assets', clientPath: '/forged' })
    expect(packSources(ctx, { brigidAssetsPath: '/assets', clientPath: '/forged' })).toEqual({
      brigidAssetsPath: '/assets',
      clientPath: null
    })
  })
})
