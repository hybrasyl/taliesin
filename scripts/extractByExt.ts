/**
 * Extract every entry of a given extension from every .dat under a client
 * folder (one level deep). Useful for ad-hoc investigation of unfamiliar
 * extensions before deciding whether to wire up a parser.
 *
 * Run: npx tsx scripts/extractByExt.ts <clientPath> <ext> [outDir]
 */
import { promises as fs } from 'fs'
import { join, basename } from 'path'
import { DataArchive } from '@eriscorp/dalib-ts'

async function listDats(root: string): Promise<string[]> {
  const out: string[] = []
  const top = await fs.readdir(root, { withFileTypes: true })
  for (const e of top) {
    const full = join(root, e.name)
    if (e.isFile() && e.name.toLowerCase().endsWith('.dat')) out.push(full)
    else if (e.isDirectory()) {
      try {
        const inner = await fs.readdir(full, { withFileTypes: true })
        for (const ie of inner) {
          if (ie.isFile() && ie.name.toLowerCase().endsWith('.dat')) out.push(join(full, ie.name))
        }
      } catch { /* ignore */ }
    }
  }
  return out
}

async function main() {
  const clientPath = process.argv[2]
  const ext = process.argv[3]
  const outDir = process.argv[4] ?? `/tmp/${(ext ?? 'unknown').replace(/^\./, '')}-probe`
  if (!clientPath || !ext) {
    console.error('Usage: npx tsx scripts/extractByExt.ts <clientPath> <ext> [outDir]')
    process.exit(1)
  }
  const normExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`

  await fs.mkdir(outDir, { recursive: true })
  const dats = await listDats(clientPath)
  let total = 0
  for (const datPath of dats) {
    const arcName = basename(datPath)
    let arc
    try { arc = DataArchive.fromBuffer(new Uint8Array(await fs.readFile(datPath))) }
    catch { continue }
    for (const entry of arc.entries) {
      if (!entry.entryName.toLowerCase().endsWith(normExt)) continue
      const data = entry.toUint8Array()
      const dest = join(outDir, `${arcName}__${entry.entryName}`)
      await fs.writeFile(dest, data)
      console.log(`extracted: ${dest} (${data.length} bytes)`)
      total++
    }
  }
  console.log(`\n${total} ${normExt} entries extracted to ${outDir}`)
}

main().catch(e => { console.error(e); process.exit(1) })
