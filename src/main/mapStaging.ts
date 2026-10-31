import { promises as fs } from 'fs'
import { join, normalize } from 'path'
import { buildSection, listSectionFiles, type MapDetail } from '@eriscorp/hybindex-ts'
import { MAP_REFERENCE_SECTIONS, referencedNames } from './mapReferences'

/**
 * Staging for map XML (HTOO-634), as Creidhne stages its sixteen types
 * (HTOO-453).
 *
 * A staged file lives in `<world>/.staging/<type>/`, with the same layout as
 * `<world>/xml/<type>/`. The server loads from `<world>/xml`, and hybindex walks
 * `xml/<type>/` only, so neither of them sees a staged file. Release moves the
 * file back to the same relative path under `xml/<type>/`.
 *
 * Only the XML is staged. The `.map` file stays in `mapfiles/`: the server opens
 * `lod{Id}.map` only for a map that it loaded from XML, so a `.map` with no live
 * XML does nothing.
 *
 * Creidhne reads the same folder. It indexes the staged maps and releases them
 * when a released file names one (HTOO-636).
 */

/** The folder, next to `xml/`, that holds staged files. */
export const STAGING_DIR = '.staging'

/** `<world>/xml` → `<world>/.staging`. */
export function stagingRootFor(libraryPath: string): string {
  return normalize(join(libraryPath, '..', STAGING_DIR))
}

/** One staged map XML, as the Maps page lists it. */
export interface StagedMap {
  /** Relative to `.staging/maps/`, forward-slashed. */
  rel: string
  /** From the map's own `<Name>`. Absent when hybindex gives the file no
   *  detail: a map with no Id, X or Y. */
  name?: string
  id?: number
  /** The decoded `<MapTarget>` names of the map's warps, each one once. */
  targets: string[]
}

const WARP_RULES = MAP_REFERENCE_SECTIONS.find((s) => s.section === 'maps')!.rules

/**
 * The staged maps of a library. `libraryPath` is checked by the caller.
 *
 * The name and the Id come from hybindex's `buildSection` over the staging
 * root, so a staged map is parsed by the same rules as a live one. The warp
 * targets are what Release follows to find the staged maps a released map
 * needs. A staging root with no `maps/` folder gives an empty list.
 */
export async function listStagedMaps(
  libraryPath: string
): Promise<{ dir: string; files: StagedMap[] }> {
  const root = stagingRootFor(libraryPath)
  const { dir, active } = await listSectionFiles(root, 'maps')
  const { fields } = await buildSection(root, 'maps')
  const details = new Map(
    ((fields.mapDetails ?? []) as MapDetail[]).map((d) => [d.filename, d] as const)
  )
  const files: StagedMap[] = []
  for (const rel of active) {
    const d = details.get(rel)
    let targets: string[] = []
    try {
      const xml = await fs.readFile(join(dir, rel), 'utf8')
      targets = [...new Set(referencedNames(xml, WARP_RULES))].filter(Boolean)
    } catch {
      // An unreadable file has no warps to follow. Its move reports the error.
    }
    files.push({ rel, ...(d && { name: d.name, id: d.id }), targets })
  }
  return { dir: dir.replace(/\\/g, '/'), files }
}
