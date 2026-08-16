import { describe, it, expect, vi } from 'vitest'
import { join } from 'path'
import {
  resolveCompanion,
  launchCompanion,
  launcherDir,
  parseInstallLocations,
  pickerFilters,
  isCompanionEntry,
  preferredCompanionEntry,
  type CompanionProbe
} from '../companion'

/**
 * HTOO-292. Every platform probe is injected, which is the point of the module's
 * shape: registry queries, Applications scans and `.desktop` lookups cannot run
 * in a suite, and a resolver whose precedence is only exercised on the author's
 * own machine has exactly one tested path.
 *
 * The card asks for coverage of precedence and of hostile or stale candidates
 * without touching the real registry, Launch Services or desktop database.
 */
// Paths are built with `path.join`, so expectations use it too: this suite runs
// on whatever the developer or the runner is, while the code under test always
// runs on the platform whose separators it is producing.
function makeProbe(over: Partial<CompanionProbe> = {}): CompanionProbe {
  return {
    platform: 'win32',
    execPath: join('C:', 'Program Files', 'Taliesin', 'taliesin.exe'),
    env: {},
    exists: async () => false,
    isExecutable: async () => true,
    readdir: async () => [],
    runCommand: async () => null,
    launch: vi.fn(async () => undefined),
    ...over
  }
}

describe('launcherDir', () => {
  it('uses the portable launcher directory, not the extraction directory', () => {
    // The trap this card names explicitly. electron-builder's portable target
    // self-extracts to %TEMP%, so execPath points somewhere the companion will
    // never be — a sibling search there finds nothing, forever and silently.
    const probe = makeProbe({
      execPath: 'C:\\Users\\a\\AppData\\Local\\Temp\\2H8x\\taliesin.exe',
      env: { PORTABLE_EXECUTABLE_DIR: 'D:\\tools' }
    })
    expect(launcherDir(probe)).toBe('D:\\tools')
  })

  it('falls back to the real executable directory for installed builds', () => {
    expect(launcherDir(makeProbe())).toBe(join('C:', 'Program Files', 'Taliesin'))
  })

  it('ignores the portable variable off Windows', () => {
    // It is an electron-builder Windows signal. Honouring it elsewhere would
    // trust an environment variable anyone can set on a platform that never
    // sets it.
    const probe = makeProbe({
      platform: 'linux',
      execPath: '/opt/taliesin/taliesin',
      env: { PORTABLE_EXECUTABLE_DIR: '/tmp/attacker' }
    })
    expect(launcherDir(probe)).toBe('/opt/taliesin')
  })
})

describe('release-artifact naming', () => {
  // Both apps ship `${name}-${version}-portable.${ext}` and
  // `${name}-${version}.${ext}`. The exact-name list only ever matched an
  // installed executable, so a downloaded portable beside Taliesin was invisible
  // -- symmetrically, since Taliesin's own releases are named the same way.
  it('accepts the shipped artifact names', () => {
    expect(isCompanionEntry('creidhne', 'win32', 'creidhne.exe')).toBe(true)
    expect(isCompanionEntry('creidhne', 'win32', 'creidhne-1.11.0-portable.exe')).toBe(true)
    expect(isCompanionEntry('creidhne', 'win32', 'creidhne-1.11.0.exe')).toBe(true)
    expect(isCompanionEntry('creidhne', 'win32', 'Creidhne-1.11.0-Portable.EXE')).toBe(true)
    expect(isCompanionEntry('creidhne', 'linux', 'creidhne-1.11.0.AppImage')).toBe(true)
    expect(isCompanionEntry('creidhne', 'darwin', 'Creidhne.app')).toBe(true)
  })

  it('refuses the installer, which is the dangerous near-match', () => {
    // Launching this would start an install, not the companion -- and it is the
    // file most likely to be in the same downloads folder as the portable.
    expect(isCompanionEntry('creidhne', 'win32', 'creidhne-1.11.0-setup.exe')).toBe(false)
    expect(isCompanionEntry('creidhne', 'win32', 'Uninstall Creidhne.exe')).toBe(false)
  })

  it('refuses names that merely start with the id', () => {
    expect(isCompanionEntry('creidhne', 'win32', 'creidhne-helper.exe')).toBe(false)
    expect(isCompanionEntry('creidhne', 'win32', 'creidhnex.exe')).toBe(false)
    expect(isCompanionEntry('creidhne', 'win32', 'taliesin.exe')).toBe(false)
  })

  it('prefers the unversioned name, else the highest version', () => {
    expect(preferredCompanionEntry(['creidhne-1.9.0-portable.exe', 'creidhne.exe'])).toBe(
      'creidhne.exe'
    )
    // Numeric compare, or 1.9.0 would beat 1.10.0 on a plain string sort.
    expect(
      preferredCompanionEntry(['creidhne-1.9.0-portable.exe', 'creidhne-1.10.0-portable.exe'])
    ).toBe('creidhne-1.10.0-portable.exe')
    expect(preferredCompanionEntry([])).toBeNull()
  })

  it('finds a versioned portable sitting beside the launcher', async () => {
    const probe = makeProbe({
      readdir: async () => [
        'taliesin-2.11.0-portable.exe',
        'creidhne-1.11.0-setup.exe',
        'creidhne-1.11.0-portable.exe'
      ]
    })
    const status = await resolveCompanion(probe, 'creidhne', null)
    expect(status.resolved).toEqual({
      target: join('C:', 'Program Files', 'Taliesin', 'creidhne-1.11.0-portable.exe'),
      kind: 'binary',
      source: 'sibling'
    })
  })
})

