// Remove the unpack folders that killed portable launches left in %TEMP%.
//
// The portable exe is an NSIS stub. It unpacks the app into its own
// `%TEMP%\ns*.tmp` folder, runs it with `ExecWait`, and deletes that folder when
// the app exits. It cleans up after a normal close, after a second launch that
// loses the single-instance lock, and after the app crashes or is killed —
// measured on oghma's own exe, 2026-09-27, because the stub is still waiting on
// the app in all three cases.
//
// **If the STUB itself is killed, nothing runs its `RMDir`.** The folder stays
// under a random name that no later launch reuses, holding the package, the
// scratch the extraction wrote, and the unpacked app itself. Taliesin sets
// `portable.unpackDirName: true` (HTOO-351, fault 2) so the unpack directory is
// unique per launch rather than per build, which is what stops a second launch
// deleting the running copy's directory — and which is why nothing reclaims a
// killed launch's folder by name. That trade is why this sweep exists.
//
// So a portable launch sweeps what earlier launches left. Each rule below is
// part of the safety case, which is why none of them is a shortcut:
//
//   - Only as the portable exe, and only when this process can find its OWN
//     unpack folder. A process that cannot identify itself cannot be sure it is
//     not about to delete itself, so it does nothing.
//   - Only `ns*.tmp` folders that hold `app\<our exe>` and
//     `app\resources\app.asar`. Another app's leftovers are not ours to delete.
//   - Only folders older than `MIN_AGE_MS`. A second launch unpacks for seconds
//     before anything in its folder is locked.
//   - RENAME first, then delete. Windows refuses to rename a folder while a
//     running app's exe is mapped from it (EBUSY) or its stub holds it (EPERM),
//     measured on the real exe. A refused rename means "in use", and the folder
//     is skipped. Deleting straight away would half-delete a running copy.
//
// It runs in the background after boot and never throws: a sweep that fails
// costs disk space, not a working app.
//
// **In Electron, pass `original-fs`, never the patched `fs`.** Electron's `fs`
// treats any path ending in `app.asar` as an archive: touching a leftover's
// `app.asar` opens it and caches the handle, and Windows then refuses the
// rename because this process holds the file. Oghma's first packaged build of
// this sweep skipped every real leftover as "in use" for that reason, while
// every unit test passed under plain Node, which has no asar patch. The
// signature check below reads directory listings only, so it never opens
// `app.asar` even under the patched `fs` (HTOO-494).

import { promises as nodeFs } from 'fs'
import { basename, dirname, join } from 'path'

/**
 * The file operations the sweep uses. Electron's `original-fs` promises API and
 * Node's `fs.promises` both fit, which is what lets a test drive it.
 */
export interface SweepFs {
  readdir(path: string): Promise<string[]>
  lstat(
    path: string
  ): Promise<{ isDirectory(): boolean; isSymbolicLink(): boolean; mtimeMs: number }>
  rename(from: string, to: string): Promise<void>
  rm(
    path: string,
    opts: { recursive: boolean; force: boolean; maxRetries: number; retryDelay: number }
  ): Promise<void>
}

/**
 * NSIS names the folder `ns` + a few hex digits + `.tmp`. The digit count
 * varies — `nskBBD.tmp` and `nsm78D5.tmp` were both seen — so the pattern does
 * not fix it.
 */
const NS_DIR = /^ns[0-9a-z]+\.tmp$/i

/** A folder younger than this may belong to a launch that is still unpacking. */
export const MIN_AGE_MS = 10 * 60 * 1000

/** The suffix a folder gets once the rename has proved nothing uses it. */
const SWEEP_SUFFIX = '.taliesin-sweep'

export interface SweepOptions {
  /** `process.execPath`: `<TEMP>\nsXXXX.tmp\app\taliesin.exe` in a portable run. */
  execPath: string
  /** True when the NSIS stub launched us. It sets `PORTABLE_EXECUTABLE_DIR`. */
  isPortable: boolean
  now?: number
  /** `original-fs` in Electron (see above); Node's `fs.promises` by default. */
  fs?: SweepFs
  onError?: (message: string) => void
}

export interface SweepResult {
  removed: string[]
  /** Folders that matched but were in use or too new. */
  skipped: string[]
}

/**
 * This process's own unpack folder, or null when the path is not the shape a
 * portable launch has.
 */
export function ownUnpackDir(execPath: string): string | null {
  const appDir = dirname(execPath)
  if (basename(appDir).toLowerCase() !== 'app') return null
  const nsDir = dirname(appDir)
  return NS_DIR.test(basename(nsDir)) ? nsDir : null
}

/** The names in a folder, lower-cased, or none when it cannot be read. */
async function namesIn(fs: SweepFs, dir: string): Promise<Set<string>> {
  try {
    return new Set((await fs.readdir(dir)).map((name) => name.toLowerCase()))
  } catch {
    return new Set()
  }
}

/**
 * True when the folder holds a copy of THIS app, and not another app's unpack.
 * Directory listings only: nothing here stats or opens `app.asar` itself.
 */
async function isOurUnpack(fs: SweepFs, dir: string, exeName: string): Promise<boolean> {
  return (
    (await namesIn(fs, join(dir, 'app'))).has(exeName.toLowerCase()) &&
    (await namesIn(fs, join(dir, 'app', 'resources'))).has('app.asar')
  )
}

export async function sweepPortableLeftovers(options: SweepOptions): Promise<SweepResult> {
  const result: SweepResult = { removed: [], skipped: [] }
  if (!options.isPortable) return result
  const own = ownUnpackDir(options.execPath)
  if (own === null) return result

  const now = options.now ?? Date.now()
  const fs = options.fs ?? nodeFs
  const report = options.onError ?? ((): void => undefined)
  const temp = dirname(own)
  const exeName = basename(options.execPath)

  let entries: string[]
  try {
    entries = await fs.readdir(temp)
  } catch (error) {
    report(`cannot read ${temp}: ${(error as Error).message}`)
    return result
  }

  for (const name of entries) {
    if (!NS_DIR.test(name)) continue
    const dir = join(temp, name)
    if (dir.toLowerCase() === own.toLowerCase()) continue
    try {
      const stat = await fs.lstat(dir)
      // A link could point anywhere, so only a real folder is a stub's leftover.
      if (!stat.isDirectory() || stat.isSymbolicLink()) continue
      if (!(await isOurUnpack(fs, dir, exeName))) continue
      if (now - stat.mtimeMs < MIN_AGE_MS) {
        result.skipped.push(dir)
        continue
      }
      const claimed = dir + SWEEP_SUFFIX
      try {
        await fs.rename(dir, claimed)
      } catch {
        // In use: a running copy, or a stub that is still alive.
        result.skipped.push(dir)
        continue
      }
      await fs.rm(claimed, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
      result.removed.push(dir)
    } catch (error) {
      report(`${dir}: ${(error as Error).message}`)
    }
  }

  // A sweep stopped after its rename leaves `<name>.taliesin-sweep` behind.
  // Nothing runs from a renamed folder, so any later launch can finish the job.
  for (const name of entries) {
    if (!name.endsWith(SWEEP_SUFFIX) || !NS_DIR.test(name.slice(0, -SWEEP_SUFFIX.length))) continue
    const dir = join(temp, name)
    try {
      const stat = await fs.lstat(dir)
      if (!stat.isDirectory() || stat.isSymbolicLink()) continue
      await fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
      result.removed.push(dir)
    } catch (error) {
      report(`${dir}: ${(error as Error).message}`)
    }
  }
  return result
}
