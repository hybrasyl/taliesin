import { describe, it, expect, vi } from 'vitest'

// handlers.ts reaches electron only through the diagnostics module.
vi.mock('electron', () => ({
  clipboard: { writeText: vi.fn() },
  shell: { openExternal: vi.fn(), showItemInFolder: vi.fn(), openPath: vi.fn() }
}))

const { companionProbeOf } = await import('../handlers')
type HandlerContext = import('../handlers').HandlerContext
type CompanionProbe = import('../companion').CompanionProbe

// index.ts reads the folder of our own portable exe before takePortableLaunch
// removes PORTABLE_EXECUTABLE_DIR (HTOO-667). The companion search sees that
// folder only if each handler builds its probe through companionProbeOf.
describe('companionProbeOf', () => {
  const base = { settingsRoots: new Set<string>(), blessedRoots: new Set<string>() }

  it('gives the real probe the boot-time portable folder', () => {
    const ctx = { ...base, portableDir: 'D:\\tools' } as unknown as HandlerContext
    expect(companionProbeOf(ctx).portableDir).toBe('D:\\tools')
  })

  it('gives no folder when the app is not a portable launch', () => {
    const ctx = { ...base } as unknown as HandlerContext
    expect(companionProbeOf(ctx).portableDir).toBeUndefined()
  })

  it("returns a test's probe as it is", () => {
    const probe = { platform: 'linux' } as unknown as CompanionProbe
    const ctx = {
      ...base,
      companionProbe: probe,
      portableDir: 'D:\\x'
    } as unknown as HandlerContext
    expect(companionProbeOf(ctx)).toBe(probe)
  })
})