describe('resolution precedence', () => {
  it('prefers an override that still exists', async () => {
    const probe = makeProbe({
      exists: async (p) => p === 'D:\\custom\\creidhne.exe',
      readdir: async () => ['creidhne.exe']
    })
    const status = await resolveCompanion(probe, 'creidhne', 'D:\\custom\\creidhne.exe')
    expect(status.resolved).toEqual({
      target: 'D:\\custom\\creidhne.exe',
      kind: 'binary',
      source: 'manual'
    })
    expect(status.staleOverride).toBe(false)
  })

  it('degrades a stale override into discovery, and says so', async () => {
    // The card's rule: report that the override needs attention rather than
    // failing silently. A moved install must not leave the button dead with no
    // explanation.
    const probe = makeProbe({ readdir: async () => ['creidhne.exe', 'taliesin.exe'] })
    const status = await resolveCompanion(probe, 'creidhne', 'D:\\gone\\creidhne.exe')
    expect(status.staleOverride).toBe(true)
    expect(status.resolved?.source).toBe('sibling')
  })

  it('finds a colocated sibling whatever its casing', async () => {
    // Ties to HTOO-287: the installer's casing is not ours to predict, and a
    // case-sensitive filesystem is where a literal match silently fails.
    const probe = makeProbe({
      platform: 'linux',
      execPath: '/opt/taliesin/taliesin',
      readdir: async () => ['Creidhne.AppImage']
    })
    const status = await resolveCompanion(probe, 'creidhne', null)
    expect(status.resolved).toEqual({
      target: join('/opt/taliesin', 'Creidhne.AppImage'),
      kind: 'binary',
      source: 'sibling'
    })
  })

  it('falls through to installation registration when nothing is colocated', async () => {
    const probe = makeProbe({
      readdir: async (dir) => (dir === 'C:\\Program Files\\Creidhne' ? ['Creidhne.exe'] : []),
      exists: async () => false,
      runCommand: async (file, args) =>
        file === 'reg' && args[1].startsWith('HKCU')
          ? 'HKEY_CURRENT_USER\\...\\Creidhne\r\n    DisplayName    REG_SZ    Creidhne\r\n    InstallLocation    REG_SZ    C:\\Program Files\\Creidhne\r\n'
          : null
    })
    const status = await resolveCompanion(probe, 'creidhne', null)
    expect(status.resolved).toEqual({
      target: join('C:\\Program Files\\Creidhne', 'Creidhne.exe'),
      kind: 'binary',
      source: 'installed'
    })
  })

  it('reports not-found as a state rather than an error', async () => {
    // Step 4 of the contract: the caller offers a picker. Nothing throws.
    const status = await resolveCompanion(makeProbe(), 'creidhne', null)
    expect(status).toEqual({ resolved: null, staleOverride: false })
  })

  it('recognises a macOS bundle as a bundle, not a binary', async () => {
    // A `.app` is a DIRECTORY. Spawning it, or spawning Contents/MacOS/*, is
    // what loses activation of an already-running instance.
    const probe = makeProbe({
      platform: 'darwin',
      execPath: '/Applications/Taliesin.app/Contents/MacOS/Taliesin',
      env: { HOME: '/Users/a' },
      readdir: async (dir) => (dir === '/Applications' ? ['Creidhne.app'] : [])
    })
    const status = await resolveCompanion(probe, 'creidhne', null)
    expect(status.resolved).toEqual({
      target: join('/Applications', 'Creidhne.app'),
      kind: 'appBundle',
      source: 'installed'
    })
  })

  it('resolves a Linux desktop entry from the XDG search path', async () => {
    const probe = makeProbe({
      platform: 'linux',
      execPath: '/opt/taliesin/taliesin',
      env: { HOME: '/home/a', XDG_DATA_DIRS: '/usr/share' },
      // join() again: the XDG directories are built with it, so the mock has to
      // compare the same way to run on a Windows developer machine.
      readdir: async (dir) =>
        dir === join('/usr/share', 'applications') ? ['creidhne.desktop'] : []
    })
    const status = await resolveCompanion(probe, 'creidhne', null)
    expect(status.resolved).toEqual({
      target: join('/usr/share/applications', 'creidhne.desktop'),
      kind: 'desktopEntry',
      source: 'installed'
    })
  })
})

