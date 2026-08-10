import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  isRemoteSession,
  resolveGpuOverride,
  shouldDisableHardwareAcceleration,
  REMOTE_SESSION_CSS
} from '../remoteSession'

/**
 * HTOO-325. The predicate takes its platform, environment and native signal as
 * arguments, so every case here is a plain call — no `process.env` mutation, no
 * electron, and no machine-dependent skip.
 *
 * **The negatives are the load-bearing half.** The card's verification section
 * says a local-only test proves nothing, because the local path must stay
 * unchanged. That is exactly what a test *can* prove, and what a run on an RDP
 * session cannot.
 */
describe('isRemoteSession', () => {
  it('is false on a local Windows console session', () => {
    // The whole of the local half. A regression here is a slower app on every
    // Windows desktop, with no error and nothing on screen to explain it.
    expect(isRemoteSession('win32', 'Console')).toBe(false)
  })

  it('is true in a Windows Remote Desktop session', () => {
    expect(isRemoteSession('win32', 'RDP-Tcp#42')).toBe(true)
  })

  it('treats an unset SESSIONNAME as local', () => {
    // Absent in some service and scheduled-task launch contexts. Unset is not
    // evidence of a remote session, and the safe default is to change nothing.
    expect(isRemoteSession('win32', undefined)).toBe(false)
    expect(isRemoteSession('win32', '')).toBe(false)
  })

  it('case-folds the console comparison', () => {
    // A strict compare fails in the bad direction: a differently-spelled `console`
    // would drop a LOCAL session to software rendering.
    expect(isRemoteSession('win32', 'console')).toBe(false)
    expect(isRemoteSession('win32', 'CONSOLE')).toBe(false)
  })

  it('never fires off SESSIONNAME on a non-Windows platform', () => {
    // `SESSIONNAME` means nothing outside Windows, so a version that "helpfully"
    // generalised the check would change rendering on the strength of a variable
    // that carries no signal there. xrdp, X2Go, VNC and Wayland-remote are a
    // recorded gap rather than something this handles.
    expect(isRemoteSession('linux', 'RDP-Tcp#1')).toBe(false)
    expect(isRemoteSession('darwin', 'RDP-Tcp#1')).toBe(false)
  })

  describe('the native SM_REMOTESESSION signal', () => {
    // Nothing supplies this in Taliesin yet — wiring it means a native module on
    // the pre-ready boot path. It is tested because it is the rule, and because
    // the ordering below is the part that would be got wrong later.

    it('is believed when it says remote, over a SESSIONNAME that says otherwise', () => {
      // The reconnect case, and the reason the native signal exists at all.
      // Windows writes SESSIONNAME at logon and never revises it, so reconnecting
      // to a console session over RDP leaves every process reporting `Console`.
      expect(isRemoteSession('win32', 'Console', true)).toBe(true)
    })

    it('is believed when it says LOCAL, over a SESSIONNAME that says remote', () => {
      // Authoritative in BOTH directions. A live "not remote" beats a stale
      // environment variable claiming otherwise.
      expect(isRemoteSession('win32', 'RDP-Tcp#7', false)).toBe(false)
    })

    it('falls through to SESSIONNAME when it has no opinion', () => {
      // `null` is "cannot answer" — a missing or unloadable native module — and
      // must not be read as "not remote".
      expect(isRemoteSession('win32', 'RDP-Tcp#7', null)).toBe(true)
      expect(isRemoteSession('win32', 'Console', null)).toBe(false)
    })
  })
})

describe('resolveGpuOverride', () => {
  it('reads unset and empty as no opinion', () => {
    expect(resolveGpuOverride(undefined)).toBeNull()
    expect(resolveGpuOverride('')).toBeNull()
  })

  it('reads 0 as off and anything else as on', () => {
    expect(resolveGpuOverride('0')).toBe(false)
    expect(resolveGpuOverride('1')).toBe(true)
    expect(resolveGpuOverride('true')).toBe(true)
  })

  it('does not let an unrecognised value fall through to detection', () => {
    // One rule rather than a list of accepted spellings. A value that fell through
    // would read as an override that silently did nothing, which is worse than
    // refusing it.
    expect(resolveGpuOverride('yes please')).toBe(true)
    expect(resolveGpuOverride('off')).toBe(true)
  })
})

