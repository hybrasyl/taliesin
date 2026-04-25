/**
 * Archive extension inventory.
 *
 * Walks a DA client folder (top level + one level of subfolders), opens every
 * .dat archive with dalib-ts, and reports the distinct file extensions found
 * across all entries.
 *
 * Run: npx tsx scripts/discoverArchiveExtensions.ts <clientPath>
 *
 * Output: a markdown-style report grouped by extension, listing the source
 * archives and entry counts. Intended to inform which dalib-ts parsers to
 * wire into ArchiveBrowser's classifyEntry switch.
 */

import { promises as fs } from 'fs'
import { join, basename } from 'path'
import { DataArchive } from '@eriscorp/dalib-ts'

async function listDats(root: string): Promise<string[]> {
  const out: string[] = []
  let top
  try {
    top = await fs.readdir(root, { withFileTypes: true })
  } catch (e) {
    console.error(`Failed to read ${root}: ${(e as Error).message}`)
    return out
  }

  for (const entry of top) {
    const full = join(root, entry.name)
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.dat')) {
      out.push(full)
    } else if (entry.isDirectory()) {
      try {
        const inner = await fs.readdir(full, { withFileTypes: true })
        for (const e of inner) {
          if (e.isFile() && e.name.toLowerCase().endsWith('.dat')) {
            out.push(join(full, e.name))
          }
        }
      } catch {
        // ignore
      }
    }
  }
  return out
}

function getExt(name: string): string {
  const lower = name.toLowerCase()
  const dot = lower.lastIndexOf('.')
  return dot >= 0 ? lower.slice(dot) : '(none)'
}

async function main() {
  const clientPath = process.argv[2]
  if (!clientPath) {
    console.error('Usage: npx tsx scripts/discoverArchiveExtensions.ts <clientPath>')
    process.exit(1)
  }

  const dats = await listDats(clientPath)
  if (dats.length === 0) {
    console.error(`No .dat files found under ${clientPath}`)
    process.exit(1)
  }

  // ext -> Map<archiveName, count>
  const inventory = new Map<string, Map<string, number>>()
  let totalEntries = 0

  for (const datPath of dats) {
    const archiveName = basename(datPath)
    let arc
    try {
      const buf = await fs.readFile(datPath)
      arc = DataArchive.fromBuffer(new Uint8Array(buf))
    } catch (e) {
      console.error(`  ! Failed to open ${archiveName}: ${(e as Error).message}`)
      continue
    }

    for (const entry of arc.entries) {
      const ext = getExt(entry.entryName)
      let perArchive = inventory.get(ext)
      if (!perArchive) { perArchive = new Map(); inventory.set(ext, perArchive) }
      perArchive.set(archiveName, (perArchive.get(archiveName) ?? 0) + 1)
      totalEntries++
    }
  }

  // Report
  console.log(`# Archive extension inventory`)
  console.log(``)
  console.log(`Client: ${clientPath}`)
  console.log(`Archives scanned: ${dats.length}`)
  console.log(`Total entries: ${totalEntries}`)
  console.log(`Distinct extensions: ${inventory.size}`)
  console.log(``)

  const sorted = Array.from(inventory.entries()).sort((a, b) => {
    const ca = Array.from(a[1].values()).reduce((s, n) => s + n, 0)
    const cb = Array.from(b[1].values()).reduce((s, n) => s + n, 0)
    return cb - ca
  })

  for (const [ext, perArchive] of sorted) {
    const total = Array.from(perArchive.values()).reduce((s, n) => s + n, 0)
    console.log(`## ${ext}  (${total} entries across ${perArchive.size} archive${perArchive.size === 1 ? '' : 's'})`)
    const archs = Array.from(perArchive.entries()).sort((a, b) => b[1] - a[1])
    for (const [arc, count] of archs) {
      console.log(`  - ${arc}: ${count}`)
    }
    console.log(``)
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
