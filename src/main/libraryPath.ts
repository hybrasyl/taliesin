import { join } from 'path'
import { promises as fs } from 'fs'

/**
 * Given any folder the user selected, resolve to the canonical world/xml/ path
 * that hybindex-ts / Creidhne use as the library path.
 *
 * Checks three common levels the user might have picked:
 *   world/xml/   → return as-is
 *   world/       → return join(selected, 'xml')
 *   repo root    → return join(selected, 'world', 'xml')
 *
 * Uses .creidhne presence and characteristic xml subdirectories as signals.
 * Returns null if the folder doesn't appear to be a valid Hybrasyl library.
 */
export async function resolveLibraryPath(selected: string): Promise<string | null> {
  const probe = async (p: string): Promise<boolean> => {
    try { await fs.access(p); return true } catch { return false }
  }

  const norm = selected.replace(/[\\/]+$/, '')
  const folderName = norm.split(/[\\/]/).pop()?.toLowerCase() ?? ''

  if (
    await probe(join(norm, '..', '.creidhne')) ||
    folderName === 'xml' ||
    (await probe(join(norm, 'maps')) && await probe(join(norm, 'npcs')))
  ) {
    return norm
  }

  if (await probe(join(norm, '.creidhne')) || await probe(join(norm, 'xml'))) {
    return join(norm, 'xml')
  }

  if (await probe(join(norm, 'world', '.creidhne')) || await probe(join(norm, 'world', 'xml'))) {
    return join(norm, 'world', 'xml')
  }

  return null
}