describe('shouldDisableHardwareAcceleration', () => {
  it('follows detection when the override is unset', () => {
    expect(shouldDisableHardwareAcceleration('win32', { SESSIONNAME: 'Console' })).toBe(false)
    expect(shouldDisableHardwareAcceleration('win32', { SESSIONNAME: 'RDP-Tcp#3' })).toBe(true)
  })

  it('forces software rendering anywhere, which is how the remote path is exercised', () => {
    // Most machines have no RDP access, so this is how the branch is reachable at
    // all during development.
    expect(shouldDisableHardwareAcceleration('linux', { TALIESIN_DISABLE_GPU: '1' })).toBe(true)
    expect(shouldDisableHardwareAcceleration('darwin', { TALIESIN_DISABLE_GPU: 'yes' })).toBe(true)
  })

  it('forces hardware rendering back on inside a real remote session', () => {
    // The direction that matters in the field. There is deliberately no setting,
    // so this is a user's only recourse if detection is ever wrong for them.
    expect(
      shouldDisableHardwareAcceleration('win32', {
        SESSIONNAME: 'RDP-Tcp#3',
        TALIESIN_DISABLE_GPU: '0'
      })
    ).toBe(false)
  })

  it('beats the native signal too, not only SESSIONNAME', () => {
    // The override is the last word, or it is not an escape hatch.
    expect(shouldDisableHardwareAcceleration('win32', { TALIESIN_DISABLE_GPU: '0' }, true)).toBe(
      false
    )
  })
})

describe('REMOTE_SESSION_CSS', () => {
  it('suppresses the backdrop blur in both spellings', () => {
    expect(REMOTE_SESSION_CSS).toMatch(/backdrop-filter:\s*none\s*!important/)
    expect(REMOTE_SESSION_CSS).toMatch(/-webkit-backdrop-filter:\s*none\s*!important/)
  })

  it('is the mitigation the themes actually need', () => {
    // Not decoration: four of the six themes put backdropFilter on MuiPaper.root,
    // which backs Card, Dialog, Accordion and Menu. If that ever stops being true
    // this rule is dead weight — and if a seventh theme adds one, the rule already
    // covers it, because it is unconditional.
    const themes = ['chadul', 'danaan', 'grinneal', 'hybrasyl']
    for (const name of themes) {
      const src = readFileSync(
        join(import.meta.dirname, '..', '..', 'renderer', 'src', 'themes', `${name}.ts`),
        'utf8'
      )
      expect(src, `${name} no longer declares a backdrop blur`).toMatch(/backdropFilter/)
    }
  })
})

describe('the call-site position in index.ts', () => {
  // `app.disableHardwareAcceleration()` after the `ready` event does not throw and
  // does not warn in a way anybody reads — it simply stops working. So a later
  // boot reordering would leave the module, these tests and the card all
  // describing a fix that is no longer happening, with every gate green. This is
  // the only guard that can see it.
  const INDEX = join(import.meta.dirname, '..', 'index.ts')

  /**
   * Comments stripped before measuring.
   *
   * **Measured on Taliesin's file rather than assumed either way: the raw file
   * currently passes too**, because nothing above the call happens to name
   * `whenReady`. Epona's does not — it measured `whenReady` at offset 2363 inside
   * a comment against the call at 3838, so the naive assertion FAILS there on
   * correct code, and a test that fails on a correct file gets deleted rather than
   * fixed.
   *
   * The stripping is kept because the order in which prose and code mention a
   * symbol is not a property anybody maintains. One comment added above the call
   * that mentions `whenReady` would turn this guard into a false alarm, and a
   * false alarm on a silent-failure guard is how the guard gets removed.
   */
  function codeOnly(): string {
    return readFileSync(INDEX, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
  }

  it('disables hardware acceleration before app.whenReady()', () => {
    const code = codeOnly()
    const disable = code.indexOf('app.disableHardwareAcceleration()')
    const ready = code.indexOf('app.whenReady()')
    expect(disable, 'the call is gone from index.ts').toBeGreaterThan(-1)
    expect(ready, 'app.whenReady() is gone from index.ts').toBeGreaterThan(-1)
    expect(disable).toBeLessThan(ready)
  })

  it('strips comments, so prose above the call cannot invert the measurement', () => {
    // Pins the helper's behaviour rather than a claim about today's file. The
    // assertion above reads offsets out of source, so a comment mentioning
    // `whenReady` above the call would break it on correct code — which is what
    // happened to epona. The stripper is what makes that impossible.
    const stripped = codeOnly()
    expect(stripped).not.toMatch(/MUST be here, before the `ready` event/)
    expect(stripped).toContain('app.disableHardwareAcceleration()')
  })

  it('takes the single-instance lock before it too, which has the same silent failure', () => {
    // `app.setPath('userData', …)` and the lock keyed on it share this shape: both
    // are no-ops after ready rather than errors. They sit three lines apart, so one
    // reordering breaks both.
    const code = codeOnly()
    expect(code.indexOf("app.setPath('userData'")).toBeLessThan(
      code.indexOf('app.requestSingleInstanceLock()')
    )
    expect(code.indexOf('app.requestSingleInstanceLock()')).toBeLessThan(
      code.indexOf('app.whenReady()')
    )
  })
})
