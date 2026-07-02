/**
 * Small JSON-on-disk helpers shared by the IPC handlers. Every handler that
 * persists config/state repeated the same read-or-default, mkdir+stringify+write,
 * or scan-a-dir-of-json boilerplate; these collapse it into one place.
 *
 * Path safety is the caller's responsibility — pass paths already validated with
 * assertInside / assertInsideAnyRoot. Validation on save (zod via parseOrLog)
 * also stays at the call site, since it needs the handler context + channel name.
 */
import { promises as fs } from 'fs'
import { dirname, join } from 'path'

/** Read + JSON.parse a file, returning `fallback` on any error (missing/malformed). */
export async function readJsonOr<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(path, 'utf-8')) as T
  } catch {
    return fallback
  }
}

/** JSON.stringify (2-space) to a file, creating the parent directory first. */
export async function writeJsonFile(path: string, data: unknown): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true })
  await fs.writeFile(path, JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * Scan a directory for `*.json` files, parse each, and map it via `pick`. Files
 * that fail to read/parse — or that `pick` maps to null — are skipped, and a
 * missing/unreadable directory yields `[]`. `ensure` mkdir's the dir first (for
 * dirs the app owns and may not have created yet). Results are returned in
 * readdir order; sort at the call site if needed.
 *
 * `dir` may be a thunk; if it throws (e.g. a path-safety assertion on an
 * out-of-root path) the scan yields `[]` too, matching handlers that fail soft.
 */
export async function scanJsonDir<T>(
  dir: string | (() => string),
  pick: (data: unknown, filename: string) => T | null,
  opts?: { ensure?: boolean }
): Promise<T[]> {
  const out: T[] = []
  try {
    const resolved = typeof dir === 'function' ? dir() : dir
    if (opts?.ensure) await fs.mkdir(resolved, { recursive: true })
    const entries = await fs.readdir(resolved, { withFileTypes: true })
    for (const e of entries.filter((x) => x.isFile() && x.name.endsWith('.json'))) {
      try {
        const data = JSON.parse(await fs.readFile(join(resolved, e.name), 'utf-8'))
        const mapped = pick(data, e.name)
        if (mapped !== null) out.push(mapped)
      } catch {
        /* skip malformed */
      }
    }
  } catch {
    /* dir missing/unreadable */
  }
  return out
}
