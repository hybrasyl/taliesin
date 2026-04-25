/**
 * One-shot: extract all .bik entries from Legend.dat for ffmpeg probing.
 * Run: npx tsx scripts/extractBiks.ts <clientPath> <outDir>
 */
import { promises as fs } from 'fs'
import { join } from 'path'
import { DataArchive } from '@eriscorp/dalib-ts'

async function main() {
  const clientPath = process.argv[2]
  const outDir = process.argv[3] ?? '/tmp/bik-probe'
  if (!clientPath) {
    console.error('Usage: npx tsx scripts/extractBiks.ts <clientPath> [outDir]')
    process.exit(1)
  }

  await fs.mkdir(outDir, { recursive: true })
  const buf = await fs.readFile(join(clientPath, 'Legend.dat'))
  const arc = DataArchive.fromBuffer(new Uint8Array(buf))
  const biks = arc.entries.filter((e) => e.entryName.toLowerCase().endsWith('.bik'))

  for (const e of biks) {
    const data = e.toUint8Array()
    const dest = join(outDir, e.entryName)
    await fs.writeFile(dest, data)
    console.log(`extracted: ${dest} (${data.length} bytes)`)
  }
  if (biks.length === 0) console.log('No .bik entries found')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