describe('parseInstallLocations', () => {
  const BLOCK = [
    'HKEY_CURRENT_USER\\Software\\...\\Uninstall\\Notepad++',
    '    DisplayName    REG_SZ    Notepad++',
    '    InstallLocation    REG_SZ    C:\\Program Files\\Notepad++',
    '',
    'HKEY_CURRENT_USER\\Software\\...\\Uninstall\\co.eris.creidhne',
    '    DisplayName    REG_SZ    Creidhne',
    '    InstallLocation    REG_SZ    C:\\Users\\a b\\AppData\\Local\\Programs\\Creidhne',
    ''
  ].join('\r\n')

  it('takes only the block whose DisplayName matches, spaces and all', () => {
    // An uninstall subtree holds hundreds of unrelated blocks, and install paths
    // routinely contain spaces — the user's own name is in this one.
    expect(parseInstallLocations(BLOCK, 'Creidhne')).toEqual([
      'C:\\Users\\a b\\AppData\\Local\\Programs\\Creidhne'
    ])
  })

  it('does not match a product whose name merely CONTAINS the one asked for', () => {
    // `Creidhne Helper` is not Creidhne. Registry values are untrusted input and
    // a loose match here would hand an arbitrary install path to the launcher.
    const other =
      'HKEY...\\x\r\n    DisplayName    REG_SZ    Creidhne Helper\r\n    InstallLocation    REG_SZ    C:\\evil\r\n'
    expect(parseInstallLocations(other, 'Creidhne')).toEqual([])
  })

  it('falls back to DisplayIcon and strips its icon index', () => {
    const icon =
      'HKEY...\\c\r\n    DisplayName    REG_SZ    Creidhne\r\n    DisplayIcon    REG_SZ    C:\\Apps\\Creidhne\\creidhne.exe,0\r\n'
    expect(parseInstallLocations(icon, 'Creidhne')).toEqual(['C:\\Apps\\Creidhne\\creidhne.exe'])
  })
})

describe('launchCompanion', () => {
  it('launches what was resolved and reports the source', async () => {
    const launch = vi.fn(async () => undefined)
    const probe = makeProbe({ readdir: async () => ['creidhne.exe'], launch })
    await expect(launchCompanion(probe, 'creidhne', null)).resolves.toEqual({
      ok: true,
      source: 'sibling',
      target: join('C:', 'Program Files', 'Taliesin', 'creidhne.exe')
    })
    expect(launch).toHaveBeenCalledWith(
      'binary',
      join('C:', 'Program Files', 'Taliesin', 'creidhne.exe')
    )
  })

  it('names a stale override rather than collapsing it to "not found"', async () => {
    // Different sentence, different fix: one asks the user to re-select, the
    // other tells them nothing is installed.
    await expect(launchCompanion(makeProbe(), 'creidhne', 'D:\\gone.exe')).resolves.toEqual({
      ok: false,
      reason: 'stale-override'
    })
  })

  it('names a found-but-not-executable target', async () => {
    const probe = makeProbe({
      platform: 'linux',
      execPath: '/opt/taliesin/taliesin',
      readdir: async () => ['creidhne'],
      isExecutable: async () => false
    })
    await expect(launchCompanion(probe, 'creidhne', null)).resolves.toEqual({
      ok: false,
      reason: 'not-executable',
      target: join('/opt/taliesin', 'creidhne')
    })
  })

  it('does not ask for an execute bit on a bundle or a desktop entry', async () => {
    // Neither is executable and neither is run directly, so the check would be a
    // false negative on both of the non-Windows platforms.
    const isExecutable = vi.fn(async () => false)
    const probe = makeProbe({
      platform: 'darwin',
      execPath: '/Applications/Taliesin.app/Contents/MacOS/Taliesin',
      env: { HOME: '/Users/a' },
      readdir: async (dir) => (dir === '/Applications' ? ['Creidhne.app'] : []),
      isExecutable
    })
    const result = await launchCompanion(probe, 'creidhne', null)
    expect(result.ok).toBe(true)
    expect(isExecutable).not.toHaveBeenCalled()
  })

  it('reports an OS launch failure with its message', async () => {
    const probe = makeProbe({
      readdir: async () => ['creidhne.exe'],
      launch: async () => {
        throw new Error('EACCES')
      }
    })
    const result = await launchCompanion(probe, 'creidhne', null)
    expect(result).toMatchObject({ ok: false, reason: 'launch-failed', message: 'EACCES' })
  })
})

describe('pickerFilters', () => {
  it('offers each platform something it can actually select', () => {
    // The old picker filtered for `exe` everywhere, which is why the setting
    // could not be POPULATED on macOS or Linux — a `.app` is a directory and an
    // AppImage has no `.exe` in sight.
    expect(pickerFilters('win32')[0].extensions).toContain('exe')
    expect(pickerFilters('darwin')[0].extensions).toContain('app')
    expect(pickerFilters('linux')[0].extensions).toContain('AppImage')
  })
})
